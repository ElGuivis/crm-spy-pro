/**
 * Chatwoot sync logic extracted from whatsapp-webhook.
 * Handles contact creation, conversation creation, and message forwarding to Chatwoot.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("wa-webhook-chatwoot-sync", "shared");


type ServiceClient = ReturnType<typeof createClient>;

interface ChatwootSyncParams {
  supabase: ServiceClient;
  chatwootPlatformUrl: string;
  tenantId: string;
  integrationMeta: {
    chatwootAccountId?: number;
    chatwootInboxId?: number;
    chatwootInboxIdentifier?: string;
  };
  contact: { id: string; metadata: Record<string, unknown> | null };
  conversation: { id: string; chatwoot_conversation_id?: string | null };
  message: { id: string };
  phone: string;
  contactName: string;
  messageContent: string;
}

export async function syncWithChatwoot(params: ChatwootSyncParams): Promise<void> {
  const {
    supabase, chatwootPlatformUrl, tenantId, integrationMeta,
    contact, conversation, message, phone, contactName, messageContent,
  } = params;

  if (!integrationMeta.chatwootAccountId || !integrationMeta.chatwootInboxId || !chatwootPlatformUrl) {
    return;
  }

  log.info("🔄 Syncing with Chatwoot...");

  try {
    const { data: chatwootIntegration } = await supabase
      .from("integrations")
      .select("metadata")
      .eq("tenant_id", tenantId)
      .eq("type", "chatwoot")
      .eq("status", "connected")
      .single();

    if (!chatwootIntegration?.metadata) return;

    const chatwootMeta = chatwootIntegration.metadata as {
      inboxIdentifier?: string;
      accountId?: string;
    };

    const chatwootBaseUrl = chatwootPlatformUrl.replace(/\/$/, "");
    const inboxIdentifier = chatwootMeta.inboxIdentifier || integrationMeta.chatwootInboxIdentifier;
    if (!inboxIdentifier) return;

    // Resolve or create Chatwoot contact
    let chatwootContactSourceId = (contact.metadata as { chatwoot_source_id?: string } | null)?.chatwoot_source_id;

    if (!chatwootContactSourceId) {
      const createContactResponse = await fetch(
        `${chatwootBaseUrl}/public/api/v1/inboxes/${inboxIdentifier}/contacts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: phone,
            name: contactName,
            phone_number: `+${phone}`,
            custom_attributes: { internal_contact_id: contact.id },
          }),
        }
      );

      if (createContactResponse.ok) {
        const contactData = await createContactResponse.json();
        chatwootContactSourceId = contactData.source_id;

        await supabase
          .from("contacts")
          .update({
            metadata: {
              ...((contact.metadata as object) || {}),
              chatwoot_source_id: chatwootContactSourceId,
              chatwoot_contact_id: contactData.id,
            },
          })
          .eq("id", contact.id);

        log.info("✅ Chatwoot contact created:", chatwootContactSourceId);
      } else {
        log.warn("⚠️ Failed to create Chatwoot contact:", await createContactResponse.text());
        return;
      }
    }

    // Resolve or create Chatwoot conversation
    let chatwootConversationId = conversation.chatwoot_conversation_id;

    if (!chatwootConversationId && chatwootContactSourceId) {
      const createConvResponse = await fetch(
        `${chatwootBaseUrl}/public/api/v1/inboxes/${inboxIdentifier}/contacts/${chatwootContactSourceId}/conversations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            custom_attributes: { internal_conversation_id: conversation.id },
          }),
        }
      );

      if (createConvResponse.ok) {
        const convData = await createConvResponse.json();
        chatwootConversationId = convData.id;
        await supabase
          .from("conversations")
          .update({ chatwoot_conversation_id: chatwootConversationId })
          .eq("id", conversation.id);
        log.info("✅ Chatwoot conversation created:", chatwootConversationId);
      } else {
        log.warn("⚠️ Failed to create Chatwoot conversation:", await createConvResponse.text());
      }
    }

    // Send message
    if (chatwootContactSourceId) {
      const existingConvsResponse = await fetch(
        `${chatwootBaseUrl}/public/api/v1/inboxes/${inboxIdentifier}/contacts/${chatwootContactSourceId}/conversations`,
        { method: "GET", headers: { "Content-Type": "application/json" } }
      );

      let targetConversationId = chatwootConversationId;

      if (existingConvsResponse.ok) {
        const convs = await existingConvsResponse.json();
        if (Array.isArray(convs) && convs.length > 0) {
          const openConv = convs.find((c: { status: string }) => c.status === "open" || c.status === "pending");
          targetConversationId = openConv?.id || convs[0].id;
        }
      }

      if (targetConversationId) {
        const messageResponse = await fetch(
          `${chatwootBaseUrl}/public/api/v1/inboxes/${inboxIdentifier}/contacts/${chatwootContactSourceId}/conversations/${targetConversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: messageContent }),
          }
        );

        if (messageResponse.ok) {
          const msgData = await messageResponse.json();
          await supabase
            .from("messages")
            .update({ chatwoot_message_id: msgData.id })
            .eq("id", message.id);
          log.info("✅ Message sent to Chatwoot:", msgData.id);
        } else {
          log.warn("⚠️ Failed to send message to Chatwoot:", await messageResponse.text());
        }
      }
    }
  } catch (chatwootError) {
    log.error("⚠️ Chatwoot sync error:", chatwootError);
  }
}
