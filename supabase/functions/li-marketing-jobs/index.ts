import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { runNewsletter } from "./newsletter.ts";
import { runWaitlist } from "./waitlist.ts";
import { runOutbox } from "./outbox.ts";
import { runGroups } from "./groups.ts";

/**
 * Jobs agendados da área de Marketing da Loja Integrada (um cron por job):
 *  { job: "newsletter" } espelha a newsletter e detecta novos inscritos e saídas (15 min)
 *  { job: "outbox" }     descadastro em duas vias: tira da newsletter/automações da loja quem saiu aqui (5 min)
 *  { job: "waitlist" }   retrato diário da lista de espera
 *  { job: "groups" }     alterações de grupo de clientes em andamento (1 min)
 */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("li-marketing-jobs", getCorrelationId(req));

  try {
    await requireInternalAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { job } = await req.json().catch(() => ({})) as { job?: string };
    if (!job || !["newsletter", "outbox", "waitlist", "groups"].includes(job)) return json({ success: false, error: "job inválido" }, 400);

    if (job === "outbox") return json({ success: true, ...(await runOutbox(supabase, log)) });
    if (job === "groups") return json({ success: true, ...(await runGroups(supabase, log)) });

    const { data: integrations } = await supabase.from("integrations").select("id, tenant_id, api_key")
      .eq("type", "loja_integrada").eq("status", "connected").not("tenant_id", "is", null).not("api_key", "is", null);
    const results: unknown[] = [];
    for (const integ of integrations ?? []) {
      try {
        const auth = liAuthHeader(integ.api_key);
        results.push(job === "newsletter" ? await runNewsletter(supabase, integ, auth, log) : await runWaitlist(supabase, integ, auth));
      } catch (e) {
        log.error(`[LI-JOBS] ${job} integração ${integ.id}: ${(e as Error).message}`);
        results.push({ integration: integ.id, error: (e as Error).message });
      }
    }
    return json({ success: true, job, results });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[LI-JOBS]", error);
    return json({ success: false, error: (error as Error)?.message ?? "erro" }, 500);
  }
});
