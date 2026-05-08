import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

/**
 * Check if current time (in campaign timezone) falls within the sending schedule.
 */
function isWithinSendingWindow(
  schedule: Record<string, { start: string; end: string }> | null,
  tz: string | null
): boolean {
  if (!schedule || Object.keys(schedule).length === 0) return true;

  const timezone = tz || "America/Sao_Paulo";
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const weekdayStr = parts.find(p => p.type === "weekday")?.value || "";
  const hour = parts.find(p => p.type === "hour")?.value || "00";
  const minute = parts.find(p => p.type === "minute")?.value || "00";
  const currentTime = `${hour}:${minute}`;

  const dayMap: Record<string, string> = {
    Sun: "0", Mon: "1", Tue: "2", Wed: "3", Thu: "4", Fri: "5", Sat: "6",
  };
  const dayKey = dayMap[weekdayStr];
  if (!dayKey) return true;

  const window = schedule[dayKey];
  if (!window) return false;

  return currentTime >= window.start && currentTime < window.end;
}

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("bulk-campaign-scheduler", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find scheduled campaigns whose time has arrived.
    // IMPORTANT: chaining multiple .or() calls in PostgREST results in the last
    // .or() overwriting earlier ones, which broke the throttle gate and caused
    // the scheduler to re-invoke the processor while it was still cooling down,
    // collapsing the configured delay (sending messages every 4-6s instead of 120-360s).
    // We now apply the status filter via .in() and the throttle filters as a single .and().
    const nowIso = new Date().toISOString();
    const { data: campaigns, error } = await supabase
      .from("bulk_campaigns")
      .select("id, name, scheduled_at, status, sending_schedule, timezone, next_send_at, processing_lock_until")
      .in("status", ["scheduled", "processing"])
      .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
      .or(`processing_lock_until.is.null,processing_lock_until.lt.${nowIso}`)
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!campaigns || campaigns.length === 0) {
      return new Response(JSON.stringify({ message: "No campaigns to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log.info(`🔍 Found ${campaigns.length} campaigns to check`);

    const functionUrl = `${supabaseUrl}/functions/v1/bulk-campaign-processor`;
    let started = 0;

    for (const campaign of campaigns) {
      if ((campaign as Record<string, unknown>).status === "scheduled") {
        // Check if scheduled time has arrived
        if (!(campaign as Record<string, unknown>).scheduled_at || new Date((campaign as Record<string, unknown>).scheduled_at as string) > new Date()) {
          continue; // Not yet time
        }
        // Update status to processing
        await supabase
          .from("bulk_campaigns")
          .update({ status: "processing", started_at: new Date().toISOString() })
          .eq("id", campaign.id);
      }

      // For processing campaigns, check if within sending window before invoking
      const sendingSchedule = campaign.sending_schedule as Record<string, { start: string; end: string }> | null;
      if (!isWithinSendingWindow(sendingSchedule, campaign.timezone)) {
        log.info(`⏰ Campaign "${campaign.name}" outside sending window, skipping`);
        continue;
      }

      // Check if there are pending contacts
      const { count } = await supabase
        .from("campaign_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("status", "pending");

      if (!count || count === 0) continue;

      // Invoke processor
      fetch(functionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ campaign_id: campaign.id }),
      }).catch(e => log.error("Background error", { error: String(e) }));

      started++;
      log.info(`✅ Invoked processor for: ${campaign.name} (${campaign.id})`);
    }

    return new Response(
      JSON.stringify({ success: true, started }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    log.error("❌ Scheduler error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});