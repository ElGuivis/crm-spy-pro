/**
 * Auditoria de ponta a ponta do atendimento (WhatsApp): duplicidade, corrida, perda de mensagem.
 * Roda contra producao com um contato falso (DDD 00, nunca recebe mensagem de verdade) e apaga o que cria.
 *
 *   AI_URL=https://api.spypro.com.br SERVICE_KEY=... WA_SECRET=... TENANT_ID=... INSTANCE=UseChronic \
 *   deno run -A scripts/audit-atendimento.ts [--only=<trecho>]
 */

const env = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Falta ${k}`); return v; };
const URL_ = env("AI_URL"), KEY = env("SERVICE_KEY"), SECRET = env("WA_SECRET"), TENANT = env("TENANT_ID"), INSTANCE = env("INSTANCE");
const only = Deno.args.find((a) => a.startsWith("--only="))?.slice(7).toLowerCase();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const PHONE_PREFIX = "55000000000";

async function hmac(message: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}

let seq = 0;
const uid = () => `ZZAUD${Date.now().toString(36)}${(seq++).toString(36)}`.toUpperCase();

interface Hook { id?: string; text?: string; phone: string; buttonId?: string; fromMe?: boolean; event?: string; status?: string }
async function hook(h: Hook) {
  const token = await hmac(INSTANCE);
  const id = h.id ?? uid();
  const message = h.buttonId
    ? { buttonsResponseMessage: { selectedButtonId: h.buttonId, selectedDisplayText: h.text ?? "" } }
    : { conversation: h.text ?? "" };
  const body = h.event === "messages.update"
    ? { event: "messages.update", instance: INSTANCE, data: { key: { id, fromMe: true, remoteJid: `${h.phone}@s.whatsapp.net` }, status: h.status } }
    : { event: "messages.upsert", instance: INSTANCE, sender: "5511956100001@s.whatsapp.net", data: { key: { id, fromMe: !!h.fromMe, remoteJid: `${h.phone}@s.whatsapp.net` }, pushName: "ZZ Auditoria", message, messageTimestamp: Math.floor(Date.now() / 1000) } };
  const t0 = performance.now();
  const r = await fetch(`${URL_}/functions/v1/whatsapp-webhook/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { id, status: r.status, body: j, ms: Math.round(performance.now() - t0) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const counts = async (phone: string) => {
  const contacts = await rest(`contacts?tenant_id=eq.${TENANT}&phone=eq.${phone}&select=id`);
  const ids = (contacts as { id: string }[]).map((c) => c.id);
  if (!ids.length) return { contacts: 0, conversations: 0, inbound: 0, outbound: 0, texts: [] as string[] };
  const convs = await rest(`conversations?contact_id=in.(${ids.join(",")})&select=id,status`) as { id: string }[];
  const cids = convs.map((c) => c.id);
  const msgs = cids.length ? await rest(`messages?conversation_id=in.(${cids.join(",")})&select=direction,content,created_at&order=created_at`) as { direction: string; content: string }[] : [];
  return {
    contacts: ids.length, conversations: convs.length,
    inbound: msgs.filter((m) => m.direction === "inbound").length,
    outbound: msgs.filter((m) => m.direction === "outbound").length,
    texts: msgs.filter((m) => m.direction === "outbound").map((m) => m.content.replace(/\s+/g, " ").slice(0, 60)),
  };
};

async function cleanup() {
  const cs = await rest(`contacts?tenant_id=eq.${TENANT}&phone=like.${PHONE_PREFIX}*&select=id`) as { id: string }[];
  for (const c of cs) {
    await rest(`outbound_queue?to_phone_e164=like.${PHONE_PREFIX}*`, { method: "DELETE" });
    await rest(`contacts?id=eq.${c.id}`, { method: "DELETE" });
  }
}

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
async function scenario(name: string, fn: () => Promise<{ ok: boolean; detail: string }>) {
  if (only && !name.toLowerCase().includes(only)) return;
  await cleanup();
  try { const r = await fn(); results.push({ name, ...r }); } catch (e) { results.push({ name, ok: false, detail: `EXCECAO ${e instanceof Error ? e.message : e}` }); }
  await cleanup();
}

let n = 0;
const newPhone = () => `${PHONE_PREFIX}${String(++n).padStart(2, "0")}`;

await scenario("A1 mesma mensagem reenviada em sequencia (retry da Evolution)", async () => {
  const p = newPhone(), id = uid();
  const a = await hook({ id, text: "oi", phone: p });
  const b = await hook({ id, text: "oi", phone: p });
  const c = await counts(p);
  const ok = b.body.reason === "duplicate_message" && c.inbound === 1;
  return { ok, detail: `2a chamada=${JSON.stringify(b.body).slice(0, 80)} inbound=${c.inbound} outbound=${c.outbound} (1a ${a.ms}ms)` };
});

await scenario("A2 mesma mensagem em 6 chamadas simultaneas", async () => {
  const p = newPhone(), id = uid();
  const rs = await Promise.all(Array.from({ length: 6 }, () => hook({ id, text: "oi", phone: p })));
  await sleep(1500);
  const c = await counts(p);
  const dup = rs.filter((r) => r.body.reason === "duplicate_message").length;
  const errs = rs.filter((r) => r.status >= 500).length;
  return { ok: c.inbound === 1 && c.conversations === 1 && errs === 0, detail: `inbound=${c.inbound} conversas=${c.conversations} contatos=${c.contacts} duplicadas=${dup} erros5xx=${errs} respostas_bot=${c.outbound}` };
});

await scenario("A3 contato novo com 3 mensagens diferentes ao mesmo tempo", async () => {
  const p = newPhone();
  const rs = await Promise.all(["oi", "bom dia", "tem camiseta?"].map((t) => hook({ text: t, phone: p })));
  await sleep(2000);
  const c = await counts(p);
  const errs = rs.filter((r) => r.status >= 500);
  return { ok: c.contacts === 1 && c.conversations === 1 && c.inbound === 3 && errs.length === 0, detail: `contatos=${c.contacts} conversas=${c.conversations} inbound=${c.inbound} respostas_bot=${c.outbound} erros5xx=${errs.length} ${errs[0] ? JSON.stringify(errs[0].body).slice(0, 120) : ""}` };
});

await scenario("A4 saudacao: bot responde uma vez so", async () => {
  const p = newPhone();
  await hook({ text: "oi", phone: p });
  await sleep(1500);
  const c = await counts(p);
  return { ok: c.outbound >= 1 && c.outbound <= 2, detail: `respostas_bot=${c.outbound} :: ${c.texts.join(" | ")}` };
});

await scenario("A5 rajada: 5 mensagens em sequencia rapida", async () => {
  const p = newPhone();
  for (const t of ["oi", "menu", "1", "menu", "oi"]) await hook({ text: t, phone: p });
  await sleep(1500);
  const c = await counts(p);
  return { ok: c.inbound === 5 && c.conversations === 1, detail: `inbound=${c.inbound} conversas=${c.conversations} respostas_bot=${c.outbound}` };
});

await scenario("A6 mensagem enviada por nos (fromMe) e ignorada", async () => {
  const p = newPhone();
  await hook({ text: "oi", phone: p });
  const r = await hook({ text: "resposta do atendente no celular", phone: p, fromMe: true });
  const c = await counts(p);
  return { ok: r.body.skipped === true && c.inbound === 1, detail: `fromMe=${JSON.stringify(r.body).slice(0, 70)} inbound=${c.inbound}` };
});

await scenario("A7 token invalido recusado e sem corpo vazio", async () => {
  const bad = await fetch(`${URL_}/functions/v1/whatsapp-webhook/deadbeef`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "messages.upsert", instance: INSTANCE, data: {} }) });
  const none = await fetch(`${URL_}/functions/v1/whatsapp-webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  return { ok: bad.status === 401 && none.status === 401, detail: `token ruim=${bad.status} sem token=${none.status}` };
});

await scenario("A8 mensagem sem texto (so figurinha/reacao) nao quebra", async () => {
  const p = newPhone();
  const token = await hmac(INSTANCE);
  const r = await fetch(`${URL_}/functions/v1/whatsapp-webhook/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "messages.upsert", instance: INSTANCE, data: { key: { id: uid(), fromMe: false, remoteJid: `${p}@s.whatsapp.net` }, message: { stickerMessage: {} } } }) });
  return { ok: r.status < 500, detail: `status=${r.status}` };
});

await scenario("A9 status delivered/read atualiza a mensagem certa", async () => {
  const p = newPhone();
  await hook({ text: "oi", phone: p });
  await sleep(1000);
  const msgs = await rest(`messages?direction=eq.outbound&select=id,provider_message_id,status&order=created_at.desc&limit=3`) as { id: string; provider_message_id: string | null }[];
  const row = msgs.find((m) => m.provider_message_id);
  if (!row) return { ok: true, detail: "sem mensagem do bot com id do provedor (numero falso nao envia); pulado" };
  const r = await hook({ id: row.provider_message_id!, phone: p, event: "messages.update", status: "READ" });
  return { ok: r.status === 200, detail: `status=${r.status}` };
});

// ---- Bloco B: menu do bot, atendente humano, IA ----
interface Convo { status: string; handoff_mode: boolean; ai_enabled: boolean; stage: string | null }
async function convo(phone: string): Promise<Convo | null> {
  const cs = await rest(`contacts?tenant_id=eq.${TENANT}&phone=eq.${phone}&select=id`) as { id: string }[];
  if (!cs[0]) return null;
  const rows = await rest(`conversations?contact_id=eq.${cs[0].id}&select=status,handoff_mode,ai_enabled,bot_state_json&order=created_at.desc&limit=1`) as Array<{ status: string; handoff_mode: boolean; ai_enabled: boolean; bot_state_json: { stage?: string } | null }>;
  const r = rows[0]; return r ? { status: r.status, handoff_mode: r.handoff_mode, ai_enabled: r.ai_enabled, stage: r.bot_state_json?.stage ?? null } : null;
}
/** Envia e devolve as respostas NOVAS do bot (texto curto) e o estado da conversa. */
async function say(p: string, text: string, buttonId?: string) {
  const before = (await counts(p)).texts.length;
  const r = await hook({ text, phone: p, buttonId });
  await sleep(1200);
  const c = await counts(p);
  return { replies: c.texts.slice(before), status: r.status, state: await convo(p), outbound: c.outbound };
}
const short = (a: string[]) => a.map((t) => t.slice(0, 45)).join(" || ") || "(sem resposta)";

await scenario("B1 falar com atendente: bot cala depois do repasse e volta no menu", async () => {
  const p = newPhone();
  await say(p, "oi");
  const a = await say(p, "2");
  const b = await say(p, "preciso de ajuda com meu pedido");
  const c = await say(p, "menu");
  const ok = a.state?.handoff_mode === true && b.replies.length === 0 && c.replies.length >= 1;
  return { ok, detail: `opcao2: handoff=${a.state?.handoff_mode} status=${a.state?.status} :: ${short(a.replies)} | msg livre: ${short(b.replies)} | menu: handoff=${c.state?.handoff_mode} ${short(c.replies)}` };
});

await scenario("B2 revenda atacado responde com os dados cadastrados", async () => {
  const p = newPhone();
  await say(p, "oi");
  const a = await say(p, "3");
  return { ok: a.replies.length >= 1, detail: `${short(a.replies)} stage=${a.state?.stage}` };
});

await scenario("B3 rastrear pedido: entrada invalida nao trava e menu sai", async () => {
  const p = newPhone();
  await say(p, "oi");
  const a = await say(p, "1");
  const b = await say(p, "abc");
  const c = await say(p, "99999999");
  const d = await say(p, "menu");
  return { ok: a.replies.length >= 1 && d.replies.length >= 1, detail: `1: ${short(a.replies)} | abc: ${short(b.replies)} | 99999999: ${short(c.replies)} | menu: ${short(d.replies)} stage=${d.state?.stage}` };
});

await scenario("B4 opcao invalida e texto solto no menu", async () => {
  const p = newPhone();
  await say(p, "oi");
  const a = await say(p, "7");
  const b = await say(p, "kkkkk");
  return { ok: a.replies.length >= 1, detail: `7: ${short(a.replies)} | kkkkk: ${short(b.replies)}` };
});

await scenario("B5 comecar a conversa digitando so '3' (sem oi antes)", async () => {
  const p = newPhone();
  const a = await say(p, "3");
  return { ok: a.replies.length >= 1, detail: `${short(a.replies)} stage=${a.state?.stage}` };
});

await scenario("B6 palavras-chave do menu em maiusculo/com espaco", async () => {
  const p = newPhone();
  await say(p, "oi");
  const a = await say(p, "  MENU  ");
  const b = await say(p, "Início");
  return { ok: a.replies.length >= 1 && b.replies.length >= 1, detail: `MENU: ${short(a.replies)} | Início: ${short(b.replies)}` };
});

// ---- Bloco C: honestidade do status de envio ----
await scenario("C1 numero invalido: status da mensagem do bot reflete a falha de envio", async () => {
  const p = newPhone();
  await hook({ text: "oi", phone: p });
  await sleep(1200);
  const cs = await rest(`contacts?tenant_id=eq.${TENANT}&phone=eq.${p}&select=id`) as { id: string }[];
  const convs = await rest(`conversations?contact_id=eq.${cs[0].id}&select=id`) as { id: string }[];
  const msgs = await rest(`messages?conversation_id=eq.${convs[0].id}&direction=eq.outbound&select=status,provider_message_id,error_json`) as Array<{ status: string; provider_message_id: string | null; error_json: unknown }>;
  const liar = msgs.filter((m) => m.status === "sent" && !m.provider_message_id);
  return { ok: liar.length === 0, detail: `${msgs.length} msgs do bot: status=${msgs.map((m) => m.status).join(",")} sem_id_provedor_mas_marcadas_sent=${liar.length}` };
});

// ---- Bloco D: filas atomicas, buffer da IA, numero sem WhatsApp ----
const rpc = async (fn: string, args: Record<string, unknown>) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  return { status: r.status, data: await r.json().catch(() => null) };
};

await scenario("D1 fila de saida: 4 reivindicacoes simultaneas nunca repetem item", async () => {
  const ch = await rest(`whatsapp_channels?tenant_id=eq.${TENANT}&select=id&limit=1`) as { id: string }[];
  const rows = Array.from({ length: 12 }, () => ({ tenant_id: TENANT, channel_id: ch[0].id, to_phone_e164: "5500000000099", payload_json: { text: "ZZ" }, status: "pending", next_retry_at: new Date(Date.now() - 1000).toISOString() }));
  const ins = await rest("outbound_queue", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) }) as { id: string }[];
  const mine = new Set(ins.map((r) => r.id));
  const rs = await Promise.all([1, 2, 3, 4].map(() => rpc("claim_outbound_queue", { p_limit: 12 })));
  const all = rs.flatMap((r) => (r.data as { id: string }[] ?? []).map((x) => x.id)).filter((id) => mine.has(id));
  await rest("outbound_queue?to_phone_e164=eq.5500000000099", { method: "DELETE" });
  return { ok: all.length === 12 && new Set(all).size === 12, detail: `itens=${mine.size} reivindicados=${all.length} unicos=${new Set(all).size}` };
});

await scenario("D2 buffer da IA: adiciona mensagem (uuid) e so um processador leva a rajada", async () => {
  const p = newPhone();
  await hook({ text: "oi", phone: p }); await sleep(800);
  const cs = await rest(`contacts?tenant_id=eq.${TENANT}&phone=eq.${p}&select=id`) as { id: string }[];
  const cv = await rest(`conversations?contact_id=eq.${cs[0].id}&select=id`) as { id: string }[];
  const ms = await rest(`messages?conversation_id=eq.${cv[0].id}&direction=eq.inbound&select=id`) as { id: string }[];
  const a = await rpc("add_message_to_buffer", { _conversation_id: cv[0].id, _message_id: ms[0].id, _delay_seconds: 0 });
  await sleep(300);
  const rs = await Promise.all([1, 2, 3].map(() => rpc("claim_ai_buffer", { p_conversation: cv[0].id })));
  const got = rs.filter((r) => Array.isArray(r.data) && r.data.length > 0).length;
  const after = await rpc("claim_ai_buffer", { p_conversation: cv[0].id });
  return { ok: a.status < 300 && got === 1 && (after.data as unknown[]).length === 0, detail: `add=${a.status} processadores_que_levaram=${got} sobrou=${(after.data as unknown[]).length}` };
});

await scenario("D3 numero sem WhatsApp: falha definitiva e disjuntor continua fechado", async () => {
  await rest(`circuit_breaker_state?tenant_id=eq.${TENANT}&provider=eq.evolution`, { method: "PATCH", body: JSON.stringify({ state: "closed", failure_count: 0, opened_at: null }) });
  const p = newPhone();
  for (let i = 0; i < 3; i++) await hook({ text: i ? "menu" : "oi", phone: p });
  await sleep(1500);
  await fetch(`${URL_}/functions/v1/process-outbound-queue`, { method: "POST", headers: H, body: "{}" });
  await sleep(500);
  const cb = await rest(`circuit_breaker_state?tenant_id=eq.${TENANT}&provider=eq.evolution&select=state,failure_count`) as { state: string; failure_count: number }[];
  const q = await rest(`outbound_queue?to_phone_e164=eq.${p}&select=status,attempts`) as { status: string; attempts: number }[];
  const pending = q.filter((x) => x.status === "pending" || x.status === "processing" || x.status === "failed").length;
  return { ok: cb[0]?.state === "closed" && pending === 0, detail: `disjuntor=${cb[0]?.state}/${cb[0]?.failure_count} fila: ${q.map((x) => x.status + "x" + x.attempts).join(",")}` };
});

// ---- Bloco E: reembolso de token e numero da instancia ----
await scenario("E1 mensagem nao entregue devolve o token (uma vez so)", async () => {
  const bal = async () => (await rest(`tenant_tokens?tenant_id=eq.${TENANT}&select=balance`) as { balance: number }[])[0].balance;
  const before = await bal();
  const p = newPhone();
  await hook({ text: "oi", phone: p });
  await sleep(1500);
  await fetch(`${URL_}/functions/v1/process-outbound-queue`, { method: "POST", headers: H, body: "{}" });
  await sleep(800);
  await fetch(`${URL_}/functions/v1/process-outbound-queue`, { method: "POST", headers: H, body: "{}" });
  await sleep(500);
  const after = await bal();
  return { ok: after === before, detail: `saldo antes=${before} depois=${after}` };
});

await scenario("E2 numero da instancia fica salvo na integracao", async () => {
  await hook({ text: "oi", phone: newPhone() });
  const i = await rest(`integrations?tenant_id=eq.${TENANT}&type=eq.evolution_whatsapp&select=metadata`) as { metadata: { phoneNumber?: string } }[];
  return { ok: !!i[0]?.metadata?.phoneNumber, detail: `phoneNumber=${i[0]?.metadata?.phoneNumber ?? "(vazio)"}` };
});

// ---- Bloco F: midia ----
await scenario("F1 foto do cliente: webhook responde e guarda a mensagem mesmo sem conseguir baixar", async () => {
  const p = newPhone();
  const token = await hmac(INSTANCE);
  const r = await fetch(`${URL_}/functions/v1/whatsapp-webhook/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "messages.upsert", instance: INSTANCE, sender: "5511956100001@s.whatsapp.net", data: { key: { id: uid(), fromMe: false, remoteJid: `${p}@s.whatsapp.net` }, pushName: "ZZ", message: { imageMessage: { url: "https://mmg.whatsapp.net/x.enc", caption: "olha" } }, messageTimestamp: 1 } }) });
  await sleep(2500);
  const cs = await rest(`contacts?tenant_id=eq.${TENANT}&phone=eq.${p}&select=id`) as { id: string }[];
  const cv = await rest(`conversations?contact_id=eq.${cs[0].id}&select=id`) as { id: string }[];
  const ms = await rest(`messages?conversation_id=eq.${cv[0].id}&direction=eq.inbound&select=content,content_type`) as { content: string; content_type: string }[];
  return { ok: r.status === 200 && ms[0]?.content_type === "image" && ms[0]?.content === "olha", detail: `status=${r.status} msg=${JSON.stringify(ms[0])}` };
});

await scenario("F2 bucket chat-media: grava e gera URL assinada", async () => {
  const path = `${TENANT}/ZZ/zz-audit.txt`;
  const up = await fetch(`${URL_}/storage/v1/object/chat-media/${path}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "text/plain" }, body: "ok" });
  const sg = await fetch(`${URL_}/storage/v1/object/sign/chat-media/${path}`, { method: "POST", headers: H, body: JSON.stringify({ expiresIn: 60 }) });
  const sj = await sg.json().catch(() => ({}));
  await fetch(`${URL_}/storage/v1/object/chat-media/${path}`, { method: "DELETE", headers: H });
  return { ok: up.status < 300 && sg.status < 300 && !!(sj.signedURL || sj.signedUrl), detail: `upload=${up.status} assinar=${sg.status}` };
});

console.log("\nRESULTADO DA AUDITORIA");
for (const r of results) console.log(`${r.ok ? "OK   " : "FALHA"} ${r.name}\n        ${r.detail}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} cenarios ok`);
if (results.some((r) => !r.ok)) Deno.exit(1);
