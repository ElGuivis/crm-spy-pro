import { replaceVariables } from "../_shared/email-variable-replacer.ts";
import type { IssuedCoupon } from "../_shared/email-coupons.ts";
import { buildCartVars, type FlowStep } from "../_shared/abandonment-render.ts";
import type { Candidate, Ctx, Flow, SendOutcome } from "./types.ts";

const TOKENS_PER_MESSAGE = 2; // mesmo custo do disparo em massa

/** 11999998888 / +55 (11) 99999-8888 → 5511999998888 (Brasil por padrão). */
export function formatPhone(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55") && d.length <= 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

/** Instância Evolution do fluxo (null se desconectada) — uma busca por rodada e fluxo. */
export async function loadWhatsAppInstance(ctx: Ctx, integrationId: string): Promise<string | null> {
  const { data } = await ctx.supabase.from("integrations").select("metadata, status").eq("id", integrationId).maybeSingle();
  const name = (data?.metadata as Record<string, string> | null)?.instanceName;
  return data?.status === "connected" && name ? name : null;
}

/** Mensagem de WhatsApp de uma etapa. A cobrança de tokens acontece só depois do envio aceito. */
export async function sendWhatsAppStep(ctx: Ctx, flow: Flow, step: FlowStep, cand: Candidate, storeUrl: string, instance: string, coupon: IssuedCoupon): Promise<SendOutcome> {
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
  if (!evolutionUrl || !evolutionKey) return { ok: false, error: "Evolution API não configurada no servidor.", abort: true };
  const number = cand.recipient_phone ? formatPhone(cand.recipient_phone) : null;
  if (!number) return { ok: false, error: "Telefone ausente ou inválido." };

  const { data: enough } = await ctx.supabase.rpc("has_enough_tokens", { _tenant_id: flow.tenant_id, _amount: TOKENS_PER_MESSAGE });
  if (!enough) return { ok: false, error: "Tokens insuficientes para enviar WhatsApp.", abort: true };

  const first = (cand.recipient_name ?? "").trim().split(/\s+/)[0] || "";
  const text = replaceVariables(step.whatsapp!.text, {
    first_name: first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "", email: cand.recipient_email ?? "", phone: cand.recipient_phone ?? "",
    coupon_code: coupon.code, coupon_value: coupon.discount, coupon_expires: coupon.expires,
    ...buildCartVars(cand.items ?? [], cand.value, storeUrl),
  });

  try {
    const res = await fetch(`${evolutionUrl.replace(/\/$/, "")}/message/sendText/${instance}`, {
      method: "POST", headers: { apikey: evolutionKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number, text }), signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { ok: false, error: `WhatsApp recusou (${res.status}): ${(await res.text()).slice(0, 160)}`, coupon: coupon.code || undefined };
  } catch (e) {
    return { ok: false, error: `Falha ao enviar WhatsApp: ${(e as Error).message}` };
  }
  await ctx.supabase.rpc("deduct_tokens", { _tenant_id: flow.tenant_id, _amount: TOKENS_PER_MESSAGE, _type: "abandonment_recovery", _description: `Recuperação (${flow.kind}) por WhatsApp`, _reference_id: cand.id });
  return { ok: true, coupon: coupon.code || undefined };
}
