/**
 * Shared type definitions for Edge Functions.
 * Replaces `any` in critical auth, billing, and integration flows.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

/** Typed Supabase client alias.
 * Uses permissive generics to bypass the SDK's strict `never` schema inference
 * in Edge Functions, which otherwise causes TS2339 errors on every table column.
 */
// deno-lint-ignore no-explicit-any
export type ServiceClient = SupabaseClient<any, any, any>;

/** Chat message structure for AI providers */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** AI provider call result */
export interface AICallResult {
  success: boolean;
  data?: AICompletionResponse;
  error?: string;
  provider?: string;
  model?: string;
}

/** Standard AI completion response (OpenAI-compatible) */
export interface AICompletionResponse {
  id?: string;
  choices?: {
    index: number;
    message: { role: string; content: string };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Conversation record (minimal) */
export interface ConversationRecord {
  id: string;
  tenant_id: string;
  contact_id: string;
  channel_id?: string | null;
  status: string;
  assigned_to?: string | null;
  last_message_at?: string | null;
  last_outbound_at?: string | null;
  last_incoming_message_id?: string | null;
  buffered_message_ids?: string[] | null;
  pending_ai_response_at?: string | null;
  integration_id?: string | null;
}

/** Contact record (minimal) */
export interface ContactRecord {
  id: string;
  phone: string;
  name?: string | null;
  metadata?: Record<string, string> | null;
}

/** Integration record (minimal) */
export interface IntegrationRecord {
  id: string;
  tenant_id: string;
  type: string;
  status: string;
  metadata?: Record<string, unknown> | null;
  name?: string | null;
}

/** Bling connection record */
export interface BlingConnectionRecord {
  id: string;
  tenant_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_expires_at: string;
  status?: string | null;
  bling_company_id?: string | null;
  bling_user_id?: string | null;
  bling_user_name?: string | null;
}

/** Melhor Envio token record */
export interface MelhorEnvioTokenRecord {
  id: string;
  tenant_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted?: string | null;
  expires_at: string;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  environment?: string | null;
}

/** AI agent record */
export interface AIAgentRecord {
  id: string;
  tenant_id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature?: number | null;
  max_tokens?: number | null;
  ai_provider?: string | null;
  agent_type: string;
  is_active: boolean;
  welcome_message?: string | null;
  human_transfer_column_id?: string | null;
  transfer_keywords?: string[] | null;
  interactive_buttons?: Record<string, unknown> | null;
  data_access?: Record<string, unknown> | null;
  keyword_action_rules?: Record<string, unknown>[] | null;
  agent_transfer_rules?: Record<string, unknown>[] | null;
  inactivity_enabled?: boolean | null;
  inactivity_timeout_minutes?: number | null;
  inactivity_message?: string | null;
  inactivity_target_column_id?: string | null;
  order_verification_enabled?: boolean | null;
  order_verification_mode?: string | null;
  order_verification_messages?: Record<string, unknown> | null;
  verification_type?: string | null;
  after_verified_column_id?: string | null;
  cpf_max_attempts_column_id?: string | null;
  order_not_found_column_id?: string | null;
  store_integration_id?: string | null;
  order_details_template?: string | null;
  tracking_link_base?: string | null;
  message_buffer_enabled?: boolean | null;
  message_buffer_delay_seconds?: number | null;
}

/** Message record */
export interface MessageRecord {
  id: string;
  conversation_id: string;
  content: string;
  direction: "incoming" | "outgoing" | "outbound";
  created_at: string;
  sender_name?: string | null;
  sender_id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Message queue item */
export interface MessageQueueRecord {
  id: string;
  tenant_id: string;
  conversation_id?: string | null;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
  direction: string;
  channel_type: string;
  status: string;
  attempts: number;
  next_retry_at?: string | null;
  metadata?: Record<string, unknown> | null;
  email_integration_id?: string | null;
  email_to?: string | null;
  email_subject?: string | null;
}

/** OAuth state record */
export interface OAuthStateRecord {
  id: string;
  state: string;
  provider: string;
  user_id: string;
  tenant_id: string;
  frontend_url?: string | null;
  redirect_path?: string | null;
  expires_at: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

/** ME sync job record */
export interface MESyncJobRecord {
  id: string;
  tenant_id: string;
  integration_id?: string | null;
  status: string;
  current_page: number;
  items_saved: number;
  items_linked: number;
  started_at?: string | null;
  updated_at?: string | null;
  cursor_data?: Record<string, unknown> | null;
  error_message?: string | null;
}

/** Email integration record */
export interface EmailIntegrationRecord {
  id: string;
  tenant_id: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password_encrypted?: string | null;
  smtp_secure?: boolean | null;
  smtp_tls?: boolean | null;
  sender_email?: string | null;
  sender_name?: string | null;
  reply_to?: string | null;
  name?: string | null;
  is_active: boolean;
}

/** Bulk campaign record */
export interface BulkCampaignRecord {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  message_template: string;
  whatsapp_integration_id: string;
  media_url?: string | null;
  media_type?: string | null;
  delay_seconds?: number | null;
  delay_max_seconds?: number | null;
  sent_count?: number | null;
  failed_count?: number | null;
  total_tokens_used?: number | null;
  timezone?: string | null;
  sending_schedule?: Record<string, { start: string; end: string }> | null;
  completed_at?: string | null;
}

/** Campaign contact record */
export interface CampaignContactRecord {
  id: string;
  campaign_id: string;
  phone: string;
  name?: string | null;
  variables?: Record<string, string> | null;
  status: string;
  sent_at?: string | null;
  whatsapp_message_id?: string | null;
  error_message?: string | null;
}

/** AI credential record */
export interface AICredentialRecord {
  id: string;
  tenant_id: string;
  provider: string;
  api_key_encrypted?: string | null;
  is_active: boolean;
  is_default?: boolean;
}

/** Token check/deduction RPC result */
export type RPCBooleanResult = boolean;
