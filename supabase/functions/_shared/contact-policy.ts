// Regra única de contato (Fase N3): todo envio de marketing/automação consulta `canContact`/`blockedTargets` antes e grava `recordTouches` depois.
// As regras ficam em SQL (get_contact_blockers) para valer em lote: supressão de e-mail, telefone bloqueado, limite diário por pessoa
// (todos os canais somados) e prioridade (disparo em massa cede a quem recebeu algo de ciclo de vida). Cashback e aniversário não entram no limite.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;

export type TouchPurpose = "campaign" | "bulk" | "recovery" | "welcome" | "cashback" | "cashback_reminder" | "birthday" | "reactivation";
export type TouchChannel = "email" | "whatsapp";
export interface ContactTarget { email?: string | null; phone?: string | null }

export const normEmail = (e?: string | null): string | null => {
  const v = (e ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
};

/** 11999998888 / +55 (11) 99999-8888 → 5511999998888; inválido → null. */
export function normPhone(p?: string | null): string | null {
  let d = (p ?? "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length >= 10 && d.length <= 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

export const REASON_TEXT: Record<string, string> = {
  suppressed: "e-mail na lista de supressão",
  blocked: "telefone bloqueado",
  daily_cap: "limite diário de mensagens por pessoa",
  priority_gap: "recebeu outra mensagem automática há pouco (prioridade)",
};
/** Supressão e bloqueio não passam com o tempo; limite diário e prioridade, sim (vale esperar). */
export const isPermanentReason = (reason: string) => reason === "suppressed" || reason === "blocked";

const CHUNK = 400;

/** Para cada pessoa bloqueada, o motivo (a chave do mapa é o índice do alvo na lista recebida). */
export async function blockedTargets(supabase: Supabase, tenantId: string, targets: ContactTarget[], purpose: TouchPurpose): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  for (let from = 0; from < targets.length; from += CHUNK) {
    const slice = targets.slice(from, from + CHUNK);
    const emails = [...new Set(slice.map((t) => normEmail(t.email)).filter((x): x is string => !!x))];
    const phones = [...new Set(slice.map((t) => normPhone(t.phone)).filter((x): x is string => !!x))];
    if (!emails.length && !phones.length) continue;
    const { data, error } = await supabase.rpc("get_contact_blockers", { p_tenant_id: tenantId, p_emails: emails, p_phones: phones, p_purpose: purpose });
    if (error) throw new Error(`regras de contato: ${error.message}`);
    const byKey = new Map<string, string[]>();
    for (const r of (data ?? []) as { contact_key: string; reason: string }[]) byKey.set(r.contact_key, [...(byKey.get(r.contact_key) ?? []), r.reason]);
    slice.forEach((t, i) => {
      const reasons = [...(byKey.get(normEmail(t.email) ?? "") ?? []), ...(byKey.get(normPhone(t.phone) ?? "") ?? [])];
      if (!reasons.length) return;
      out.set(from + i, reasons.find(isPermanentReason) ?? reasons[0]);
    });
  }
  return out;
}

export type ContactDecision = { ok: true } | { ok: false; reason: string; permanent: boolean };

/** Uma pessoa só. Se a consulta falhar, NÃO bloqueia (a regra nunca deve derrubar um envio legítimo). */
export async function canContact(supabase: Supabase, tenantId: string, target: ContactTarget, purpose: TouchPurpose): Promise<ContactDecision> {
  try {
    const blocked = await blockedTargets(supabase, tenantId, [target], purpose);
    const reason = blocked.get(0);
    return reason ? { ok: false, reason, permanent: isPermanentReason(reason) } : { ok: true };
  } catch {
    return { ok: true };
  }
}

export interface TouchRow { target: ContactTarget; channel: TouchChannel; purpose: TouchPurpose; ref?: string | null }

/** Grava os envios que realmente saíram. Falha aqui nunca derruba o envio. */
export async function recordTouches(supabase: Supabase, tenantId: string, rows: TouchRow[]): Promise<void> {
  const data = rows
    .map((r) => ({ tenant_id: tenantId, email: normEmail(r.target.email), phone: normPhone(r.target.phone), channel: r.channel, purpose: r.purpose, module_ref: r.ref ?? null }))
    .filter((r) => r.email || r.phone);
  for (let i = 0; i < data.length; i += 500) {
    const { error } = await supabase.from("customer_touches").insert(data.slice(i, i + 500));
    if (error) console.error("[contact-policy] não gravou o toque:", error.message);
  }
}
