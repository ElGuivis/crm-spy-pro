/**
 * Regras puras da conversao offline "Compra paga (CRM)" (sem rede, sem banco; testadas em tests/google-ads-offline.test.ts).
 *
 * A loja guarda em `utm_campaign` o que o Google manda no sufixo de URL da conta:
 *   utm_campaign={campaignid}_{gclid}   ->   "20788231391_Cj0KCQ..."
 * Pedidos antigos trazem so o id da campanha (sem gclid): nao tem como enviar.
 */

export type OrderKind = "paid" | "retract" | "other";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Pago (venda confirmada), perdido (cancelado/devolvido/chargeback) ou ainda indefinido (aguardando pagamento etc.). */
export function orderKind(statusName: string | null | undefined): OrderKind {
  const s = norm(statusName ?? "");
  if (!s) return "other";
  if (s.includes("cancel") || s.includes("devolv") || s.includes("chargeback")) return "retract";
  if (["pedido pago", "pedido enviado", "pedido em separacao", "pedido entregue"].includes(s)) return "paid";
  return "other";
}

/** Separa "<campanha>_<gclid>". Devolve null se nao houver gclid utilizavel (inclusive o texto literal "{gclid}"). */
export function parseUtmCampaign(utm: string | null | undefined): { campaignId: string; gclid: string } | null {
  const m = /^(\d{5,})_([A-Za-z0-9_-]{20,})$/.exec((utm ?? "").trim());
  return m ? { campaignId: m[1], gclid: m[2] } : null;
}

/** Valor da venda para o Google: o que o cliente pagou SEM frete (frete nao e receita de produto). */
export function conversionValue(totals: { total?: unknown; shipping?: unknown } | null | undefined): number {
  const total = Number(totals?.total ?? 0);
  const shipping = Number(totals?.shipping ?? 0);
  const v = (Number.isFinite(total) ? total : 0) - (Number.isFinite(shipping) ? shipping : 0);
  return Math.max(0, Math.round(v * 100) / 100);
}

/** "yyyy-MM-dd HH:mm:ss-03:00" (Brasil sem horario de verao desde 2019; a conta esta em America/Sao_Paulo). */
export function formatConversionTime(d: Date): string {
  const br = new Date(d.getTime() - 3 * 3600_000);
  return br.toISOString().slice(0, 19).replace("T", " ") + "-03:00";
}

export function buildClickConversion(p: { gclid: string; actionId: number | string; customerId: string; orderNumber: string; value: number; time: Date }) {
  return {
    gclid: p.gclid,
    conversionAction: `customers/${p.customerId}/conversionActions/${p.actionId}`,
    conversionDateTime: formatConversionTime(p.time),
    conversionValue: p.value,
    currencyCode: "BRL",
    orderId: p.orderNumber,
  };
}

export function buildRetraction(p: { actionId: number | string; customerId: string; orderNumber: string; time: Date }) {
  return {
    conversionAction: `customers/${p.customerId}/conversionActions/${p.actionId}`,
    adjustmentType: "RETRACTION",
    orderId: p.orderNumber,
    adjustmentDateTime: formatConversionTime(p.time),
  };
}

export type UploadVerdict = "ok" | "retry" | "failed";

/** Codigos de ConversionUploadError / ConversionAdjustmentUploadError: o que repetir mais tarde e o que e definitivo. */
export function classifyUploadError(code: string | undefined): UploadVerdict {
  if (!code) return "failed";
  if (code === "DUPLICATE_ORDER_ID" || code === "CONVERSION_ALREADY_RETRACTED") return "ok"; // ja esta la
  if (["TOO_RECENT_EVENT", "TOO_RECENT_CONVERSION_ACTION", "EVENT_NOT_FOUND", "CONVERSION_NOT_FOUND"].includes(code)) return "retry";
  return "failed";
}

/** Le o partialFailureError da resposta: indice da operacao -> codigo/mensagem. */
export function parsePartialFailure(body: unknown): Map<number, { code: string; message: string }> {
  const out = new Map<number, { code: string; message: string }>();
  const details = (body as { partialFailureError?: { details?: Array<{ errors?: Array<{ errorCode?: Record<string, string>; message?: string; location?: { fieldPathElements?: Array<{ fieldName?: string; index?: number | string }> } }> }> } })?.partialFailureError?.details ?? [];
  for (const d of details) {
    for (const e of d.errors ?? []) {
      const el = (e.location?.fieldPathElements ?? []).find((x) => ["conversions", "conversionAdjustments", "conversion_adjustments", "adjustments"].includes(x.fieldName ?? ""));
      if (el?.index === undefined) continue;
      out.set(Number(el.index), { code: Object.values(e.errorCode ?? {})[0] ?? "UNKNOWN", message: e.message ?? "" });
    }
  }
  return out;
}
