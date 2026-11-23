import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildUserData, metaPhone } from "../_shared/meta-capi.ts";

Deno.test("telefone com DDI 55", () => {
  assertEquals(metaPhone("11999998888"), "5511999998888");
  assertEquals(metaPhone("5511999998888"), "5511999998888");
});
Deno.test("hash SHA-256 normalizado; IP/UA/cookies sem hash", async () => {
  const u = await buildUserData({ email: " Fulano@Example.COM ", firstName: "João", ip: "1.2.3.4", userAgent: "UA", fbp: "fb.1.1700000000000.123", fbc: "lixo" });
  // sha256("fulano@example.com")
  assertEquals((u.em as string[])[0].length, 64);
  assertEquals((u.fn as string[])[0], await (async () => { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("joao")); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); })());
  assertEquals(u.client_ip_address, "1.2.3.4");
  assertEquals(u.fbp, "fb.1.1700000000000.123");
  assertEquals(u.fbc, undefined);
});
