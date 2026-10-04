import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { createLiCoupon, randomCouponCode, type LiCouponKind } from "../_shared/li-coupons.ts";

type Supabase = ReturnType<typeof createClient>;

/** Cupom único por destinatário (email_campaigns.unique_coupon). */
export interface UniqueCouponConfig { tipo: LiCouponKind; valor: number; validade_dias: number; valor_minimo?: number | null; prefixo?: string }
export interface IssuedCoupon { code: string; discount: string; expires: string }

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
export const discountText = (c: UniqueCouponConfig) => (c.tipo === "porcentagem" ? `${c.valor}%` : c.tipo === "fixo" ? brl(c.valor) : "Frete grátis");

/** Data de validade (AAAA-MM-DD, horário de Brasília) para um cupom criado em `from`. */
const expiryDate = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().join("/");

export function parseUniqueCoupon(raw: unknown): UniqueCouponConfig | null {
  const c = raw as Partial<UniqueCouponConfig> | null;
  if (!c || !["porcentagem", "fixo", "frete_gratis"].includes(String(c.tipo))) return null;
  const valor = Number(c.valor ?? 0);
  if (c.tipo !== "frete_gratis" && !(valor > 0)) return null;
  return { tipo: c.tipo as LiCouponKind, valor, validade_dias: Math.min(Math.max(Number(c.validade_dias) || 7, 1), 365), valor_minimo: c.valor_minimo ? Number(c.valor_minimo) : null, prefixo: c.prefixo };
}

/** Cabeçalho de autenticação da Loja Integrada conectada do tenant (null se não houver). */
export async function getLiAuth(supabase: Supabase, tenantId: string): Promise<string | null> {
  const { data } = await supabase.from("integrations").select("api_key").eq("tenant_id", tenantId).eq("type", "loja_integrada").eq("status", "connected").limit(1).maybeSingle();
  return data?.api_key ? liAuthHeader(data.api_key) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WORKERS = 4; // a API da loja recusa rajadas (HTTP 429)

/**
 * Garante um cupom por destinatário: reaproveita o que já foi criado (retomada após queda) e cria o que falta na loja.
 * Cada cupom vale 1 uso, 1 por cliente, com a validade da configuração a partir de agora.
 */
export async function issueCoupons(
  supabase: Supabase,
  o: { tenantId: string; campaignId: string; campaignName: string; cfg: UniqueCouponConfig; auth: string },
  emails: string[],
): Promise<{ issued: Map<string, IssuedCoupon>; failed: Map<string, string>; authError?: string }> {
  const issued = new Map<string, IssuedCoupon>();
  const failed = new Map<string, string>();
  const toIssued = (code: string, createdAt: Date): IssuedCoupon => ({ code, discount: discountText(o.cfg), expires: brDate(expiryDate(createdAt, o.cfg.validade_dias)) });

  const { data: existing } = await supabase.from("email_campaign_coupons").select("recipient_email, code, created_at").eq("campaign_id", o.campaignId).in("recipient_email", emails);
  for (const r of existing ?? []) issued.set(r.recipient_email as string, toIssued(r.code as string, new Date(r.created_at as string)));

  const missing = emails.filter((e) => !issued.has(e));
  let authError: string | undefined;
  let next = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (!authError) {
      const email = missing[next++];
      if (!email) return;
      const now = new Date();
      let lastError = "erro desconhecido";
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCouponCode(o.cfg.prefixo || "EM", 6);
        const res = await createLiCoupon(o.auth, {
          codigo: code, tipo: o.cfg.tipo, valor: o.cfg.valor, validade: expiryDate(now, o.cfg.validade_dias), quantidade: 1, quantidadePorCliente: 1,
          valorMinimo: o.cfg.valor_minimo, descricao: `E-mail: ${o.campaignName}`.slice(0, 120),
        }).catch((e) => ({ ok: false as const, status: 0, error: String(e?.message ?? e) }));
        if (res.ok) {
          const { error } = await supabase.from("email_campaign_coupons").upsert(
            { tenant_id: o.tenantId, campaign_id: o.campaignId, recipient_email: email, code, li_coupon_id: res.id || null },
            { onConflict: "campaign_id,recipient_email", ignoreDuplicates: true },
          );
          if (error) { lastError = error.message; break; }
          issued.set(email, toIssued(code, now));
          lastError = "";
          break;
        }
        lastError = res.error;
        if (res.status === 401 || res.status === 403) { authError = `A Loja Integrada recusou o acesso (${res.status}). Reconecte a loja em Integrações.`; break; }
        if (res.status === 429 || res.status === 0 || res.status >= 500) { await sleep(700 * (attempt + 1)); continue; } // limite de requisições ou falha passageira
        if (/c[óo]digo/i.test(res.error)) continue; // código já existe: sorteia outro
        break; // outro erro: não adianta repetir
      }
      if (lastError && !issued.has(email)) failed.set(email, `Não foi possível criar o cupom: ${lastError}`.slice(0, 300));
    }
  }));
  // quem ficou pendente por erro de acesso volta para a fila (a campanha vai parar)
  return { issued, failed, authError };
}

