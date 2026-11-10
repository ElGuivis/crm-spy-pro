import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ADS_BOT_UA, allowedHostsFrom, checkUrl, checkUrls, hostOf } from "../_shared/google-ads-url-check.ts";

const allowed = allowedHostsFrom(["https://www.usechronic.com.br/", "https://usechronic.com.br/camisetas"]);

function fakeFetch(map: Record<string, { status: number; location?: string }>, seen: Array<{ url: string; ua: string | null }> = []): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, ua: new Headers(init?.headers).get("user-agent") });
    const r = map[url];
    if (!r) return Promise.reject(new Error("rede"));
    return Promise.resolve(new Response(null, { status: r.status, headers: r.location ? { location: r.location } : {} }));
  }) as typeof fetch;
}

Deno.test("hostOf e allowedHostsFrom: ignoram www e invalidos", () => {
  assertEquals(hostOf("https://WWW.UseChronic.com.br/x"), "usechronic.com.br");
  assertEquals(hostOf("nao e url"), null);
  assertEquals([...allowed], ["usechronic.com.br"]);
});

Deno.test("200 e ok (com o user-agent do robo de anuncios); 404 nao e ok e explica", async () => {
  const seen: Array<{ url: string; ua: string | null }> = [];
  const f = fakeFetch({ "https://www.usechronic.com.br/": { status: 200 }, "https://www.usechronic.com.br/todas": { status: 404 } }, seen);
  assertEquals((await checkUrl("https://www.usechronic.com.br/", allowed, f)).ok, true);
  const bad = await checkUrl("https://www.usechronic.com.br/todas", allowed, f);
  assertEquals([bad.ok, bad.status], [false, 404]);
  assert(bad.reason!.includes("404"));
  assertEquals(seen[0].ua, ADS_BOT_UA);
});

Deno.test("segue redirecionamento e revalida cada salto; redirecionamento para outro dominio e barrado", async () => {
  const f = fakeFetch({
    "https://www.usechronic.com.br/a": { status: 301, location: "/b" }, "https://www.usechronic.com.br/b": { status: 200 },
    "https://www.usechronic.com.br/evil": { status: 302, location: "https://malicioso.example/x" }, "https://malicioso.example/x": { status: 200 },
  });
  assertEquals((await checkUrl("https://www.usechronic.com.br/a", allowed, f)).ok, true);
  const evil = await checkUrl("https://www.usechronic.com.br/evil", allowed, f);
  assert(!evil.ok && evil.reason!.includes("dominio"));
});

Deno.test("SSRF: so https, so dominios da conta, nunca IP/localhost/credenciais", async () => {
  const f = fakeFetch({});
  for (const u of ["http://www.usechronic.com.br/", "https://169.254.169.254/latest", "https://localhost/x", "https://user:pw@www.usechronic.com.br/", "https://outro.com/x", "javascript:alert(1)", "https://[::1]/"]) {
    const r = await checkUrl(u, allowed, f);
    assert(!r.ok, u);
  }
});

Deno.test("erro de rede vira resultado, nao excecao; checkUrls nao repete URL", async () => {
  const f = fakeFetch({ "https://www.usechronic.com.br/ok": { status: 200 } });
  const r = await checkUrl("https://www.usechronic.com.br/fora", allowed, f);
  assertEquals([r.ok, r.status], [false, null]);
  const m = await checkUrls(["https://www.usechronic.com.br/ok", "https://www.usechronic.com.br/ok", "https://www.usechronic.com.br/fora"], allowed, f);
  assertEquals(m.size, 2);
  assertEquals(m.get("https://www.usechronic.com.br/ok")!.ok, true);
});
