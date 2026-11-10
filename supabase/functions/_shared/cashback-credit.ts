// Ciclo de vida do crédito de cashback (tabela cashback_credits): pendente -> liberando -> liberado | cancelado | ignorado | falhou.
// A reivindicação é atômica (UPDATE condicionado ao status): o consumidor do pedido e o cron podem tentar o mesmo crédito sem enviar duas vezes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;

export const MAX_RELEASE_ATTEMPTS = 5;
const RETRY_MINUTES = 30;

export interface CashbackCredit {
  id: string; tenant_id: string; config_id: string | null; integration_id: string | null;
  order_number: string; order_ref: string | null; li_customer_id: string | null;
  customer_name: string | null; customer_email: string | null; customer_phone: string | null; customer_cpf: string | null;
  base_amount: number; credit_amount: number; status: string; attempts: number;
}

/** Marca como "liberando" só se ainda estiver pendente. Devolve o crédito ou null (outro processo já pegou / não está mais pendente). */
export async function claimCredit(supabase: Supabase, id: string): Promise<CashbackCredit | null> {
  const { data } = await supabase.from("cashback_credits")
    .update({ status: "releasing" })
    .eq("id", id).eq("status", "pending").select("*").maybeSingle();
  return (data as CashbackCredit | null) ?? null;
}

export async function markReleased(supabase: Supabase, id: string, couponLedgerId: string): Promise<void> {
  await supabase.from("cashback_credits").update({ status: "released", released_at: new Date().toISOString(), coupon_id: couponLedgerId, last_error: null }).eq("id", id);
}

/** Fora da janela de envio: devolve o crédito à fila para abrir de novo na hora indicada (não conta como tentativa). */
export async function deferCredit(supabase: Supabase, id: string, until: Date): Promise<void> {
  await supabase.from("cashback_credits").update({ status: "pending", release_at: until.toISOString() }).eq("id", id);
}

/** Terminou sem cupom por regra (pedido revertido, cliente excluído...): não tenta de novo. */
export async function markFinal(supabase: Supabase, id: string, status: "cancelled" | "skipped", reason: string): Promise<void> {
  await supabase.from("cashback_credits").update({ status, skip_reason: reason }).eq("id", id);
}

/** Erro transitório (loja fora do ar, tokens): volta para pendente com nova tentativa; depois de várias, marca como falhou. */
export async function markRetry(supabase: Supabase, credit: Pick<CashbackCredit, "id" | "attempts">, error: string): Promise<void> {
  const attempts = (credit.attempts ?? 0) + 1;
  if (attempts >= MAX_RELEASE_ATTEMPTS) {
    await supabase.from("cashback_credits").update({ status: "failed", attempts, last_error: error.slice(0, 500) }).eq("id", credit.id);
    return;
  }
  await supabase.from("cashback_credits").update({
    status: "pending", attempts, last_error: error.slice(0, 500),
    release_at: new Date(Date.now() + RETRY_MINUTES * 60_000).toISOString(),
  }).eq("id", credit.id);
}

/** Cliente na lista de exclusão do cashback? (chave = e-mail minúsculo, senão telefone com 55) */
export async function isExcluded(supabase: Supabase, tenantId: string, email?: string | null, phone?: string | null): Promise<boolean> {
  const { data: key } = await supabase.rpc("customer_key", { p_email: email ?? null, p_phone: phone ?? null });
  if (!key) return false;
  const { data } = await supabase.from("cashback_exclusions").select("id").eq("tenant_id", tenantId).eq("customer_key", key as string).limit(1).maybeSingle();
  return !!data;
}
