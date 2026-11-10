/**
 * Escrita CONTROLADA de construcao no Google Ads: palavras negativas e reconstrucao da estrutura de campanhas de Pesquisa
 * (palavras-chave novas, religar anuncios pausados, criar anuncio responsivo). Mesmas regras do apply de orcamento:
 * so fora do modo read_only, estado lido do Google antes e depois, tudo no audit_log com os recursos criados (para desfazer),
 * e as mudancas de uma operacao sao atomicas (o Google aplica todas ou nenhuma).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { gaqlSearch, mutateResource, type GoogleAdsCredentials } from "./google-ads-api.ts";
import { BUILD, norm, validateKeywordText, validateRsa, type MatchType, type RsaDraft } from "./google-ads-build-core.ts";
import type { Row } from "./google-ads-deep-types.ts";
import { allowedHostsFrom, checkUrls } from "./google-ads-url-check.ts";
import { resolveBrandTerms } from "./google-ads-insights-runner.ts";

export interface BuildOutcome { ok: boolean; error?: string; detail?: Record<string, unknown> }

interface Ctx { supabase: SupabaseClient; creds: GoogleAdsCredentials; customerId: string; accountId: string; tenantId: string; actor: string; recommendationId?: string | null }

async function loadCtx(supabase: SupabaseClient, creds: GoogleAdsCredentials, a: { accountId: string; tenantId: string; actor: string; recommendationId?: string | null }):
  Promise<{ ctx: Ctx; mode: string; brand: string[] } | { error: string }> {
  const { data: acc } = await supabase.from("google_ads_accounts")
    .select("customer_id, login_customer_id, mode, descriptive_name, guardrails").eq("id", a.accountId).eq("tenant_id", a.tenantId).maybeSingle();
  if (!acc) return { error: "Conta nao encontrada" };
  const c = { ...creds, loginCustomerId: acc.login_customer_id ?? creds.loginCustomerId };
  return { ctx: { supabase, creds: c, customerId: acc.customer_id, ...a }, mode: acc.mode, brand: resolveBrandTerms(acc.guardrails, acc.descriptive_name) };
}

const READ_ONLY = "A conta esta em modo somente leitura. Mude para 'com aprovacao' antes de aplicar.";
const q = (c: Ctx, query: string): Promise<Row[]> => gaqlSearch(c.creds, c.customerId, query) as Promise<Row[]>;
const audit = (c: Ctx, entity: string, before: unknown, after: unknown, action: "apply" | "revert" = "apply") =>
  c.supabase.from("google_ads_audit_log").insert({
    tenant_id: c.tenantId, account_id: c.accountId, recommendation_id: c.recommendationId ?? null, actor: c.actor, action, entity, before_state: before, after_state: after,
  });
const names = (res: unknown): string[] => ((res as { results?: Array<{ resourceName?: string }> })?.results ?? []).map((r) => r.resourceName ?? "").filter(Boolean);

// ---------------------------------------------------------------------------
// Palavras negativas (campanha, correspondencia EXATA)
// ---------------------------------------------------------------------------
export async function applyNegatives(
  supabase: SupabaseClient, creds: GoogleAdsCredentials,
  a: { accountId: string; tenantId: string; actor: string; recommendationId?: string | null; campaignId: number; terms: string[] },
): Promise<BuildOutcome> {
  const l = await loadCtx(supabase, creds, a);
  if ("error" in l) return { ok: false, error: l.error };
  const { ctx, mode, brand } = l;
  if (mode === "read_only") return { ok: false, error: READ_ONLY };
  if (!a.terms.length || a.terms.length > BUILD.maxNegativesPerRun) return { ok: false, error: `Informe de 1 a ${BUILD.maxNegativesPerRun} termos` };

  const clean: string[] = [];
  for (const t of a.terms) {
    const v = validateKeywordText(t);
    if (!v.ok) return { ok: false, error: `"${t}": ${v.error}` };
    if (brand.some((b) => norm(v.text).includes(norm(b)))) return { ok: false, error: `"${t}" contem a marca: negativar isso bloquearia buscas de clientes. Remova da lista.` };
    clean.push(v.text);
  }
  const camp = (await q(ctx, `SELECT campaign.status FROM campaign WHERE campaign.id = ${Math.trunc(a.campaignId)}`))[0];
  if (!camp) return { ok: false, error: "Campanha nao encontrada no Google Ads" };
  if (camp.campaign?.status === "REMOVED") return { ok: false, error: "Campanha removida" };

  const existing = new Set((await q(ctx, `SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = ${Math.trunc(a.campaignId)} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`))
    .map((r) => norm(String(r.campaignCriterion?.keyword?.text ?? ""))));
  const toAdd = [...new Map(clean.filter((t) => !existing.has(norm(t))).map((t) => [norm(t), t])).values()];
  if (!toAdd.length) return { ok: false, error: "Todos esses termos ja sao negativos nesta campanha" };

  let created: string[];
  try {
    created = names(await mutateResource(ctx.creds, ctx.customerId, "campaignCriteria:mutate", toAdd.map((text) => ({
      create: { campaign: `customers/${ctx.customerId}/campaigns/${Math.trunc(a.campaignId)}`, negative: true, keyword: { text, matchType: "EXACT" } },
    }))));
  } catch (e) { return { ok: false, error: `O Google Ads recusou: ${(e as Error).message}` }; }

  const after = new Set((await q(ctx, `SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = ${Math.trunc(a.campaignId)} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`))
    .map((r) => norm(String(r.campaignCriterion?.keyword?.text ?? ""))));
  const confirmed = toAdd.every((t) => after.has(norm(t)));
  await audit(ctx, `negatives:${a.campaignId}`, { added: [] }, { terms: toAdd, resources: created, confirmed });
  if (!confirmed) return { ok: false, error: "O Google respondeu, mas nao consegui confirmar todos os termos. Confira a campanha.", detail: { terms: toAdd } };
  return { ok: true, detail: { terms: toAdd, count: toAdd.length } };
}

// ---------------------------------------------------------------------------
// Reconstruir estrutura de campanha de Pesquisa
// ---------------------------------------------------------------------------
export interface RebuildArgs {
  accountId: string; tenantId: string; actor: string; recommendationId?: string | null;
  campaignId: number; adGroupId: number;
  keywords: Array<{ text: string; match_type: MatchType }>;
  enableAdIds: number[];
  newAd: RsaDraft | null;
}

export async function applyRebuild(supabase: SupabaseClient, creds: GoogleAdsCredentials, a: RebuildArgs): Promise<BuildOutcome> {
  const l = await loadCtx(supabase, creds, a);
  if ("error" in l) return { ok: false, error: l.error };
  const { ctx, mode } = l;
  if (mode === "read_only") return { ok: false, error: READ_ONLY };
  const ag = `customers/${ctx.customerId}/adGroups/${Math.trunc(a.adGroupId)}`;

  const grp = (await q(ctx, `SELECT campaign.id, campaign.advertising_channel_type, campaign.status, ad_group.status FROM ad_group WHERE ad_group.id = ${Math.trunc(a.adGroupId)}`))[0];
  if (!grp || String(grp.campaign?.id) !== String(a.campaignId)) return { ok: false, error: "Grupo de anuncios nao encontrado nesta campanha" };
  if (grp.campaign?.advertisingChannelType !== "SEARCH") return { ok: false, error: "So campanhas de Pesquisa podem ser reconstruidas por aqui" };
  if (grp.campaign?.status === "REMOVED" || grp.adGroup?.status !== "ENABLED") return { ok: false, error: "Campanha removida ou grupo de anuncios nao esta ligado" };

  // Palavras: valida, tira repetidas e as que ja existem ligadas no grupo; recusa as que ja rodam em OUTRA campanha ligada.
  const kwExisting = new Set((await q(ctx, `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE ad_group.id = ${Math.trunc(a.adGroupId)} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED'`))
    .map((r) => `${norm(String(r.adGroupCriterion?.keyword?.text ?? ""))}|${r.adGroupCriterion?.keyword?.matchType}`));
  const { data: others } = await supabase.from("google_ads_keywords").select("text, campaign_id").eq("account_id", a.accountId).eq("status", "ENABLED").eq("negative", false).neq("campaign_id", a.campaignId).limit(1000);
  const used = new Set((others ?? []).map((k: { text: string }) => norm(k.text)));
  const kws: Array<{ text: string; matchType: MatchType }> = [];
  for (const k of a.keywords) {
    const v = validateKeywordText(k.text);
    if (!v.ok) return { ok: false, error: `"${k.text}": ${v.error}` };
    if (!["EXACT", "PHRASE", "BROAD"].includes(k.match_type)) return { ok: false, error: `Correspondencia invalida em "${k.text}"` };
    if (used.has(norm(v.text))) continue; // ja roda em outra campanha ligada: nao compete com voce mesmo
    if (kwExisting.has(`${norm(v.text)}|${k.match_type}`)) continue;
    if (!kws.some((x) => norm(x.text) === norm(v.text) && x.matchType === k.match_type)) kws.push({ text: v.text, matchType: k.match_type });
  }
  if (kws.length > BUILD.maxKeywordsPerCampaign) return { ok: false, error: `No maximo ${BUILD.maxKeywordsPerCampaign} palavras-chave por vez` };

  // Anuncios: religar so os pausados e nao reprovados; criar um novo so se o texto passar na validacao.
  const ads = await q(ctx, `SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.status, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ad_group.id = ${Math.trunc(a.adGroupId)} AND ad_group_ad.status != 'REMOVED'`);
  const byId = new Map(ads.map((r) => [String(r.adGroupAd?.ad?.id), r.adGroupAd]));
  for (const id of a.enableAdIds) {
    const ad = byId.get(String(id));
    if (!ad) return { ok: false, error: `Anuncio ${id} nao existe (ou foi removido) neste grupo` };
    if (ad.policySummary?.approvalStatus === "DISAPPROVED") return { ok: false, error: `Anuncio ${id} esta reprovado pelo Google: crie um novo` };
  }
  if (a.newAd) {
    const errs = validateRsa(a.newAd);
    if (errs.length) return { ok: false, error: `Anuncio novo invalido: ${errs.join("; ")}` };
  }
  // Pagina de destino: o Google reprova com DESTINATION_NOT_WORKING quando o robo de anuncios nao abre a pagina.
  // So abrimos enderecos dos dominios que a conta ja usa (protecao contra SSRF).
  const { data: known } = await supabase.from("google_ads_ads").select("final_url").eq("account_id", a.accountId).not("final_url", "is", null).limit(1000);
  const allowedHosts = allowedHostsFrom((known ?? []).map((k: { final_url: string | null }) => k.final_url));
  const urls: string[] = [];
  if (a.newAd) urls.push(a.newAd.final_url);
  for (const id of a.enableAdIds) { const u = byId.get(String(id))?.ad?.finalUrls?.[0]; if (u) urls.push(String(u)); }
  if (urls.length) {
    const checks = await checkUrls(urls, allowedHosts);
    const bad = [...checks.values()].find((c) => !c.ok);
    if (bad) return { ok: false, error: `A pagina de destino ${bad.url} nao esta funcionando para o Google: ${bad.reason}. Escolha outra URL ou corrija o site antes.` };
  }
  const liveAdsAfter = ads.filter((r) => r.adGroupAd?.status === "ENABLED" && r.adGroupAd?.policySummary?.approvalStatus !== "DISAPPROVED").length + a.enableAdIds.length + (a.newAd ? 1 : 0);
  if (liveAdsAfter < 1) return { ok: false, error: "Sem anuncio ligado ao final: gere o texto do anuncio novo antes de aplicar." };
  const kwLiveAfter = kwExisting.size + kws.length;
  if (kwLiveAfter < 1) return { ok: false, error: "Sem palavra-chave ao final: nenhuma palavra util restou (podem ja rodar em outra campanha)." };

  let kwRes: string[] = [];
  let adRes: string[] = [];
  try {
    if (kws.length) {
      kwRes = names(await mutateResource(ctx.creds, ctx.customerId, "adGroupCriteria:mutate", kws.map((k) => ({
        create: { adGroup: ag, status: "ENABLED", keyword: { text: k.text, matchType: k.matchType } },
      }))));
    }
    const adOps: Record<string, unknown>[] = a.enableAdIds.map((id) => ({
      update: { resourceName: `customers/${ctx.customerId}/adGroupAds/${Math.trunc(a.adGroupId)}~${Math.trunc(id)}`, status: "ENABLED" }, updateMask: "status",
    }));
    if (a.newAd) {
      adOps.push({ create: { adGroup: ag, status: "ENABLED", ad: {
        finalUrls: [a.newAd.final_url],
        responsiveSearchAd: { headlines: a.newAd.headlines.map((text) => ({ text })), descriptions: a.newAd.descriptions.map((text) => ({ text })) },
      } } });
    }
    if (adOps.length) adRes = names(await mutateResource(ctx.creds, ctx.customerId, "adGroupAds:mutate", adOps));
  } catch (e) {
    if (kwRes.length) { // desfaz as palavras para nao deixar meia-construcao
      await mutateResource(ctx.creds, ctx.customerId, "adGroupCriteria:mutate", kwRes.map((remove) => ({ remove }))).catch(() => undefined);
    }
    return { ok: false, error: `O Google Ads recusou: ${(e as Error).message}` };
  }

  const kwNow = new Set((await q(ctx, `SELECT ad_group_criterion.keyword.text FROM ad_group_criterion WHERE ad_group.id = ${Math.trunc(a.adGroupId)} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status = 'ENABLED'`))
    .map((r) => norm(String(r.adGroupCriterion?.keyword?.text ?? ""))));
  const adsNow = await q(ctx, `SELECT ad_group_ad.ad.id, ad_group_ad.status FROM ad_group_ad WHERE ad_group.id = ${Math.trunc(a.adGroupId)} AND ad_group_ad.status = 'ENABLED'`);
  const confirmed = kws.every((k) => kwNow.has(norm(k.text))) && a.enableAdIds.every((id) => adsNow.some((r) => String(r.adGroupAd?.ad?.id) === String(id))) && (!a.newAd || adsNow.length >= a.enableAdIds.length + 1);
  const newAdRes = a.newAd ? adRes[adRes.length - 1] ?? null : null;
  await audit(ctx, `rebuild:${a.campaignId}`, { ad_group: ag, previous_status_of_enabled_ads: "PAUSED" },
    { keywords: kwRes, enabled_ads: a.enableAdIds, new_ad: newAdRes, keyword_texts: kws.map((k) => `${k.text} [${k.matchType}]`), confirmed });
  if (!confirmed) return { ok: false, error: "O Google respondeu, mas nao consegui confirmar tudo. Confira a campanha.", detail: { keywords: kws.length } };
  return { ok: true, detail: { keywords: kws.length, enabled_ads: a.enableAdIds.length, new_ad: !!a.newAd } };
}

// ---------------------------------------------------------------------------
// Meta de conversao: deixar de otimizar lances para uma categoria que nao e venda
// ---------------------------------------------------------------------------
const SAFE_GOAL_CATEGORIES = ["DOWNLOAD", "PHONE_CALL_LEAD", "CONTACT", "GET_DIRECTIONS", "PAGE_VIEW", "ENGAGEMENT", "BEGIN_CHECKOUT", "ADD_TO_CART"];

export async function applyConversionGoal(
  supabase: SupabaseClient, creds: GoogleAdsCredentials,
  a: { accountId: string; tenantId: string; actor: string; recommendationId?: string | null; category: string; origin: string },
): Promise<BuildOutcome> {
  const l = await loadCtx(supabase, creds, a);
  if ("error" in l) return { ok: false, error: l.error };
  const { ctx, mode } = l;
  if (mode === "read_only") return { ok: false, error: READ_ONLY };
  // Nunca desliga a meta de COMPRA: seria parar de otimizar para vendas.
  if (!SAFE_GOAL_CATEGORIES.includes(a.category) || !/^[A-Z_]+$/.test(a.origin)) return { ok: false, error: "Esta meta de conversao nao pode ser alterada pelo sistema (so as que nao sao venda)." };
  const read = async () => (await q(ctx, `SELECT customer_conversion_goal.biddable FROM customer_conversion_goal WHERE customer_conversion_goal.category = '${a.category}' AND customer_conversion_goal.origin = '${a.origin}'`))[0];
  const before = await read();
  if (!before) return { ok: false, error: "Meta de conversao nao encontrada no Google Ads" };
  const prev = before.customerConversionGoal?.biddable ?? null;
  if (prev === false) return { ok: false, error: "Esta meta ja esta desligada para otimizacao de lances" };
  try {
    await mutateResource(ctx.creds, ctx.customerId, "customerConversionGoals:mutate", {
      update: { resourceName: `customers/${ctx.customerId}/customerConversionGoals/${a.category}~${a.origin}`, biddable: false }, updateMask: "biddable",
    });
  } catch (e) { return { ok: false, error: `O Google Ads recusou: ${(e as Error).message}` }; }
  const after = await read();
  const confirmed = after?.customerConversionGoal?.biddable === false;
  await audit(ctx, `goal:${a.category}~${a.origin}`, { biddable: prev }, { biddable: false, confirmed });
  if (!confirmed) return { ok: false, error: "O Google respondeu, mas nao consegui confirmar a mudanca. Confira em Metas de conversao." };
  return { ok: true, detail: { category: a.category, origin: a.origin } };
}

// ---------------------------------------------------------------------------
// Desfazer (a partir do audit_log)
// ---------------------------------------------------------------------------
export async function revertBuild(
  supabase: SupabaseClient, creds: GoogleAdsCredentials,
  a: { accountId: string; tenantId: string; actor: string; auditId: string },
): Promise<BuildOutcome> {
  const { data: row } = await supabase.from("google_ads_audit_log").select("id, entity, action, before_state, after_state")
    .eq("id", a.auditId).eq("tenant_id", a.tenantId).eq("account_id", a.accountId).maybeSingle();
  const goal = /^goal:([A-Z_]+)~([A-Z_]+)$/.exec(row?.entity ?? "");
  if (row && row.action === "apply" && goal) {
    const lg = await loadCtx(supabase, creds, a);
    if ("error" in lg) return { ok: false, error: lg.error };
    if (lg.mode === "read_only") return { ok: false, error: READ_ONLY };
    try {
      await mutateResource(lg.ctx.creds, lg.ctx.customerId, "customerConversionGoals:mutate", {
        update: { resourceName: `customers/${lg.ctx.customerId}/customerConversionGoals/${goal[1]}~${goal[2]}`, biddable: true }, updateMask: "biddable",
      });
    } catch (e) { return { ok: false, error: `O Google Ads recusou: ${(e as Error).message}` }; }
    await audit(lg.ctx, row.entity as string, row.after_state, { reverted: true }, "revert");
    return { ok: true };
  }
  const m = /^(negatives|rebuild):(\d+)$/.exec(row?.entity ?? "");
  if (!row || row.action !== "apply" || !m) return { ok: false, error: "Registro nao pode ser desfeito" };
  const l = await loadCtx(supabase, creds, a);
  if ("error" in l) return { ok: false, error: l.error };
  const { ctx, mode } = l;
  if (mode === "read_only") return { ok: false, error: READ_ONLY };
  const st = row.after_state as { resources?: string[]; keywords?: string[]; new_ad?: string | null; enabled_ads?: number[] };
  const bs = row.before_state as { ad_group?: string };
  try {
    if (m[1] === "negatives") {
      if (st.resources?.length) await mutateResource(ctx.creds, ctx.customerId, "campaignCriteria:mutate", st.resources.map((remove) => ({ remove })));
    } else {
      const adOps: Record<string, unknown>[] = [];
      if (st.new_ad) adOps.push({ remove: st.new_ad });
      const agId = /adGroups\/(\d+)/.exec(bs.ad_group ?? "")?.[1];
      for (const id of st.enabled_ads ?? []) if (agId) adOps.push({ update: { resourceName: `customers/${ctx.customerId}/adGroupAds/${agId}~${id}`, status: "PAUSED" }, updateMask: "status" });
      if (adOps.length) await mutateResource(ctx.creds, ctx.customerId, "adGroupAds:mutate", adOps);
      if (st.keywords?.length) await mutateResource(ctx.creds, ctx.customerId, "adGroupCriteria:mutate", st.keywords.map((remove) => ({ remove })));
    }
  } catch (e) { return { ok: false, error: `O Google Ads recusou: ${(e as Error).message}` }; }
  await audit(ctx, row.entity as string, row.after_state, { reverted: true }, "revert");
  return { ok: true };
}
