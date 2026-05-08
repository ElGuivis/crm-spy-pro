import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sendTextWithTokenCharge, WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("auto-close-conversations", cid);

  try {
    requireInternalAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all tenants with auto-close enabled (regular or automation)
    const { data: configs, error: configError } = await supabase
      .from("ai_assistant_configs")
      .select("tenant_id, auto_close_enabled, auto_close_minutes, auto_close_message, automation_auto_close_enabled, automation_auto_close_minutes, automation_auto_close_message");

    if (configError) {
      log.error("Failed to fetch configs", { error: configError.message });
      return new Response(JSON.stringify({ error: configError.message }), { status: 500 });
    }

    if (!configs || configs.length === 0) {
      log.info("No tenants with auto-close configs");
      return new Response(JSON.stringify({ processed: 0 }));
    }

    let totalClosed = 0;

    for (const config of configs) {
      const { tenant_id } = config;

      // Get WhatsApp channel config for sending farewell message (shared for both types)
      const { data: channels } = await supabase
        .from("whatsapp_channels")
        .select("id, provider_account_id, tenant_id")
        .eq("tenant_id", tenant_id)
        .eq("status", "connected");

      const evolutionApiUrl = Deno.env.get("EVOLUTION_API_URL") || "";
      const evolutionApiKey = Deno.env.get("EVOLUTION_API_KEY") || "";

      // ── 1) Regular (organic) auto-close ──────────────────────────
      if (config.auto_close_enabled) {
        const cutoff = new Date(Date.now() - config.auto_close_minutes * 60 * 1000).toISOString();
        const { data: conversations } = await supabase
          .from("conversations")
          .select("id, contact_id, channel_id, inbox_id, status, last_message_at")
          .eq("tenant_id", tenant_id)
          .eq("handoff_mode", false)
          .neq("source", "automation")
          .is("closed_at", null)
          .in("status", ["bot", "open", "pending"])
          .lt("last_message_at", cutoff)
          .limit(50);

        if (conversations && conversations.length > 0) {
          log.info(`Found ${conversations.length} organic conversations to auto-close`, { tenant_id });
          totalClosed += await closeConversations(supabase, conversations, tenant_id, config.auto_close_message, channels, evolutionApiUrl, evolutionApiKey);
        }
      }

      // ── 2) Automation auto-close ──────────────────────────────
      if (config.automation_auto_close_enabled) {
        const autoCutoff = new Date(Date.now() - (config.automation_auto_close_minutes || 120) * 60 * 1000).toISOString();
        const { data: autoConversations } = await supabase
          .from("conversations")
          .select("id, contact_id, channel_id, inbox_id, status, last_message_at")
          .eq("tenant_id", tenant_id)
          .eq("source", "automation")
          .is("closed_at", null)
          .in("status", ["bot", "open", "pending"])
          .lt("last_message_at", autoCutoff)
          .limit(50);

        if (autoConversations && autoConversations.length > 0) {
          log.info(`Found ${autoConversations.length} automation conversations to auto-close`, { tenant_id });
          totalClosed += await closeConversations(supabase, autoConversations, tenant_id, config.automation_auto_close_message || config.auto_close_message, channels, evolutionApiUrl, evolutionApiKey);
        }
      }
    }

    log.info(`Auto-close complete: ${totalClosed} conversations closed`);
    return new Response(JSON.stringify({ processed: totalClosed }));
  } catch (err) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 });
  }
});

async function closeConversations(
  supabase: ReturnType<typeof createClient>,
  conversations: Array<{ id: string; contact_id: string; channel_id: string | null; inbox_id: string | null; status: string; last_message_at: string | null }>,
  tenantId: string,
  closeMessage: string,
  channels: Array<{ id: string; provider_account_id: string; tenant_id: string }> | null,
  evolutionApiUrl: string,
  evolutionApiKey: string,
): Promise<number> {
  let closed = 0;

  for (const conv of conversations) {
    try {
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone, name, metadata")
        .eq("id", conv.contact_id)
        .single();

      if (!contact) continue;

      let phoneToSend = contact.phone;
      const meta = contact.metadata as Record<string, unknown> | null;
      if (meta?.real_phone && typeof meta.real_phone === "string") {
        phoneToSend = meta.real_phone;
      } else if (meta?.lid_phone && typeof meta.lid_phone === "string") {
        phoneToSend = meta.lid_phone;
      }

      const channel = channels?.find((ch) => ch.id === conv.channel_id) || channels?.[0];

      if (channel && evolutionApiUrl && evolutionApiKey && closeMessage) {
        const waConfig: WhatsAppConfig = {
          evolutionApiUrl,
          evolutionApiKey,
          instanceName: channel.provider_account_id || "",
        };

        const personalizedMessage = closeMessage
          .replace(/\{nome\}/gi, contact.name || "cliente")
          .replace(/\{name\}/gi, contact.name || "cliente");

        const sendResult = await sendTextWithTokenCharge(
          waConfig,
          phoneToSend,
          personalizedMessage,
          supabase,
          tenantId,
          "auto_close",
          "Mensagem de encerramento automático"
        );

        if (sendResult.success) {
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            tenant_id: tenantId,
            sender_type: "system",
            content: personalizedMessage,
            content_type: "text",
            type: "text",
            direction: "outbound",
            status: "sent",
            provider_message_id: sendResult.messageId || null,
          });
        }
      }

      await supabase
        .from("conversations")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          ai_enabled: false,
          bot_state_json: null,
          buffered_message_ids: [],
          pending_ai_response_at: null,
        })
        .eq("id", conv.id);

      closed++;
      log.info("Conversation auto-closed", { conversation_id: conv.id });
    } catch (err) {
      log.error("Error closing conversation", {
        conversation_id: conv.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return closed;
}
