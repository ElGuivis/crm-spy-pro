import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import type { CartItem, FlowStep } from "../_shared/abandonment-render.ts";
import type { RateLimiter, SmtpSession } from "../_shared/email-sender-pool.ts";
import type { EmailConfig } from "../_shared/email-sender.ts";

export type Supabase = ReturnType<typeof createClient>;
export type Log = { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
export type Channel = "email" | "whatsapp";
export type Kind = "cart" | "browse" | "order" | "welcome";

export interface Flow {
  tenant_id: string; kind: Kind; enabled: boolean; enabled_at: string | null;
  email_integration_id: string | null; whatsapp_integration_id: string | null;
  steps: FlowStep[]; quiet_start: string; quiet_end: string;
  max_event_age_hours: number; cooldown_days: number; min_value: number; opt_out_native: boolean;
}

export interface Candidate {
  id: string; tenant_id: string; integration_id: string; kind: Kind; automation_id: number;
  value: number; items: CartItem[]; recipient_email: string | null; recipient_name: string | null; recipient_phone: string | null;
  event_at: string; native_optout_at: string | null;
}

export interface EmailRuntime {
  config: EmailConfig; limiter: RateLimiter; session: SmtpSession;
  senders: { email: string; name: string }[]; next: number;
}

export interface FlowCampaign {
  id: string; internal_name: string; subject: string; preheader: string | null; content_html: string | null; email_integration_id: string | null;
}

/** Estado compartilhado de uma rodada do processador. */
export interface Ctx {
  supabase: Supabase; supabaseUrl: string; log: Log; deadline: number;
  sent: { email: number; whatsapp: number };
  campaigns: Map<string, FlowCampaign | null>;
  email: Map<string, EmailRuntime | { error: string }>;
}

export interface SendOutcome { ok: boolean; error?: string; coupon?: string; abort?: boolean }

export const MAX_EMAILS_PER_RUN = 60;
export const MAX_WHATSAPP_PER_RUN = 4;

export const timeLeft = (ctx: Ctx) => ctx.deadline - Date.now();
