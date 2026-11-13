import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildClickConversion, buildRetraction, classifyUploadError, conversionValue, formatConversionTime, orderKind, parsePartialFailure, parseUtmCampaign,
} from "../_shared/google-ads-offline-core.ts";

const GCLID = "Cj0KCQiAabcdefghijklmnopqrstuvwxyz_-0123456789";

Deno.test("orderKind: pago, perdido e indefinido (sem acento/caixa)", () => {
  for (const s of ["Pedido Pago", "Pedido Enviado", "Pedido em separação", "pedido entregue"]) assertEquals(orderKind(s), "paid", s);
  for (const s of ["Pedido Cancelado", "Pagamento devolvido", "Pagamento devolvido - sem retorno de item", "Pagamento em chargeback"]) assertEquals(orderKind(s), "retract", s);
  for (const s of ["Aguardando pagamento", "", null, undefined]) assertEquals(orderKind(s as string), "other");
});

Deno.test("parseUtmCampaign: so aceita <campanha>_<gclid>", () => {
  assertEquals(parseUtmCampaign(`20788231391_${GCLID}`), { campaignId: "20788231391", gclid: GCLID });
  assertEquals(parseUtmCampaign("20788231391"), null);                 // pedido antigo, sem gclid
  assertEquals(parseUtmCampaign("20788231391_{gclid}"), null);         // placeholder nao substituido
  assertEquals(parseUtmCampaign("20788231391_curto"), null);
  assertEquals(parseUtmCampaign(null), null);
  assertEquals(parseUtmCampaign("black-friday_" + GCLID), null);       // utm manual de outra origem
});

Deno.test("conversionValue: total sem frete, nunca negativo", () => {
  assertEquals(conversionValue({ total: 241.04, shipping: 23.51 }), 217.53);
  assertEquals(conversionValue({ total: "100", shipping: "130" }), 0);
  assertEquals(conversionValue(null), 0);
});

Deno.test("formatConversionTime: horario de Brasilia com offset -03:00", () => {
  assertEquals(formatConversionTime(new Date("2026-11-13T04:53:05Z")), "2026-11-13 01:53:05-03:00");
});

Deno.test("buildClickConversion / buildRetraction", () => {
  const c = buildClickConversion({ gclid: GCLID, actionId: 7901902681, customerId: "5220063897", orderNumber: "9937", value: 217.53, time: new Date("2026-11-13T04:53:05Z") });
  assertEquals(c.conversionAction, "customers/5220063897/conversionActions/7901902681");
  assertEquals(c.orderId, "9937");
  assertEquals(c.currencyCode, "BRL");
  const r = buildRetraction({ actionId: 7901902681, customerId: "5220063897", orderNumber: "9937", time: new Date("2026-11-13T12:00:00Z") });
  assertEquals(r.adjustmentType, "RETRACTION");
  assertEquals(r.adjustmentDateTime, "2026-11-13 09:00:00-03:00");
});

Deno.test("classifyUploadError e parsePartialFailure", () => {
  assertEquals(classifyUploadError("DUPLICATE_ORDER_ID"), "ok");
  assertEquals(classifyUploadError("TOO_RECENT_EVENT"), "retry");
  assertEquals(classifyUploadError("EXPIRED_EVENT"), "failed");
  assertEquals(classifyUploadError(undefined), "failed");
  const body = { partialFailureError: { details: [{ errors: [
    { errorCode: { conversionUploadError: "EXPIRED_EVENT" }, message: "antigo", location: { fieldPathElements: [{ fieldName: "conversions", index: 1 }] } },
    { errorCode: { conversionAdjustmentUploadError: "CONVERSION_NOT_FOUND" }, message: "x", location: { fieldPathElements: [{ fieldName: "conversionAdjustments", index: "0" }] } },
  ] }] } };
  const m = parsePartialFailure(body);
  assertEquals(m.get(1)?.code, "EXPIRED_EVENT");
  assertEquals(m.get(0)?.code, "CONVERSION_NOT_FOUND");
  assertEquals(parsePartialFailure({}).size, 0);
});
