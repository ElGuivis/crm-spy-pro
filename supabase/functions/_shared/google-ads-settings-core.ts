/** Validacao do teto mensal de gastos (em reais, vindo do formulario). Funcao pura, testada. */

export const MAX_MONTHLY_CAP_BRL = 10_000_000;

/**
 * Texto de dinheiro SEM ambiguidade (ponto errado multiplicaria o teto por 100): "1.500,50" e "1500,5" (pt-BR),
 * "1500.50" (ponto com 1-2 casas decimais) e "1500". "1.500" = mil e quinhentos (pt-BR). Qualquer outro formato = NaN.
 */
function parseMoneyText(raw: string): number {
  const s = raw.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d+(,\d{1,2})?$/.test(s)) return Number(s.replace(",", "."));
  if (/^\d+\.\d{1,2}$/.test(s)) return Number(s);
  return NaN;
}

export type CapParse = { ok: true; micros: number | null } | { ok: false; error: string };

/**
 * null / "" / undefined -> remove o teto. Numero (ou texto numerico, aceitando virgula) > 0 e <= MAX -> micros.
 * Arredonda para centavos. Recusa negativo, zero, NaN/Infinity e valores absurdos (erro de digitacao custa caro).
 */
export function parseMonthlyCap(input: unknown): CapParse {
  if (input === null || input === undefined || input === "") return { ok: true, micros: null };
  const n = typeof input === "number" ? input : typeof input === "string" ? parseMoneyText(input) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: "Valor invalido" };
  if (n <= 0) return { ok: false, error: "O teto deve ser maior que zero (ou vazio para remover)" };
  if (n > MAX_MONTHLY_CAP_BRL) return { ok: false, error: "Valor acima do maximo permitido" };
  return { ok: true, micros: Math.round(n * 100) * 10_000 };
}
