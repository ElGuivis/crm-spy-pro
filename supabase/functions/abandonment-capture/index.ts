import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { registerWebhooks } from "../_shared/li-webhooks.ts";
import { captureIntegration, type CaptureResult } from "./capture.ts";

/**
 * Cron (10 min): espelha os carrinhos/navegações/pedidos abandonados da API de Marketing da Loja Integrada,
 * detecta quem comprou depois (recuperação) e garante que os webhooks da loja estejam registrados.
 * Só leitura na loja (exceto o registro de webhook, que aponta para o nosso li-webhook).
 */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("abandonment-capture", getCorrelationId(req));

  try {
    await requireInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: integrations, error } = await supabase.from("integrations")
      .select("id, tenant_id, api_key, metadata").eq("type", "loja_integrada").eq("status", "connected").not("tenant_id", "is", null).not("api_key", "is", null);
    if (error) throw error;

    const results: (CaptureResult | { integration: string; error: string })[] = [];
    for (const integ of integrations ?? []) {
      try {
        const auth = liAuthHeader(integ.api_key);
        await ensureWebhooks(supabase, integ, auth, supabaseUrl, log);
        results.push(await captureIntegration(supabase, { id: integ.id, tenant_id: integ.tenant_id }, auth));
      } catch (e) {
        log.error(`[ABANDON-CAPTURE] integração ${integ.id}: ${(e as Error).message}`);
        results.push({ integration: integ.id, error: (e as Error).message });
      }
    }

    const { data: recovered, error: recErr } = await supabase.rpc("refresh_abandonment_recovery");
    if (recErr) log.error("[ABANDON-CAPTURE] recuperação:", recErr.message);
    return json({ success: true, integrations: results.length, recovered: recovered ?? 0, results });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[ABANDON-CAPTURE]", error);
    return json({ success: false, error: (error as Error)?.message ?? "erro" }, 500);
  }
});

/** Registra os webhooks se ainda não estiverem (no máximo uma tentativa por dia; com Personal Token a loja costuma recusar, e o motivo fica em metadata.webhooks_error). */
async function ensureWebhooks(
  supabase: ReturnType<typeof createClient>, integ: { id: string; metadata: unknown }, auth: string, supabaseUrl: string,
  log: { info: (...a: unknown[]) => void },
) {
  const meta = (integ.metadata && typeof integ.metadata === "object" ? integ.metadata : {}) as Record<string, unknown>;
  if (meta.webhooks_registered_at) return;
  const lastTry = typeof meta.webhooks_attempt_at === "string" ? Date.parse(meta.webhooks_attempt_at) : 0;
  if (Date.now() - lastTry < 86_400_000) return;
  await supabase.from("integrations").update({ metadata: { ...meta, webhooks_attempt_at: new Date().toISOString() } }).eq("id", integ.id);
  const r = await registerWebhooks(supabase, integ.id, auth, supabaseUrl);
  log.info(`[ABANDON-CAPTURE] webhooks: ${r.message}`);
}
