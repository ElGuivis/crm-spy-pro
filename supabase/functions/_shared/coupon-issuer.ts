// Emissor único de cupom: TODO módulo que cria cupom na Loja Integrada passa por aqui (cashback, aniversário, reativação,
// e-mail marketing, recuperação, boas-vindas, manual). Garante o mesmo comportamento em todos:
//   1. reserva o código no livro-razão (generated_coupons, issue_status 'pending') ANTES de chamar a loja: um código nunca vale para duas pessoas;
//   2. chama a loja com nova tentativa em 429/5xx (ela recusa rajadas) e sorteia outro código se houver colisão;
//   3. confirma no livro-razão ('issued', id da loja) ou apaga a reserva se a loja recusou.
// O uso do cupom (pedido e valor) é preenchido depois pelo gatilho de li_orders; o retorno por origem sai de get_coupon_performance.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLiCoupon, randomCouponCode, type CouponSpec } from "./li-coupons.ts";

type Supabase = ReturnType<typeof createClient>;

export type CouponOrigin = "cashback" | "birthday" | "reactivation" | "email_campaign" | "recovery" | "welcome" | "manual" | "loyalty";

/** Valor de generated_coupons.source (legado) para cada origem. */
const SOURCE_BY_ORIGIN: Record<CouponOrigin, string> = {
  cashback: "cashback", birthday: "birthday", reactivation: "reactivation", email_campaign: "email", recovery: "email", welcome: "email", manual: "manual", loyalty: "loyalty",
};

export interface IssueRequest {
  tenantId: string;
  integrationId: string;
  /** cabeçalho de autenticação da loja (liAuthHeader) */
  auth: string;
  /** quem está emitindo: módulo, configuração/campanha (uuid) e referência livre (etapa, ciclo...) */
  origin: { type: CouponOrigin; id?: string | null; ref?: string | null };
  /** o cupom na loja; `codigo` informado = código fixo (erro se já existir), senão é sorteado */
  spec: Omit<CouponSpec, "codigo"> & { codigo?: string };
  /** como sortear o código quando não é fixo (padrão: prefixo + 6 caracteres) */
  codeFactory?: () => string;
  prefix?: string;
  recipient?: { name?: string | null; email?: string | null; phone?: string | null; cpf?: string | null };
  /** pedido que originou o cupom (cashback) */
  orderRef?: string | null;
  /** só cashback: configuração dona do cupom (chave estrangeira de generated_coupons.config_id) */
  cashbackConfigId?: string | null;
  /** percentual a registrar quando o cupom é de valor fixo calculado por percentual (cashback) */
  percentageForRecord?: number;
}

export type IssueResult =
  | { ok: true; code: string; liId: number; ledgerId: string; expires: string }
  | { ok: false; status: number; error: string; authError?: boolean };

const MAX_CODE_TRIES = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FAR_FUTURE = "2099-12-31";

async function createWithRetry(auth: string, spec: CouponSpec) {
  let last: Awaited<ReturnType<typeof createLiCoupon>> = { ok: false, status: 0, error: "sem resposta da loja" };
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await createLiCoupon(auth, spec).catch((e) => ({ ok: false as const, status: 0, error: String((e as Error)?.message ?? e) }));
    if (last.ok) return last;
    const transient = last.status === 429 || last.status === 0 || last.status >= 500;
    if (!transient) return last;
    await sleep(800 * (attempt + 1) * (last.status === 429 ? 2 : 1)); // limite de requisições: espera mais
  }
  return last;
}

export async function issueCoupon(supabase: Supabase, req: IssueRequest): Promise<IssueResult> {
  const fixed = req.spec.codigo?.trim().toUpperCase() || null;
  const validade = req.spec.validade ?? null;
  const expiresIso = `${validade ?? FAR_FUTURE}T23:59:59-03:00`;
  let lastError = "não foi possível reservar um código";

  for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
    const code = fixed ?? (req.codeFactory ? req.codeFactory() : randomCouponCode(req.prefix ?? "", 6)).toUpperCase();
    const tipo = req.spec.tipo;

    const { data: reserved, error: reserveError } = await supabase.from("generated_coupons").insert({
      tenant_id: req.tenantId, integration_id: req.integrationId, config_id: req.cashbackConfigId ?? null,
      coupon_code: code, issue_status: "pending", source: SOURCE_BY_ORIGIN[req.origin.type],
      origin_type: req.origin.type, origin_id: req.origin.id ?? null, origin_ref: req.origin.ref ?? null,
      discount_percentage: tipo === "porcentagem" ? req.spec.valor : (req.percentageForRecord ?? 0), coupon_value: tipo === "fixo" ? req.spec.valor : null,
      coupon_type: tipo, coupon_description: req.spec.descricao ?? null, expires_at: expiresIso,
      li_data_inicio: new Date().toISOString(), li_data_fim: validade ? expiresIso : null,
      li_quantidade_uso_maximo: req.spec.quantidade != null && req.spec.quantidade < 999_999 ? req.spec.quantidade : null, li_quantidade_usada: 0, li_quantidade_por_cliente: req.spec.quantidadePorCliente ?? 1,
      li_valor_minimo: req.spec.valorMinimo ?? null, li_ativo: req.spec.ativo ?? true, li_cumulativo: req.spec.cumulativo ?? false,
      customer_name: req.recipient?.name ?? null, customer_email: req.recipient?.email ?? null, customer_phone: req.recipient?.phone ?? null,
      customer_cpf: req.recipient?.cpf ?? null, order_id: req.orderRef ?? null,
    }).select("id").single();

    if (reserveError) {
      if (reserveError.code === "23505") { // código já existe no livro-razão
        if (fixed) return { ok: false, status: 409, error: "Esse código de cupom já existe." };
        lastError = "colisão de código"; continue;
      }
      return { ok: false, status: 0, error: `Falha ao registrar o cupom: ${reserveError.message}` };
    }

    const created = await createWithRetry(req.auth, { ...req.spec, codigo: code });
    if (created.ok) {
      await supabase.from("generated_coupons").update({ li_coupon_id: created.id || null, issue_status: "issued" }).eq("id", reserved.id);
      return { ok: true, code, liId: created.id, ledgerId: reserved.id as string, expires: validade ?? "" };
    }

    await supabase.from("generated_coupons").delete().eq("id", reserved.id); // a loja recusou: não deixa registro
    lastError = created.error;
    if (created.status === 401 || created.status === 403) return { ok: false, status: created.status, error: `A Loja Integrada recusou o acesso (${created.status}). Reconecte a loja em Integrações.`, authError: true };
    if (!fixed && /c[óo]digo/i.test(created.error)) continue; // código já existe na loja (fora do nosso registro): sorteia outro
    return { ok: false, status: created.status, error: created.error };
  }
  return { ok: false, status: 409, error: `Não foi possível gerar um código livre: ${lastError}` };
}
