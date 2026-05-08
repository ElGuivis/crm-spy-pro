import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cid = getCorrelationId(req);
  const log = createLogger("ig-dead-letter-retry", cid);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    requireInternalAuth(req);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }

    const { item_id, tenant_id } = body;

    let query = supabase
      .from("instagram_outbox")
      .select("id, attempt_count, error_message, created_at")
      .eq("status", "dead");

    if (item_id) {
      query = query.eq("id", item_id);
    } else if (tenant_id) {
      query = query.eq("tenant_id", tenant_id);
    }

    query = query.gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    query = query.limit(50);

    const { data: items, error } = await query;
    if (error) throw error;

    if (!items || items.length === 0) {
      log.info("No dead items to retry");
      return new Response(JSON.stringify({ retried: 0, message: "No dead items to retry" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = items.map(i => i.id);
    const { error: updateError } = await supabase
      .from("instagram_outbox")
      .update({
        status: "pending",
        attempt_count: 0,
        error_code: null,
        error_message: null,
        send_after: new Date().toISOString(),
      })
      .in("id", ids);

    if (updateError) throw updateError;

    log.info("Retried dead items", { count: ids.length });
    return new Response(JSON.stringify({ retried: ids.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    log.error("Error", { error: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
