// Cupons da Loja Integrada (https://api-docs.lojaintegrada.com.br/): formato real da API, usado por
// li-coupon-create, li-coupon-sync, li-coupon-update, li-cashback e pelo cupom único por destinatário das campanhas.
// Tipos aceitos: 'porcentagem', 'fixo' (valor em R$) e 'frete_gratis'. Validade em AAAA-MM-DD (sem validade = não envia).
// "Sem limite" de usos não existe: a loja usa números enormes, aqui 999999.

export const LI_API_BASE = "https://api.awsli.com.br/v1";
export type LiCouponKind = "porcentagem" | "fixo" | "frete_gratis";
export const UNLIMITED_USES = 999_999;

export interface CouponSpec {
  codigo: string;
  tipo: LiCouponKind;
  valor: number;
  /** AAAA-MM-DD */
  validade?: string | null;
  /** total de usos permitidos (padrão ilimitado) */
  quantidade?: number;
  quantidadePorCliente?: number;
  valorMinimo?: number | null;
  cumulativo?: boolean;
  ativo?: boolean;
  descricao?: string;
  /** ids dos grupos de clientes que podem usar (vazio = todos os clientes) */
  grupos?: number[];
}

export function buildLiCouponPayload(s: CouponSpec): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    codigo: s.codigo.toUpperCase(),
    tipo: s.tipo,
    valor: (s.tipo === "frete_gratis" ? 0 : s.valor).toFixed(2),
    ativo: s.ativo ?? true,
    quantidade: s.quantidade ?? UNLIMITED_USES,
    quantidade_por_cliente: s.quantidadePorCliente ?? 1,
    cumulativo: s.cumulativo ?? false,
    descricao: s.descricao || `Cupom ${s.codigo.toUpperCase()}`,
    // a API exige estes dois campos
    condicao_cliente: "todos_clientes",
    condicao_produto: "todos_produtos",
  };
  if (s.grupos?.length) {
    payload.condicao_cliente = "grupos_selecionados";
    payload.grupos = s.grupos.map(String);
  }
  if (s.validade) payload.validade = s.validade;
  if (s.valorMinimo && s.valorMinimo > 0) payload.valor_minimo = s.valorMinimo.toFixed(2);
  return payload;
}

export type CreateResult = { ok: true; id: number } | { ok: false; status: number; error: string };

/** Cria o cupom na loja. Devolve o erro da API em texto legível (ex.: código já existe). */
export async function createLiCoupon(authHeader: string, spec: CouponSpec): Promise<CreateResult> {
  const res = await fetch(`${LI_API_BASE}/cupom`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(buildLiCouponPayload(spec)),
    signal: AbortSignal.timeout(20_000),
  });
  if (res.ok) {
    const j = await res.json().catch(() => ({}));
    // algumas respostas vêm sem corpo (201 + Location)
    const id = Number(j?.id ?? (res.headers.get("location") ?? "").match(/(\d+)\/?$/)?.[1]);
    return { ok: true, id: Number.isFinite(id) ? id : 0 };
  }
  const text = await res.text();
  let error = text.slice(0, 300) || `Erro ${res.status} na Loja Integrada`;
  try {
    const e = JSON.parse(text);
    if (e.codigo) error = `Código: ${[].concat(e.codigo).join(", ")}`;
    else if (e.detail) error = String(e.detail);
  } catch { /* texto puro */ }
  return { ok: false, status: res.status, error };
}

// sem caracteres que se confundem (0/O, 1/I/L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomCouponCode(prefix = "", length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${prefix.toUpperCase().replace(/[^A-Z0-9]/g, "")}${body}`.slice(0, 20);
}

// ---- leitura (sincronização) ----

export interface LiCoupon {
  id: number; codigo: string; descricao?: string | null; tipo: string; valor: string | number | null;
  quantidade?: number | null; quantidade_usada?: number | null; quantidade_por_cliente?: number | null;
  validade?: string | null; valor_minimo?: string | number | null; ativo?: boolean; cumulativo?: boolean;
  data_modificacao?: string | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
/** "2025-10-19T23:59:59" (horário de Brasília, sem fuso) -> ISO com fuso. */
const brDate = (v?: string | null): string | null => {
  if (!v) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
/** Cupons gerados sozinhos (cashback): código USE + 5 caracteres, descrição igual ao código, uso único. */
export const isAutoCoupon = (c: LiCoupon) => /^USE[A-Z0-9]{5}$/.test(c.codigo) && (c.descricao ?? "").toUpperCase() === c.codigo && c.quantidade === 1;

export function liCouponToRow(c: LiCoupon, ctx: { tenantId: string; integrationId: string }, prev?: { source: string | null; used_at: string | null }) {
  const valor = num(c.valor);
  const max = c.quantidade ?? null;
  const usadas = c.quantidade_usada ?? 0;
  const validade = brDate(c.validade);
  return {
    tenant_id: ctx.tenantId,
    integration_id: ctx.integrationId,
    coupon_code: c.codigo,
    li_coupon_id: c.id,
    coupon_type: c.tipo,
    coupon_description: c.descricao || null,
    discount_percentage: c.tipo === "porcentagem" ? valor ?? 0 : 0,
    coupon_value: c.tipo === "fixo" ? valor : null,
    li_data_fim: validade,
    expires_at: validade,
    li_quantidade_uso_maximo: max != null && max > 0 && max < 100_000 ? max : null,
    li_quantidade_usada: usadas,
    li_quantidade_por_cliente: c.quantidade_por_cliente ?? null,
    li_valor_minimo: num(c.valor_minimo),
    li_ativo: c.ativo ?? null,
    li_cumulativo: c.cumulativo ?? null,
    // quem criou pelo sistema (manual / e-mail) mantém a origem; o resto é automático (cashback) ou importado
    source: prev?.source && prev.source !== "imported" ? prev.source : isAutoCoupon(c) ? "cashback" : /^E-mail: /.test(c.descricao ?? "") ? "email" : "imported",
    used_at: prev?.used_at ?? (usadas > 0 ? brDate(c.data_modificacao) ?? new Date().toISOString() : null),
  };
}
