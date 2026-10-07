import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isRateLimited, MAX_RETRY_WAIT_MS, retryDelayMs } from "../_shared/ai-chat-retry.ts";

Deno.test("espera: cabecalho retry-after em segundos", () => {
  assertEquals(retryDelayMs("3", ""), 3300);
  assertEquals(retryDelayMs("0", ""), 300);
});

Deno.test("espera: texto da Groq em segundos e milissegundos", () => {
  assertEquals(retryDelayMs(null, "Rate limit reached ... Please try again in 6.0525s. Need more tokens?"), 6353);
  assertEquals(retryDelayMs(null, "Please try again in 772.5ms."), 1073);
});

Deno.test("espera: acima do limite ou sem informacao nao tenta de novo", () => {
  assertEquals(retryDelayMs(null, "Please try again in 45s"), null);
  assertEquals(retryDelayMs("60", ""), null);
  assertEquals(retryDelayMs(null, "erro qualquer"), null);
  assertEquals(retryDelayMs("abc", "sem tempo"), null);
  assertEquals(MAX_RETRY_WAIT_MS, 20000);
});

Deno.test("limite de taxa: status 429 ou codigo no corpo", () => {
  assertEquals(isRateLimited(429, ""), true);
  assertEquals(isRateLimited(400, '{"error":{"code":"rate_limit_exceeded"}}'), true);
  assertEquals(isRateLimited(500, "boom"), false);
});
