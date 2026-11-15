/**
 * Sincroniza as vendas do CRM com a conversao offline "Compra paga (CRM)" do Google Ads.
 *  1) registra em google_ads_offline_conversions os pedidos recentes (com ou sem gclid);
 *  2) pedido PAGO ainda nao enviado -> Data Manager API (e-mail/celular em SHA-256 + gclid se houver);
 *  3) pedido ja enviado que depois foi cancelado/devolvido -> RETRACTION (Google Ads API, por orderId).
 * Idempotente (transactionId/orderId = numero do pedido + unique por pedido). Sem offline_conversion_action_id, nao faz nada.
 * O Google so atribui ao anuncio quem ele conseguir casar com um clique; pedido organico e descartado por ele.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadCredentials } from "./google-ads-api.ts";
import { uploadConversionAdjustments } from "./google-ads-offline-api.ts";
import { buildRetraction, classifyUploadError, conversionValue, orderKind, parsePartialFailure, parseUtmCampaign } from "./google-ads-offline-core.ts";
import { buildDmEvent, buildDmRequest, dataManagerCredentials, ingestEvents } from "./google-ads-offline-dm.ts";

const LOOKBACK_DAYS = 85;
/** Campanhas religadas em 09/11/2026; pedidos anteriores nao vieram de clique recente. */
const FLOOR = "2026-11-09T00:00:00-03:00";
const MAX_ATTEMPTS = 6;
const BATCH = 50;

interface OrderRow { order_number: string; status_name: string | null; created_at_remote: string; totals_json: { total?: unknown; shipping?: unknown } | null; utm: string | null; email: string | null; phone: string | null }
interface TrackRow { id: string; order_number: string; gclid: string | null; value: number; conversion_time: string; li_status: string | null; status: string; attempts: number }

export interface OfflineResult { ok: boolean; skipped?: string; ingested?: number; uploaded?: number; retried?: number; failed?: number; retracted?: number; request_id?: string; error?: string }

export async function syncOfflineConversions(supabase: SupabaseClient, accountId: string, opts: { validateOnly?: boolean; now?: Date } = {}): Promise<OfflineResult> {
  const now = opts.now ?? new Date();
  try {
    const { data: acc, error: accErr } = await supabase.from("google_ads_accounts")
      .select("tenant_id, customer_id, login_customer_id, offline_conversion_action_id").eq("id", accountId).maybeSingle();
    if (accErr || !acc) throw new Error(accErr?.message ?? "conta nao encontrada");
    if (!acc.offline_conversion_action_id) return { ok: true, skipped: "conta sem offline_conversion_action_id" };

    const creds = { ...loadCredentials(), ...(acc.login_customer_id ? { loginCustomerId: acc.login_customer_id as string } : {}) };
    const dmCreds = dataManagerCredentials(creds);
    if (!dmCreds) return { ok: true, skipped: "sem GOOGLE_DM_REFRESH_TOKEN" };
    const lookback = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
    const since = new Date(Math.max(lookback.getTime(), new Date(FLOOR).getTime())).toISOString();

    // 1) pedidos -> tabela de controle
    const { data: orders, error: oErr } = await supabase.from("li_orders")
      .select("order_number, status_name, created_at_remote, totals_json, utm:raw_json->>utm_campaign, email:raw_json->cliente->>email, phone:raw_json->cliente->>telefone_celular")
      .eq("tenant_id", acc.tenant_id).gte("created_at_remote", since).limit(2000);
    if (oErr) throw new Error(oErr.message);
    const orderMap = new Map(((orders ?? []) as OrderRow[]).map((o) => [o.order_number, o]));

    const { data: tracked, error: tErr } = await supabase.from("google_ads_offline_conversions")
      .select("id, order_number, gclid, value, conversion_time, li_status, status, attempts").eq("account_id", accountId).gte("conversion_time", since).limit(5000);
    if (tErr) throw new Error(tErr.message);
    const byOrder = new Map(((tracked ?? []) as TrackRow[]).map((t) => [t.order_number, t]));

    const fresh: Record<string, unknown>[] = [];
    for (const o of orderMap.values()) {
      const p = parseUtmCampaign(o.utm);
      const utm = (o.utm ?? "").trim();
      const campaignId = p?.campaignId ?? (/^\d{5,}$/.test(utm) ? utm : null);
      const row = byOrder.get(o.order_number);
      if (!row) {
        fresh.push({
          tenant_id: acc.tenant_id, account_id: accountId, order_number: o.order_number, campaign_id: campaignId ? Number(campaignId) : null,
          gclid: p?.gclid ?? null, value: conversionValue(o.totals_json), conversion_time: o.created_at_remote, li_status: o.status_name,
          status: orderKind(o.status_name) === "retract" ? "skipped" : "waiting",
        });
      } else if (row.li_status !== o.status_name && !opts.validateOnly) {
        await supabase.from("google_ads_offline_conversions").update({ li_status: o.status_name, updated_at: now.toISOString() }).eq("id", row.id);
        row.li_status = o.status_name;
      }
    }
    if (fresh.length && !opts.validateOnly) {
      const { error } = await supabase.from("google_ads_offline_conversions").upsert(fresh, { onConflict: "account_id,order_number", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    const { data: rows, error: rErr } = await supabase.from("google_ads_offline_conversions")
      .select("id, order_number, gclid, value, conversion_time, li_status, status, attempts")
      .eq("account_id", accountId).in("status", ["waiting", "uploaded"]).lt("attempts", MAX_ATTEMPTS).limit(BATCH * 4);
    if (rErr) throw new Error(rErr.message);

    // em validate_only os pedidos novos nao foram gravados: testa com eles mesmos
    const all = opts.validateOnly ? [...((rows ?? []) as TrackRow[]), ...fresh.map((f) => ({ ...f, id: "", attempts: 0 }) as unknown as TrackRow)] : (rows ?? []) as TrackRow[];
    const toUpload = all.filter((r) => r.status === "waiting" && orderKind(r.li_status) === "paid").slice(0, BATCH);
    const toRetract = all.filter((r) => r.status === "uploaded" && orderKind(r.li_status) === "retract").slice(0, BATCH);
    const out: OfflineResult = { ok: true, ingested: fresh.length, uploaded: 0, retried: 0, failed: 0, retracted: 0 };
    const stamp = now.toISOString();
    const actionId = acc.offline_conversion_action_id as number;

    // 2) envio pela Data Manager (fast-fail: o lote inteiro entra ou nada entra)
    const ready: { row: TrackRow; event: Record<string, unknown> }[] = [];
    for (const r of toUpload) {
      const o = orderMap.get(r.order_number);
      const event = await buildDmEvent({ orderNumber: r.order_number, value: Number(r.value), time: new Date(r.conversion_time), email: o?.email, phone: o?.phone, gclid: r.gclid });
      if (event) ready.push({ row: r, event });
      else if (!opts.validateOnly) {
        out.failed!++;
        await supabase.from("google_ads_offline_conversions").update({ status: "failed", last_error: "sem e-mail/celular/gclid", updated_at: stamp }).eq("id", r.id);
      }
    }
    if (ready.length) {
      const body = buildDmRequest({ customerId: acc.customer_id, loginCustomerId: creds.loginCustomerId, actionId, events: ready.map((x) => x.event), validateOnly: !!opts.validateOnly });
      try {
        const res = await ingestEvents(dmCreds, body);
        out.request_id = res.requestId;
        if (opts.validateOnly) out.uploaded = ready.length;
        else {
          for (const { row } of ready) {
            out.uploaded!++;
            await supabase.from("google_ads_offline_conversions").update({ status: "uploaded", uploaded_at: stamp, attempts: row.attempts + 1, last_error: res.requestId ? `req ${res.requestId}` : null, updated_at: stamp }).eq("id", row.id);
          }
        }
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        if (opts.validateOnly) throw e;
        for (const { row } of ready) {
          out.retried!++;
          await supabase.from("google_ads_offline_conversions").update({ attempts: row.attempts + 1, last_error: msg, updated_at: stamp }).eq("id", row.id);
        }
        out.ok = false;
        out.error = msg;
      }
    }

    // 3) retratar o que foi enviado e depois cancelado
    if (toRetract.length) {
      const body = await uploadConversionAdjustments(creds, acc.customer_id, toRetract.map((r) => buildRetraction({ actionId, customerId: acc.customer_id, orderNumber: r.order_number, time: now })), !!opts.validateOnly);
      if (!opts.validateOnly) {
        const errs = parsePartialFailure(body);
        for (const [i, r] of toRetract.entries()) {
          const e = errs.get(i);
          const verdict = e ? classifyUploadError(e.code) : "ok";
          if (verdict === "ok") { out.retracted!++; await supabase.from("google_ads_offline_conversions").update({ status: "retracted", retracted_at: stamp, updated_at: stamp }).eq("id", r.id); }
          else await supabase.from("google_ads_offline_conversions").update({ attempts: r.attempts + 1, last_error: `${e!.code}: ${e!.message}`.slice(0, 300), updated_at: stamp }).eq("id", r.id);
        }
      }
    }
    return out;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
