import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPermanentRecipientError } from "../_shared/outbound-errors.ts";

Deno.test("numero sem WhatsApp (Evolution 400 exists:false) e falha definitiva", () => {
  const msg = 'Evolution API error: {"status":400,"error":"Bad Request","response":{"message":[{"jid":"5500000000001@s.whatsapp.net","exists":false,"number":"5500000000001"}]}}';
  assertEquals(isPermanentRecipientError(msg), true);
});

Deno.test("Meta 131026 (destinatario sem WhatsApp) e definitiva", () => {
  assertEquals(isPermanentRecipientError('Meta API error: {"error":{"code":131026,"message":"Message undeliverable"}}'), true);
});

Deno.test("falha do provedor continua repetivel", () => {
  assertEquals(isPermanentRecipientError("Evolution API error: {\"status\":500}"), false);
  assertEquals(isPermanentRecipientError("fetch failed"), false);
  assertEquals(isPermanentRecipientError('Evolution API error: {"exists":true}'), false);
});

import { isAmbiguousSendError } from "../_shared/outbound-errors.ts";

Deno.test("tempo esgotado e ambiguo (nao repete); erro 500 nao", () => {
  assertEquals(isAmbiguousSendError("TimeoutError: Signal timed out."), true);
  assertEquals(isAmbiguousSendError("The signal has been aborted"), true);
  assertEquals(isAmbiguousSendError('Evolution API error: {"status":500}'), false);
  assertEquals(isAmbiguousSendError('Evolution API error: {"exists":false}'), false);
});
