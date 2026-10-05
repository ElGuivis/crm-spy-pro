import { getLiAuth, issueCoupons, parseUniqueCoupon, type IssuedCoupon } from "../_shared/email-coupons.ts";
import type { FlowStep } from "../_shared/abandonment-render.ts";
import type { Candidate, Ctx, Flow } from "./types.ts";

export const NO_COUPON: IssuedCoupon = { code: "", discount: "", expires: "" };

/**
 * Cupom único da etapa para este abandono, compartilhado entre e-mail e WhatsApp.
 * Fica registrado na campanha da etapa (email_campaign_coupons) para a atribuição de compra reconhecer o código.
 * A chave inclui o id do abandono: quem abandona de novo ganha um cupom novo, não o vencido da vez anterior.
 */
export async function issueStepCoupon(ctx: Ctx, flow: Flow, step: FlowStep, cand: Candidate): Promise<{ coupon: IssuedCoupon; error?: string; abort?: boolean }> {
  const cfg = parseUniqueCoupon(step.coupon);
  if (!cfg) return { coupon: NO_COUPON };
  const campaignId = step.email?.campaign_id;
  if (!campaignId) return { coupon: NO_COUPON, error: "A etapa com cupom precisa ter uma campanha de e-mail criada (ela guarda os cupons)." };
  const auth = await getLiAuth(ctx.supabase, flow.tenant_id);
  if (!auth) return { coupon: NO_COUPON, error: "Cupom do fluxo precisa da Loja Integrada conectada." };
  const key = `${cand.recipient_email ?? cand.recipient_phone}#${cand.id.slice(0, 8)}`;
  const r = await issueCoupons(ctx.supabase, { tenantId: flow.tenant_id, campaignId, campaignName: `Recuperação ${flow.kind} · ${step.id}`, cfg, auth }, [key]);
  const issued = r.issued.get(key);
  if (!issued) return { coupon: NO_COUPON, error: r.authError || r.failed.get(key) || "Cupom não criado.", abort: !!r.authError };
  return { coupon: issued };
}
