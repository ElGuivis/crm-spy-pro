import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractPhoneFromJid,
  formatPhoneNumber,
  mapEvolutionStatus,
  sendButtonsWithTokenCharge,
  sendListWithTokenCharge,
  sendReplyWithTokenCharge,
  sendTextWithTokenCharge,
  sendWhatsAppMessage,
} from "../_shared/whatsapp-sender.ts";
import { evolutionPost } from "../_shared/wa-sender-core.ts";

const config = { evolutionApiUrl: "https://evo.test/", evolutionApiKey: "k", instanceName: "inst" };
const noSleep = () => Promise.resolve();

type Call = { url: string; init: RequestInit };

/** Troca o fetch por respostas em fila; devolve as chamadas feitas. */
async function withFetch(responses: Array<Response | Error>, fn: (calls: Call[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)];
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r.clone());
  }) as typeof fetch;
  try { await fn(calls); } finally { globalThis.fetch = original; }
}

const ok = (body: unknown = { key: { id: "MSG1" } }) => new Response(JSON.stringify(body), { status: 200 });

/** Cliente falso: registra RPCs e responde saldo/débito configurados. */
function fakeSupabase(opts: { hasTokens?: boolean; checkError?: boolean; deducted?: boolean } = {}) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    rpcs,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      if (fn === "has_enough_tokens") {
        return Promise.resolve(opts.checkError ? { data: null, error: { message: "x" } } : { data: opts.hasTokens ?? true, error: null });
      }
      return Promise.resolve({ data: opts.deducted ?? true, error: null });
    },
  };
}

Deno.test("formatPhoneNumber: telefone BR, zero à esquerda, LID", () => {
  assertEquals(formatPhoneNumber("(11) 98765-4321"), { number: "5511987654321", isLid: false });
  assertEquals(formatPhoneNumber("011987654321"), { number: "5511987654321", isLid: false });
  assertEquals(formatPhoneNumber("5511987654321"), { number: "5511987654321", isLid: false });
  assertEquals(formatPhoneNumber("123456789@lid"), { number: "123456789", isLid: true });
  assertEquals(formatPhoneNumber("123456789012345"), { number: "123456789012345", isLid: true });
});

Deno.test("mapEvolutionStatus e extractPhoneFromJid", () => {
  assertEquals(mapEvolutionStatus("DELIVERY_ACK"), "delivered");
  assertEquals(mapEvolutionStatus("played"), "read");
  assertEquals(mapEvolutionStatus("ERROR"), "failed");
  assertEquals(mapEvolutionStatus("OUTRO"), "outro");
  assertEquals(extractPhoneFromJid("5511987654321@s.whatsapp.net"), "5511987654321");
  assertEquals(extractPhoneFromJid("999@lid"), "999");
  assertEquals(extractPhoneFromJid(""), null);
});

Deno.test("sendWhatsAppMessage: monta URL, cabeçalho e corpo; devolve o id", async () => {
  await withFetch([ok()], async (calls) => {
    const r = await sendWhatsAppMessage(config, "11987654321", "oi");
    assertEquals(r, { success: true, messageId: "MSG1", attempts: 1 });
    assertEquals(calls[0].url, "https://evo.test/message/sendText/inst");
    assertEquals((calls[0].init.headers as Record<string, string>).apikey, "k");
    assertEquals(JSON.parse(calls[0].init.body as string), { number: "5511987654321", text: "oi" });
  });
});

Deno.test("LID vai com sufixo @lid", async () => {
  await withFetch([ok()], async (calls) => {
    await sendWhatsAppMessage(config, "123456789@lid", "oi");
    assertEquals(JSON.parse(calls[0].init.body as string).number, "123456789@lid");
  });
});

Deno.test("evolutionPost: erro 4xx não repete", async () => {
  await withFetch([new Response("bad", { status: 400 })], async (calls) => {
    const r = await evolutionPost(config, "sendText", "11987654321", (number) => ({ number }), "T", 3, noSleep);
    assertEquals(r.success, false);
    assertEquals(r.attempts, 1);
    assertEquals(r.error, "HTTP 400: bad");
    assertEquals(calls.length, 1);
  });
});

Deno.test("evolutionPost: 429 e 5xx repetem até dar certo", async () => {
  await withFetch([new Response("slow", { status: 429 }), new Response("boom", { status: 502 }), ok()], async (calls) => {
    const waits: number[] = [];
    const r = await evolutionPost(config, "sendText", "11987654321", (number) => ({ number }), "T", 3, (ms) => { waits.push(ms); return Promise.resolve(); });
    assertEquals(r.success, true);
    assertEquals(r.attempts, 3);
    assertEquals(calls.length, 3);
    assertEquals(waits, [1000, 2000]);
  });
});

Deno.test("evolutionPost: exceção de rede esgota as tentativas", async () => {
  await withFetch([new Error("rede caiu")], async (calls) => {
    const r = await evolutionPost(config, "sendText", "11987654321", (number) => ({ number }), "T", 3, noSleep);
    assertEquals(r, { success: false, error: "rede caiu", attempts: 3 });
    assertEquals(calls.length, 3);
  });
});

Deno.test("botões: no máximo 3, título cortado em 20 e endpoint sendButtons", async () => {
  const sb = fakeSupabase();
  await withFetch([ok()], async (calls) => {
    const buttons = ["a", "b", "c", "d"].map((id) => ({ id, displayText: "x".repeat(30) }));
    const r = await sendButtonsWithTokenCharge(config, "11987654321", "T", "D", buttons, sb, "ten", "auto_message", "desc", "ref", "rodapé");
    assertEquals(r.success, true);
    assertEquals(calls[0].url, "https://evo.test/message/sendButtons/inst");
    const body = JSON.parse(calls[0].init.body as string);
    assertEquals(body.buttons.length, 3);
    assertEquals(body.buttons[0].reply.title.length, 20);
    assertEquals(body.footer, "rodapé");
  });
});

Deno.test("lista: endpoint sendList com seções", async () => {
  const sb = fakeSupabase();
  await withFetch([ok()], async (calls) => {
    const sections = [{ title: "S", rows: [{ rowId: "1", title: "Um" }] }];
    await sendListWithTokenCharge(config, "11987654321", "T", "D", "Abrir", sections, sb, "ten");
    assertEquals(calls[0].url, "https://evo.test/message/sendList/inst");
    const body = JSON.parse(calls[0].init.body as string);
    assertEquals(body.sections, sections);
    assertEquals(body.footerText, ' '); // sem footerText a Evolution devolve 400
  });
});

Deno.test("resposta citada leva o id da mensagem original", async () => {
  const sb = fakeSupabase();
  await withFetch([ok()], async (calls) => {
    await sendReplyWithTokenCharge(config, "11987654321", "oi", "QUOTED", sb, "ten");
    assertEquals(JSON.parse(calls[0].init.body as string).quoted.key.id, "QUOTED");
  });
});

Deno.test("cobrança: envio ok debita 1 token com tipo, descrição e referência", async () => {
  const sb = fakeSupabase();
  await withFetch([ok()], async () => {
    const r = await sendTextWithTokenCharge(config, "11987654321", "oi", sb, "ten", "birthday", "Parabéns", "ref1");
    assertEquals(r.tokenDeducted, true);
    assertEquals(sb.rpcs.map((c) => c.fn), ["has_enough_tokens", "deduct_tokens"]);
    assertEquals(sb.rpcs[1].args, { _tenant_id: "ten", _amount: 1, _type: "birthday", _description: "Parabéns", _reference_id: "ref1" });
  });
});

Deno.test("cobrança: sem saldo não envia e não debita", async () => {
  const sb = fakeSupabase({ hasTokens: false });
  await withFetch([ok()], async (calls) => {
    const r = await sendTextWithTokenCharge(config, "11987654321", "oi", sb, "ten");
    assertEquals(r, { success: false, error: "INSUFFICIENT_TOKENS", tokenDeducted: false });
    assertEquals(calls.length, 0);
    assertEquals(sb.rpcs.length, 1);
  });
});

Deno.test("cobrança: falha ao consultar saldo não envia", async () => {
  const sb = fakeSupabase({ checkError: true });
  await withFetch([ok()], async (calls) => {
    const r = await sendTextWithTokenCharge(config, "11987654321", "oi", sb, "ten");
    assertEquals(r.error, "TOKEN_CHECK_FAILED");
    assertEquals(calls.length, 0);
  });
});

Deno.test("cobrança: envio que falhou (4xx) não debita", async () => {
  const sb = fakeSupabase();
  await withFetch([new Response("no", { status: 400 })], async () => {
    const r = await sendTextWithTokenCharge(config, "11987654321", "oi", sb, "ten");
    assertEquals(r.success, false);
    assertEquals(r.tokenDeducted, false);
    assertEquals(sb.rpcs.map((c) => c.fn), ["has_enough_tokens"]);
  });
});

Deno.test("cobrança: deduct_tokens falso (corrida) marca tokenDeducted=false mas mantém o sucesso do envio", async () => {
  const sb = fakeSupabase({ deducted: false });
  await withFetch([ok()], async () => {
    const r = await sendTextWithTokenCharge(config, "11987654321", "oi", sb, "ten");
    assertEquals(r.success, true);
    assertEquals(r.tokenDeducted, false);
  });
});
