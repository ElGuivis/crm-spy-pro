import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { meTrackingFetch, trackingEventsFrom } from "../_shared/me-tracking-api.ts";

Deno.test("meTrackingFetch: POST com {orders: [...]} (o GET devolvia HTML)", async () => {
  const original = globalThis.fetch;
  let seen: { url: string; init?: RequestInit } | null = null;
  globalThis.fetch = ((url: string, init?: RequestInit) => { seen = { url, init }; return Promise.resolve(new Response("{}")); }) as typeof fetch;
  try {
    await meTrackingFetch("https://x.test/api/v2", "tok", ["a", "b"]);
    assertEquals(seen!.url, "https://x.test/api/v2/me/shipment/tracking");
    assertEquals(seen!.init!.method, "POST");
    assertEquals(JSON.parse(seen!.init!.body as string), { orders: ["a", "b"] });
    assertEquals((seen!.init!.headers as Record<string, string>)["Authorization"], "Bearer tok");
  } finally { globalThis.fetch = original; }
});

Deno.test("trackingEventsFrom: sem eventos reais monta a linha do tempo pelas datas, em ordem", () => {
  const ev = trackingEventsFrom({
    status: "delivered", created_at: "2026-03-30 21:07:56", paid_at: "2026-03-30 21:09:46", generated_at: "2026-03-30 21:10:45",
    posted_at: "2026-04-01 18:05:18", delivered_at: "2026-04-06 15:56:29", canceled_at: null, expired_at: null,
  });
  assertEquals(ev.map((e) => e.status), ["created", "paid", "generated", "posted", "delivered"]);
  assertEquals(ev[4].title, "Entregue");
});

Deno.test("trackingEventsFrom: eventos reais têm prioridade; entrada vazia dá lista vazia", () => {
  const real = [{ title: "Em trânsito", status: "x", date: "2026-01-01" }];
  assertEquals(trackingEventsFrom({ events: real, posted_at: "2026-01-02" }), real);
  assertEquals(trackingEventsFrom(undefined), []);
  assertEquals(trackingEventsFrom({}), []);
});
