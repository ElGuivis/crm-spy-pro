import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-save-contact-data", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireInternalAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tenant_id, contact_id, channel_id, field_name, field_value, source, flow_id, flow_run_id, node_id, consent_given, consent_text } = await req.json();
    if (!contact_id || !field_name || !field_value) throw new Error("Missing required fields");

    let normalized = field_value.trim();

    // Validate and normalize
    if (field_name === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      normalized = normalized.toLowerCase();
      if (!emailRegex.test(normalized)) throw new Error("Invalid email format");
    } else if (field_name === "phone") {
      const digits = normalized.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 15) throw new Error("Invalid phone format");
      // Normalize BR phones correctly
      if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
        normalized = `+${digits}`;
      } else if (digits.length <= 11) {
        normalized = `+55${digits}`;
      } else {
        normalized = `+${digits}`;
      }
    }

    // Check existing data - don't overwrite verified with unverified
    const contactQuery = supabase
      .from("instagram_contacts")
      .select("email, email_verified, phone, phone_verified")
      .eq("id", contact_id);
    if (tenant_id) contactQuery.eq("tenant_id", tenant_id);
    const { data: contact } = await contactQuery.single();

    if (contact) {
      if (field_name === "email" && contact.email_verified && contact.email && contact.email !== normalized) {
        log.info("[save-contact-data] Skipping overwrite of verified email");
      } else if (field_name === "phone" && contact.phone_verified && contact.phone && contact.phone !== normalized) {
        log.info("[save-contact-data] Skipping overwrite of verified phone");
      } else {
        const updateData: Record<string, unknown> = {};
        if (field_name === "email") {
          updateData.email = normalized;
          updateData.email_source = source || "flow";
          if (consent_given) updateData.email_consent_at = new Date().toISOString();
        } else if (field_name === "phone") {
          updateData.phone = normalized;
          updateData.phone_source = source || "flow";
          if (consent_given) updateData.phone_consent_at = new Date().toISOString();
        }

        if (Object.keys(updateData).length > 0) {
          await supabase
            .from("instagram_contacts")
            .update(updateData)
            .eq("id", contact_id);
        }
      }
    }

    // Log the data collection event (always, for audit trail)
    await supabase.from("instagram_data_collection_events").insert({
      tenant_id,
      contact_id,
      channel_id: channel_id || "",
      field_name,
      field_value: normalized,
      source: source || "flow",
      flow_id,
      flow_run_id,
      node_id,
      consent_given: consent_given || false,
      consent_text,
    });

    return new Response(JSON.stringify({ ok: true, normalized }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[save-contact-data]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
