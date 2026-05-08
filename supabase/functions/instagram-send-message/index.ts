import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES as decryptToken } from "../_shared/ig-crypto.ts";
import { requireUserOrInternalAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("instagram-send-message", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: user JWT or internal service
    const auth = await requireUserOrInternalAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppSecret = Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || metaAppSecret;

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { channel_id, contact_id, thread_id, text, message_type, idempotency_key, sent_by_user_id } = body;

    if (!channel_id || !contact_id || !thread_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === GUARDRAILS via requireResource ===

    // Resolve tenantId: from auth (user calls) or from channel lookup (internal calls)
    let tenantId: string;

    if (!auth.isInternal) {
      tenantId = auth.tenantId!;
    } else {
      // Internal calls: resolve tenant from channel
      const { data: chLookup } = await supabase
        .from("instagram_channels")
        .select("tenant_id")
        .eq("id", channel_id)
        .single();
      if (!chLookup) {
        return new Response(JSON.stringify({ error: "Channel not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      tenantId = chLookup.tenant_id;
    }

    // 1. Channel — validate ownership + fetch needed fields
    const channel = await requireResource<{
      id: string; tenant_id: string; status: string;
      access_token_encrypted: string; token_expires_at: string | null;
    }>(
      supabase, "instagram_channels", channel_id, tenantId, req,
      "id, tenant_id, status, access_token_encrypted, token_expires_at"
    );

    if (!["connected", "expiring", "error"].includes(channel.status)) {
      return new Response(JSON.stringify({ error: "Channel not connected", code: "CHANNEL_DISCONNECTED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (channel.token_expires_at && new Date(channel.token_expires_at) <= new Date()) {
      return new Response(JSON.stringify({ error: "Token expired", code: "TOKEN_EXPIRED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Contact — validate ownership + check blocked status
    const contact = await requireResource<{
      id: string; igsid: string; is_blocked: boolean;
      standard_window_expires_at: string | null; human_window_expires_at: string | null;
    }>(
      supabase, "instagram_contacts", contact_id, tenantId, req,
      "id, igsid, is_blocked, standard_window_expires_at, human_window_expires_at"
    );

    if (contact.is_blocked) {
      return new Response(JSON.stringify({ error: "Contact is blocked", code: "CONTACT_BLOCKED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Thread — validate ownership + check status
    const thread = await requireResource<{ id: string; thread_status: string }>(
      supabase, "instagram_threads", thread_id, tenantId, req,
      "id, thread_status"
    );

    if (["spam", "blocked"].includes(thread.thread_status)) {
      return new Response(JSON.stringify({ error: "Thread is spam/blocked", code: "THREAD_BLOCKED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Window check (24h standard or human agent)
    const now = new Date();
    const standardOk = contact.standard_window_expires_at && new Date(contact.standard_window_expires_at) > now;
    const humanOk = contact.human_window_expires_at && new Date(contact.human_window_expires_at) > now;

    if (!standardOk && !humanOk) {
      return new Response(JSON.stringify({ error: "Outside messaging window", code: "WINDOW_CLOSED" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Idempotency check
    if (idempotency_key) {
      const { data: dup } = await supabase
        .from("instagram_outbox")
        .select("id, status")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();

      if (dup) {
        return new Response(JSON.stringify({ error: "Duplicate message", existing_id: dup.id, code: "DUPLICATE" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // === INSERT INTO OUTBOX ===
    const idemKey = idempotency_key || crypto.randomUUID();
    const { data: outboxItem, error: outboxErr } = await supabase
      .from("instagram_outbox")
      .insert({
        tenant_id: tenantId,
        channel_id,
        thread_id,
        contact_id,
        message_kind: message_type || "text",
        payload: { text, sent_by_user_id },
        status: "pending",
        idempotency_key: idemKey,
        send_after: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (outboxErr) {
      return new Response(JSON.stringify({ error: outboxErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also create message record with pending status
    await supabase.from("instagram_messages").insert({
      tenant_id: tenantId,
      thread_id,
      direction: "outbound",
      message_type: message_type || "text",
      text_body: text,
      sent_by_user_id,
      delivery_status: "pending",
    });

    // Update thread - switch to human_active when a human user sends
    const threadUpdate: Record<string, string> = {
      last_message_preview: text?.substring(0, 200),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (sent_by_user_id) {
      threadUpdate.current_mode = "human_active";
    }
    await supabase.from("instagram_threads").update(threadUpdate).eq("id", thread_id);

    log.info(`[ig-send] ✅ Queued message ${outboxItem.id} for thread ${thread_id}`);

    return new Response(JSON.stringify({ success: true, outbox_id: outboxItem.id, idempotency_key: idemKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[ig-send] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
