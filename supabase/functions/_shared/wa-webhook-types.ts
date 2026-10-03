import type { WhatsAppConfig } from "./whatsapp-sender.ts";

/** Payload bruto da Evolution API para `messages.upsert` (o único que chega aos handlers). */
export interface EvolutionMessagePayload {
  event?: string;
  instance?: string;
  sender?: string;
  participant?: string;
  data: {
    key: { id?: string; remoteJid: string; fromMe?: boolean; participant?: string; [k: string]: unknown };
    pushName?: string;
    participant?: string;
    message?: Record<string, unknown>;
    messageType?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

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

/**
 * Mutable webhook processing context shared across all handler modules.
 *
 * Exceção documentada ao "sem any em webhook": o cliente Supabase e as linhas do banco
 * (contato/conversa/mensagem) seguem como `any` porque as edge functions não têm os tipos
 * gerados do schema e os selects usam listas de colunas em constantes (o SDK tipado devolve
 * `GenericStringError`). Tipar de verdade exige gerar tipos para as edge functions.
 */
export interface WaCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact: any;
  // Conversation state (mutated by conversation manager)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversation: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
  isNewConversation: boolean;
  // Message content
  messageContent: string;
  contentType: string;
  mediaUrl: string | null;
  buttonClickId: string | null;
  // Raw Evolution payload
  payload: EvolutionMessagePayload;
}
