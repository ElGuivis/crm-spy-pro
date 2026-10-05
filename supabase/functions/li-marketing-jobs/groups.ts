import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { liAuthHeader } from "../_shared/li-auth.ts";

type Supabase = ReturnType<typeof createClient>;
const BASE = "https://api.awsli.com.br/v1";
const PER_RUN = 45;   // ~1 chamada por segundo: a loja limita 100/min no total
const PAUSE_MS = 700;

interface Job { id: string; tenant_id: string; integration_id: string; target_group: string | null }
interface Item { li_customer_id: number; new_group: string | null }

/** Executa as alterações de grupo pendentes (PUT /v1/cliente/{id}/grupo), no ritmo que a loja aguenta. */
export async function runGroups(supabase: Supabase, log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) {
  const { data: jobs } = await supabase.from("li_group_jobs").select("id, tenant_id, integration_id, target_group").eq("status", "running").order("created_at").limit(3);
  let processed = 0;
  for (const job of (jobs ?? []) as Job[]) {
    const { data: integ } = await supabase.from("integrations").select("api_key").eq("id", job.integration_id).eq("status", "connected").maybeSingle();
    if (!integ?.api_key) continue;
    const auth = liAuthHeader(integ.api_key);
    const { data: items } = await supabase.from("li_group_job_items").select("li_customer_id, new_group").eq("job_id", job.id).eq("status", "pending").order("li_customer_id").limit(PER_RUN - processed);
    let stop = false;
    for (const it of (items ?? []) as Item[]) {
      const group = it.new_group ?? job.target_group;
      let status: "done" | "failed" = "done", error: string | null = null;
      if (!group) { status = "failed"; error = "grupo de destino ausente"; }
      else {
        try {
          const res = await fetch(`${BASE}/cliente/${it.li_customer_id}/grupo`, { method: "PUT", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ grupo: group }), signal: AbortSignal.timeout(20_000) });
          if (res.status === 429 || res.status >= 500) { stop = true; break; }       // tenta de novo no próximo minuto
          if (res.status === 401 || res.status === 403) { log.error(`[GROUPS] acesso recusado (${res.status})`); stop = true; break; }
          if (!res.ok) { status = "failed"; error = `${res.status}: ${(await res.text()).slice(0, 160)}`; }
        } catch (e) { stop = true; log.error(`[GROUPS] ${(e as Error).message}`); break; }
      }
      await supabase.from("li_group_job_items").update({ status, error, done_at: new Date().toISOString() }).eq("job_id", job.id).eq("li_customer_id", it.li_customer_id);
      processed++;
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    // contadores e fechamento
    const count = async (s: string) => (await supabase.from("li_group_job_items").select("li_customer_id", { count: "exact", head: true }).eq("job_id", job.id).eq("status", s)).count ?? 0;
    const [done, failed, pending] = await Promise.all([count("done"), count("failed"), count("pending")]);
    await supabase.from("li_group_jobs").update({ done, failed, ...(pending === 0 ? { status: "done", finished_at: new Date().toISOString() } : {}) }).eq("id", job.id).eq("status", "running");
    if (stop || processed >= PER_RUN) break;
  }
  if (processed) log.info(`[GROUPS] ${processed} cliente(s) processado(s)`);
  return { processed };
}
