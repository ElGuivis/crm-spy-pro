import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;
const BASE = "https://api.awsli.com.br";
const PAGE = 100;            // a API recusa páginas maiores
const PAGES_PER_RUN = 45;    // a loja limita 100 chamadas/min: deixa folga para os outros jobs
const RESCAN_MS = 24 * 3_600_000;

interface ScanState { integration_id: string; tenant_id: string; total: number; scan_no: number; next_offset: number; scanning: boolean; baseline_done: boolean; last_full_scan_at: string | null }

async function page(auth: string, limit: number, offset: number): Promise<{ total: number; rows: { id: number; email: string }[] }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${BASE}/v1/newsletter?limit=${limit}&offset=${offset}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`Loja Integrada respondeu ${res.status} na newsletter`);
    const j = await res.json() as { meta?: { total_count?: number }; objects?: { id: number; email: string }[] };
    return { total: j.meta?.total_count ?? 0, rows: (j.objects ?? []).filter((o) => o?.email && o?.id) };
  }
  throw new Error("Loja Integrada indisponível (limite de requisições)");
}

/**
 * Espelha a newsletter da loja. A API só lista por e-mail (100 por página, sem ordenar por data), então a detecção de
 * novos inscritos é uma varredura completa feita em fatias: roda quando o total muda ou 1 vez por dia.
 *  - 1ª varredura: todos viram "baseline" (só povoa; nada é enviado para eles);
 *  - depois: quem aparece de novo ganha um registro "welcome" (série de boas-vindas, se estiver ligada);
 *  - quem some em 2 varreduras seguidas saiu da newsletter da loja: entra na nossa lista de supressão.
 */
export async function runNewsletter(supabase: Supabase, integ: { id: string; tenant_id: string }, auth: string, log: { info: (...a: unknown[]) => void }) {
  await supabase.from("li_newsletter_scan_state").upsert({ integration_id: integ.id, tenant_id: integ.tenant_id }, { onConflict: "integration_id", ignoreDuplicates: true });
  const { data: st0 } = await supabase.from("li_newsletter_scan_state").select("*").eq("integration_id", integ.id).single();
  const state = st0 as ScanState;

  const head = await page(auth, 1, 0);
  const patch: Record<string, unknown> = { last_check_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  let scanning = state.scanning;
  let scanNo = state.scan_no;
  let offset = state.next_offset;

  if (!scanning) {
    const stale = !state.last_full_scan_at || Date.now() - Date.parse(state.last_full_scan_at) > RESCAN_MS;
    if (state.baseline_done && head.total === state.total && !stale) {
      await supabase.from("li_newsletter_scan_state").update(patch).eq("integration_id", integ.id);
      return { skipped: true, total: head.total };
    }
    scanning = true; scanNo += 1; offset = 0;
  }

  let fetched = 0, added = 0, finished = false;
  for (let i = 0; i < PAGES_PER_RUN; i++) {
    const { rows, total } = await page(auth, PAGE, offset);
    fetched += rows.length;
    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const { data: known } = await supabase.from("li_newsletter_subscribers").select("li_id").eq("integration_id", integ.id).in("li_id", ids);
      const knownIds = new Set((known ?? []).map((k) => Number(k.li_id)));
      const fresh = rows.filter((r) => !knownIds.has(r.id));
      if (knownIds.size) await supabase.from("li_newsletter_subscribers").update({ last_scan: scanNo, removed_at: null }).eq("integration_id", integ.id).in("li_id", [...knownIds]);
      if (fresh.length) {
        const baseline = !state.baseline_done;
        await supabase.from("li_newsletter_subscribers").upsert(fresh.map((r) => ({ integration_id: integ.id, tenant_id: integ.tenant_id, li_id: r.id, email: r.email.trim().toLowerCase(), is_baseline: baseline, last_scan: scanNo })), { onConflict: "integration_id,li_id", ignoreDuplicates: true }); // upsert: uma rodada simultânea não derruba esta
        added += fresh.length;
        if (!baseline) {
          const now = new Date().toISOString();
          await supabase.from("li_abandonment_campaigns").upsert(fresh.map((r) => ({
            tenant_id: integ.tenant_id, integration_id: integ.id, li_campaign_id: -r.id, automation_id: 0, kind: "welcome", li_status: "N", value: 0, items: [], product_ids: [],
            recipient_email: r.email.trim().toLowerCase(), event_at: now, last_seen_at: now, flow_status: "open",
          })), { onConflict: "integration_id,li_campaign_id", ignoreDuplicates: true });
        }
      }
    }
    offset += PAGE;
    if (rows.length < PAGE || offset >= total) { finished = true; break; }
  }

  if (!finished) {
    await supabase.from("li_newsletter_scan_state").update({ ...patch, scanning: true, scan_no: scanNo, next_offset: offset, total: head.total }).eq("integration_id", integ.id);
    return { scanning: true, fetched, added, next_offset: offset };
  }

  // fim da varredura: quem não apareceu nas duas últimas saiu da newsletter da loja (a menos que a lista tenha vindo anormalmente curta)
  let removed = 0;
  const { count: before } = await supabase.from("li_newsletter_subscribers").select("li_id", { count: "exact", head: true }).eq("integration_id", integ.id).is("removed_at", null);
  if (state.baseline_done && (before ?? 0) > 0 && head.total >= (before ?? 0) * 0.5) {
    const { data: gone } = await supabase.from("li_newsletter_subscribers").update({ removed_at: new Date().toISOString() })
      .eq("integration_id", integ.id).is("removed_at", null).lte("last_scan", scanNo - 2).select("email");
    removed = gone?.length ?? 0;
    for (let i = 0; i < (gone ?? []).length; i += 200) {
      await supabase.from("email_suppression_list").upsert(
        (gone ?? []).slice(i, i + 200).map((g) => ({ tenant_id: integ.tenant_id, email: g.email as string, reason: "unsubscribed", source: "li_newsletter" })),
        { onConflict: "tenant_id,email", ignoreDuplicates: true },
      );
    }
  }
  await supabase.rpc("refresh_newsletter_customers", { p_integration_id: integ.id });
  await supabase.from("li_newsletter_scan_state").update({
    ...patch, scanning: false, scan_no: scanNo, next_offset: 0, total: head.total, baseline_done: true, last_full_scan_at: new Date().toISOString(),
  }).eq("integration_id", integ.id);
  log.info(`[NEWSLETTER] varredura ${scanNo} concluída: total=${head.total} novos=${added} saíram=${removed}`);
  return { scan: scanNo, total: head.total, fetched, added, removed, baseline: !state.baseline_done };
}
