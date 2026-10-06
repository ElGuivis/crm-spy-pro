import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { LiApiError, deleteNewsletterEmail, getAutomationConfig, listAutomations, optOutAutomation, subscribeNewsletter, type LiAutomation } from "../_shared/li-marketing.ts";

type Supabase = ReturnType<typeof createClient>;
interface Job { id: string; tenant_id: string; integration_id: string; kind: string; payload: { email?: string; name?: string }; attempts: number }

const MAX_ATTEMPTS = 6;
const BATCH = 40;

/** Fila de chamadas para a loja (descadastro em duas vias). Cada item tem até 6 tentativas, com espera crescente. */
export async function runOutbox(supabase: Supabase, log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) {
  // aproveita a rodada de 5 min: reservas de cupom esquecidas (queda no meio da emissão) viram emitidas ou somem
  await supabase.rpc("cleanup_pending_coupons");
  await supabase.rpc("cleanup_public_rate_limits"); // janelas de limite de taxa com mais de 1 dia
  await supabase.rpc("cleanup_domain_events"); // eventos de pedido tratados há mais de 30 dias
  await supabase.rpc("cleanup_customer_touches"); // toques com mais de 90 dias não influenciam nenhuma regra
  await supabase.rpc("archive_orphan_flow_campaigns"); // etapas criadas e nunca usadas (cliques repetidos em "Criar etapas padrão")
  const { data: jobs } = await supabase.from("li_marketing_outbox").select("id, tenant_id, integration_id, kind, payload, attempts")
    .eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(BATCH);
  if (!jobs?.length) return { processed: 0 };

  // reserva (10 min) para que uma rodada sobreposta não repita as mesmas chamadas
  await supabase.from("li_marketing_outbox").update({ next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString() }).in("id", jobs.map((j) => j.id));

  const ctx = new Map<string, { auth: string; automations: LiAutomation[]; storeId: number } | null>();
  const load = async (integrationId: string) => {
    if (ctx.has(integrationId)) return ctx.get(integrationId)!;
    const { data: integ } = await supabase.from("integrations").select("api_key").eq("id", integrationId).eq("status", "connected").maybeSingle();
    if (!integ?.api_key) { ctx.set(integrationId, null); return null; }
    const auth = liAuthHeader(integ.api_key);
    const [automations, config] = await Promise.all([listAutomations(auth), getAutomationConfig(auth)]);
    const v = { auth, automations, storeId: config.storeId };
    ctx.set(integrationId, v);
    return v;
  };

  let done = 0, failed = 0;
  for (const job of jobs as Job[]) {
    try {
      const c = await load(job.integration_id);
      if (!c) throw new LiApiError(0, "Loja Integrada desconectada");
      const email = job.payload.email?.trim();
      if (!email) throw new LiApiError(400, "e-mail ausente");
      if (job.kind === "unsubscribe") {
        await deleteNewsletterEmail(c.auth, email);
        for (const a of c.automations) {
          // já estar fora da automação não é erro
          await optOutAutomation(c.auth, email, c.storeId, a.id).catch((e) => { if (!(e instanceof LiApiError && [400, 409].includes(e.status))) throw e; });
        }
      } else if (job.kind === "newsletter_subscribe") {
        await subscribeNewsletter(c.auth, email, job.payload.name);
      }
      await supabase.from("li_marketing_outbox").update({ status: "done", done_at: new Date().toISOString(), last_error: null, attempts: job.attempts + 1 }).eq("id", job.id);
      done++;
    } catch (e) {
      const attempts = job.attempts + 1;
      const msg = (e as Error).message.slice(0, 300);
      const permanent = e instanceof LiApiError && e.status >= 400 && e.status < 500 && e.status !== 429;
      const give = permanent || attempts >= MAX_ATTEMPTS;
      await supabase.from("li_marketing_outbox").update({
        status: give ? "failed" : "pending", attempts, last_error: msg, next_attempt_at: new Date(Date.now() + attempts * 10 * 60_000).toISOString(),
      }).eq("id", job.id);
      if (give) failed++;
      log.error(`[OUTBOX] ${job.kind} tentativa ${attempts}: ${msg}`);
    }
  }
  log.info(`[OUTBOX] concluídos=${done} falhas definitivas=${failed}`);
  return { processed: jobs.length, done, failed };
}
