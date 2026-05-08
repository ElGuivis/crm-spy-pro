import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("email-campaign-scheduler", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find scheduled email campaigns whose time has arrived
    const { data: campaigns, error } = await supabase
      .from("email_campaigns")
      .select("id, subject, internal_name, tenant_id, scheduled_at, status")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true });

    if (error) throw error;

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ message: "No scheduled email campaigns to process", checked_at: now }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info(`📬 Found ${campaigns.length} email campaigns ready to send`);

    const functionUrl = `${supabaseUrl}/functions/v1/email-campaign-send`;
    let triggered = 0;
    const errors: string[] = [];

    for (const campaign of campaigns) {
      try {
        // Do NOT change status here — email-campaign-send will atomically
        // claim the campaign by transitioning from "scheduled" → "sending".
        // Setting an intermediate "processing" status would cause send to
        // reject the campaign with a 409 error.

        // Fire-and-forget to email-campaign-send
        fetch(functionUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ campaign_id: campaign.id }),
        }).catch((err) => {
          log.error(`❌ Failed to invoke send for ${campaign.id}:`, err);
        });

        triggered++;
        const label = (campaign as Record<string, unknown>).internal_name || (campaign as Record<string, unknown>).subject || campaign.id;
        log.info(`✅ Triggered send for: "${label}" (${campaign.id})`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${campaign.id}: ${msg}`);
        log.error(`❌ Error processing campaign ${campaign.id}:`, msg);
      }
    }

    return new Response(
      JSON.stringify({ success: true, triggered, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    log.error("❌ Email scheduler error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
