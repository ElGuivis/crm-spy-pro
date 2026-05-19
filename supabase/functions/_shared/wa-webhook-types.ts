import type { WhatsAppConfig } from "./whatsapp-sender.ts";

export interface IntegrationMetadata {
  instanceName?: string;
  phoneNumber?: string;
  apiKey?: string;
  chatwootAccountId?: number;
  chatwootInboxId?: number;
  chatwootInboxIdentifier?: string;
  [key: string]: unknown;
}

export interface EvolutionStatusUpdate {
  key: { id: string; remoteJid?: string; fromMe?: boolean };
  status: string;
  participant?: string;
}

export interface InboxAgentData {
  welcome_message?: string | null;
  interactive_buttons?: Array<{ text: string }> | null;
}

/** Mutable webhook processing context shared across all handler modules. */
export interface WaCtx {
  supabase: any;
  supabaseUrl: string;
  supabaseServiceKey: string;
  log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
  corsHeaders: Record<string, string>;
  chatwootPlatformUrl: string;
  // Tenant + integration
  tenantId: string;
  integration: { id: string; tenant_id: string; metadata: IntegrationMetadata };
  integrationMeta: IntegrationMetadata;
  instanceName: string;
  whatsAppConfig: WhatsAppConfig;
  // Contact state (mutated by contact manager)
  phone: string;
  contactName: string;
  isLidContact: boolean;
  lidIdentifier: string | null;
  realPhoneFromAlt: string | null;
  contact: any;
  // Conversation state (mutated by conversation manager)
  conversation: any;
  message: any;
  isNewConversation: boolean;
  // Message content
  messageContent: string;
  contentType: string;
  mediaUrl: string | null;
  buttonClickId: string | null;
  // Raw Evolution payload
  payload: any;
}
