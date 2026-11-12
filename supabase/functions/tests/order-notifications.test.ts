import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyTracking, normStatus, renderTemplate, trackingFromOrder } from "../_shared/order-notification-render.ts";
import { nextWindowOpen } from "../_shared/send-window.ts";
import { processOrderNotificationsInJob } from "../_shared/order-notifications.ts";

// ---------- banco falso em memória (só o que o módulo usa) ----------
type Row = Record<string, unknown>;
interface FakeOpts { uniqueExec?: boolean; blockers?: { contact_key: string; reason: string }[]; failQueue?: boolean }

function fakeDb(seed: Record<string, Row[]>, opts: FakeOpts = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let n = 0;
  class Q {
    private op: "select" | "insert" | "delete" = "select";
    private filters: ((r: Row) => boolean)[] = [];
    private payload: Row | null = null;
    private lim = Infinity;
    constructor(private table: string) { tables[table] ??= []; }
    select(_c?: string) { return this; }
    insert(p: Row) { this.op = "insert"; this.payload = p; return this; }
    delete() { this.op = "delete"; return this; }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
    not(k: string, _o: string, _v: unknown) { this.filters.push((r) => r[k] != null); return this; }
    limit(n: number) { this.lim = n; return this; }
    private run(): { data: Row[] | Row | null; error: { code?: string; message: string } | null } {
      const rows = tables[this.table];
      if (this.op === "insert") {
        const p = this.payload!;
        if (this.table === "message_queue" && opts.failQueue) return { data: null, error: { message: "queue down" } };
        if (this.table === "order_notification_executions" && opts.uniqueExec &&
          rows.some((r) => r.config_id === p.config_id && r.order_number === p.order_number && r.channel === p.channel && (r.kind ?? "primary") === (p.kind ?? "primary") && r.status_name === p.status_name)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const row = { id: `id-${++n}`, ...p };
        rows.push(row);
        return { data: row, error: null };
      }
      if (this.op === "delete") {
        tables[this.table] = rows.filter((r) => !this.filters.every((f) => f(r)));
        return { data: null, error: null };
      }
      return { data: rows.filter((r) => this.filters.every((f) => f(r))).slice(0, this.lim), error: null };
    }
    maybeSingle() { const r = this.run(); return Promise.resolve({ data: (r.data as Row[])?.[0] ?? null, error: r.error }); }
    single() { const r = this.run(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error }); }
    // deno-lint-ignore no-explicit-any
    then(resolve: (v: any) => unknown) { return Promise.resolve(this.run()).then(resolve); }
  }
  const client = {
    from: (t: string) => new Q(t),
    rpc: (_name: string, _args: unknown) => Promise.resolve({ data: opts.blockers ?? [], error: null }),
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, tables };
}

const TENANT = "t1", INTEG = "i1";
const baseSeed = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  order_notification_configs: [{ id: "c1", tenant_id: TENANT, integration_id: INTEG, is_active: true, send_via_whatsapp: true, send_via_email: false, whatsapp_integration_id: "wa1", email_integration_id: null, send_window_enabled: true, send_window_start: 8, send_window_end: 21 }],
  order_notification_status_rules: [{ id: "r1", config_id: "c1", is_enabled: true, status_name: "Pedido Pago", message_template: "Oi {{cliente_primeiro_nome}}, pedido #{{numero_pedido}} pago. Rastreio: {{rastreamento}}", delay_minutes: 0, email_subject: null, email_body: null, followup_enabled: false, followup_delay_minutes: 0, followup_template: null }],
  li_order_items: [], me_shipments: [], order_notification_executions: [], message_queue: [],
  ...over,
});
const dbOrder = (over: Row = {}): Row => ({ id: "o1", numero: "9001", created_at_remote: new Date().toISOString(), cliente_nome: "Maria Souza", cliente_telefone: "11999998888", cliente_email: "", valor_total: 100, li_id: "55", raw_json: null, shipping_json: null, ...over });
const run = (db: ReturnType<typeof fakeDb>, order: Row = dbOrder(), status = "Pedido Pago") =>
  processOrderNotificationsInJob(db.client, { id: 55, cliente: { nome: "Maria Souza", telefone_celular: "11999998888", email: "" } }, order, status, TENANT, INTEG);

// ---------- texto ----------
Deno.test("status compara sem acento, caixa ou espaço duplo", () => {
  assertEquals(normStatus("Pedido em separação"), normStatus("  pedido  EM separacao "));
});

Deno.test("renderTemplate troca os marcadores novos e antigos; HTML protege o nome", () => {
  const v = { firstName: "Ana", name: "Ana <b>X</b>", orderNumber: "7", status: "Pago", total: "R$ 10,00", products: "• 1x A\n• 2x B", tracking: "AB123" };
  assertEquals(renderTemplate("{{cliente_primeiro_nome}} #{{order_number}} {{tracking_code}}", v), "Ana #7 AB123");
  const html = renderTemplate("{{cliente_nome}}|{{produtos}}", v, true);
  assertStringIncludes(html, "Ana &lt;b&gt;X&lt;/b&gt;");
  assertStringIncludes(html, "• 1x A<br>• 2x B");
});

Deno.test("sem rastreio o marcador fica no texto (não vira N/A) e applyTracking preenche depois", () => {
  const v = { firstName: "A", name: "A", orderNumber: "1", status: "s", total: "t", products: "", tracking: null };
  assertEquals(renderTemplate("código {{rastreamento}}", v), "código {{rastreamento}}");
  assertEquals(applyTracking("código {{rastreamento}} / {{tracking_code}}", "XY1"), "código XY1 / XY1");
});

Deno.test("trackingFromOrder acha o código em raw_json, shipping_json ou envios", () => {
  assertEquals(trackingFromOrder({ raw_json: { codigo_rastreio: "RJ1" } }), "RJ1");
  assertEquals(trackingFromOrder({ shipping_json: '{"tracking_code":"SJ2"}' }), "SJ2");
  assertEquals(trackingFromOrder({ envios: [{ objeto: "EN3" }] }), "EN3");
  assertEquals(trackingFromOrder({}, null), "");
});

// ---------- fluxo ----------
Deno.test("pedido no status da regra enfileira 1 WhatsApp com 55 e registra a execução", async () => {
  const db = fakeDb(baseSeed());
  await run(db, dbOrder({ raw_json: { codigo_rastreio: "BR123" } }));
  assertEquals(db.tables.message_queue.length, 1);
  const q = db.tables.message_queue[0];
  assertEquals(q.recipient, "5511999998888");
  assertStringIncludes(String(q.message_content), "BR123");
  assertEquals((q.metadata as Row).tracking_required, false);
  assertEquals(db.tables.order_notification_executions.length, 1);
  assertEquals((q.metadata as Row).execution_id, db.tables.order_notification_executions[0].id);
});

Deno.test("chamar de novo para o mesmo pedido/status não duplica", async () => {
  const db = fakeDb(baseSeed());
  await run(db); await run(db); await run(db);
  assertEquals(db.tables.message_queue.length, 1);
  assertEquals(db.tables.order_notification_executions.length, 1);
});

Deno.test("duas execuções ao mesmo tempo mandam só uma (índice único do banco)", async () => {
  const db = fakeDb(baseSeed(), { uniqueExec: true });
  await Promise.all([run(db), run(db), run(db)]);
  assertEquals(db.tables.message_queue.length, 1);
});

Deno.test("WhatsApp e e-mail juntos: uma execução por canal e reentrada não duplica (antes quebrava no maybeSingle)", async () => {
  const seed = baseSeed();
  (seed.order_notification_configs[0] as Row).send_via_email = true;
  (seed.order_notification_configs[0] as Row).email_integration_id = "em1";
  const db = fakeDb(seed);
  const order = (extra: Row = {}) => dbOrder({ cliente_email: "maria@exemplo.com", ...extra });
  const api = { id: 55, cliente: { nome: "Maria Souza", telefone_celular: "11999998888", email: "maria@exemplo.com" } };
  await processOrderNotificationsInJob(db.client, api, order(), "Pedido Pago", TENANT, INTEG);
  await processOrderNotificationsInJob(db.client, api, order(), "Pedido Pago", TENANT, INTEG);
  assertEquals(db.tables.message_queue.length, 2);
  assertEquals(db.tables.message_queue.map((m) => m.channel).sort(), ["email", "whatsapp"]);
});

Deno.test("rastreio ausente: não sai N/A, espera pelo menos 10 min e marca tracking_required", async () => {
  const db = fakeDb(baseSeed());
  const before = Date.now();
  await run(db);
  const q = db.tables.message_queue[0];
  assertStringIncludes(String(q.message_content), "{{rastreamento}}");
  assert(!String(q.message_content).includes("N/A"));
  assertEquals((q.metadata as Row).tracking_required, true);
  assert(new Date(String(q.next_retry_at)).getTime() >= before + 9 * 60_000);
});

Deno.test("rastreio no Melhor Envio também vale", async () => {
  const db = fakeDb(baseSeed({ me_shipments: [{ li_order_id: "o1", tracking_code: "ME999" }] }));
  await run(db);
  assertStringIncludes(String(db.tables.message_queue[0].message_content), "ME999");
});

Deno.test("espera da regra (delay) é respeitada", async () => {
  const seed = baseSeed();
  (seed.order_notification_status_rules[0] as Row).delay_minutes = 30;
  (seed.order_notification_status_rules[0] as Row).message_template = "Oi {{cliente_primeiro_nome}}";
  const db = fakeDb(seed);
  const before = Date.now();
  await run(db);
  assert(new Date(String(db.tables.message_queue[0].next_retry_at)).getTime() >= before + 29 * 60_000);
});

Deno.test("status da regra sem acento/caixa ainda casa", async () => {
  const seed = baseSeed();
  (seed.order_notification_status_rules[0] as Row).status_name = "pedido em separacao";
  (seed.order_notification_status_rules[0] as Row).message_template = "ok";
  const db = fakeDb(seed);
  await run(db, dbOrder(), "Pedido em separação");
  assertEquals(db.tables.message_queue.length, 1);
});

Deno.test("status sem regra não enfileira nada", async () => {
  const db = fakeDb(baseSeed());
  await run(db, dbOrder(), "Pedido Cancelado");
  assertEquals(db.tables.message_queue.length, 0);
  assertEquals(db.tables.order_notification_executions.length, 0);
});

Deno.test("telefone bloqueado não recebe; limite diário não bloqueia aviso de pedido", async () => {
  const blocked = fakeDb(baseSeed(), { blockers: [{ contact_key: "5511999998888", reason: "blocked" }] });
  await run(blocked);
  assertEquals(blocked.tables.message_queue.length, 0);
  assertEquals(blocked.tables.order_notification_executions[0].status, "cancelled");
  const capped = fakeDb(baseSeed(), { blockers: [{ contact_key: "5511999998888", reason: "daily_cap" }] });
  await run(capped);
  assertEquals(capped.tables.message_queue.length, 1);
});

Deno.test("sem telefone válido: registra cancelado com o motivo e não enfileira", async () => {
  const db = fakeDb(baseSeed());
  await processOrderNotificationsInJob(db.client, { id: 55, cliente: { nome: "X", telefone_celular: "123" } }, dbOrder({ cliente_telefone: "" }), "Pedido Pago", TENANT, INTEG);
  assertEquals(db.tables.message_queue.length, 0);
  assertEquals(db.tables.order_notification_executions[0].status, "cancelled");
  assertStringIncludes(String(db.tables.order_notification_executions[0].error_message), "telefone");
});

Deno.test("DDD 55 (RS) recebe o prefixo do país", async () => {
  const db = fakeDb(baseSeed());
  await processOrderNotificationsInJob(db.client, { id: 55, cliente: { nome: "X", telefone_celular: "55991234567" } }, dbOrder({ cliente_telefone: "" }), "Pedido Pago", TENANT, INTEG);
  assertEquals(db.tables.message_queue[0].recipient, "5555991234567");
});

Deno.test("pedido com mais de 7 dias não notifica", async () => {
  const db = fakeDb(baseSeed());
  await run(db, dbOrder({ created_at_remote: new Date(Date.now() - 8 * 86_400_000).toISOString() }));
  assertEquals(db.tables.message_queue.length, 0);
});

Deno.test("fila fora do ar: libera a reserva para tentar de novo depois", async () => {
  const db = fakeDb(baseSeed(), { failQueue: true });
  await run(db);
  assertEquals(db.tables.message_queue.length, 0);
  assertEquals(db.tables.order_notification_executions.length, 0);
});

Deno.test("e-mail usa assunto e corpo próprios da regra (antes eram ignorados)", async () => {
  const seed = baseSeed();
  const cfg = seed.order_notification_configs[0] as Row;
  cfg.send_via_whatsapp = false; cfg.send_via_email = true; cfg.email_integration_id = "em1";
  const rule = seed.order_notification_status_rules[0] as Row;
  rule.email_subject = "Pedido {{numero_pedido}} confirmado"; rule.email_body = "<h1>Olá {{cliente_nome}}</h1>"; rule.message_template = "texto";
  const db = fakeDb(seed);
  await processOrderNotificationsInJob(db.client, { id: 55, cliente: { nome: "Maria <x>", email: "m@e.com" } }, dbOrder({ cliente_email: "m@e.com" }), "Pedido Pago", TENANT, INTEG);
  const q = db.tables.message_queue[0];
  assertEquals(q.subject, "Pedido 9001 confirmado");
  assertEquals(q.html_content, "<h1>Olá Maria &lt;x&gt;</h1>");
  assertEquals(q.message_content, "texto");
});

// ---------- lembrete, janela, link e regra editada ----------
Deno.test("lembrete: segundo aviso com espera somada, tipo followup e sem duplicar", async () => {
  const seed = baseSeed();
  const rule = seed.order_notification_status_rules[0] as Row;
  rule.status_name = "Aguardando Pagamento"; rule.delay_minutes = 10; rule.message_template = "pague {{numero_pedido}}";
  rule.followup_enabled = true; rule.followup_delay_minutes = 120; rule.followup_template = "ainda não pagou o pedido {{numero_pedido}}?";
  const db = fakeDb(seed, { uniqueExec: true });
  const before = Date.now();
  await run(db, dbOrder(), "Aguardando Pagamento"); await run(db, dbOrder(), "Aguardando Pagamento");
  assertEquals(db.tables.message_queue.length, 2);
  const f = db.tables.message_queue.find((m) => (m.metadata as Row).kind === "followup")!;
  assertEquals(f.message_content, "ainda não pagou o pedido 9001?");
  assert(new Date(String(f.next_retry_at)).getTime() >= before + 129 * 60_000);
  assertEquals((f.metadata as Row).expected_status, "Aguardando Pagamento");
  assertEquals((f.metadata as Row).delay_minutes, 130);
});

Deno.test("sem lembrete ligado, só o aviso principal", async () => {
  const db = fakeDb(baseSeed());
  await run(db);
  assertEquals(db.tables.message_queue.length, 1);
  assertEquals((db.tables.message_queue[0].metadata as Row).kind, "primary");
});

Deno.test("janela de envio vai na mensagem (8h–21h) e pode ser desligada", async () => {
  const on = fakeDb(baseSeed()); await run(on);
  assertEquals((on.tables.message_queue[0].metadata as Row).send_window, { start: 8, end: 21 });
  const seed = baseSeed(); (seed.order_notification_configs[0] as Row).send_window_enabled = false;
  const off = fakeDb(seed); await run(off);
  assertEquals((off.tables.message_queue[0].metadata as Row).send_window, null);
});

Deno.test("editar e salvar a configuração (regra com id novo) não reenvia o que já foi avisado", async () => {
  const db = fakeDb(baseSeed(), { uniqueExec: true });
  await run(db);
  (db.tables.order_notification_status_rules[0] as Row).id = "r-novo-depois-de-salvar";
  await run(db);
  assertEquals(db.tables.message_queue.length, 1);
});

Deno.test("{{link_rastreio}} vira o link e, sem código, o texto neutro", () => {
  const v = { firstName: "A", name: "A", orderNumber: "1", status: "s", total: "t", products: "", tracking: "AB123BR" };
  assertEquals(renderTemplate("veja {{link_rastreio}}", v), "veja https://www.melhorrastreio.com.br/rastreio/AB123BR");
  assertEquals(applyTracking("veja {{link_rastreio}}", "AB123BR"), "veja https://www.melhorrastreio.com.br/rastreio/AB123BR");
  assertEquals(applyTracking("veja {{link_rastreio}}", null), "veja disponível assim que o código sair");
});

Deno.test("nextWindowOpen: dentro da janela envia; fora espera a abertura (Brasília, UTC-3)", () => {
  const at = (iso: string) => Date.parse(iso);
  assertEquals(nextWindowOpen(at("2026-11-12T15:00:00Z"), 8, 21), null); // 12h em Brasília
  assertEquals(nextWindowOpen(at("2026-11-12T11:00:00Z"), 8, 21), null); // 8h exatas
  assertEquals(new Date(nextWindowOpen(at("2026-11-13T01:30:00Z"), 8, 21)!).toISOString(), "2026-11-13T11:00:00.000Z"); // 22h30 → 8h do dia seguinte
  assertEquals(new Date(nextWindowOpen(at("2026-11-12T07:00:00Z"), 8, 21)!).toISOString(), "2026-11-12T11:00:00.000Z"); // 4h → 8h do mesmo dia
  assertEquals(nextWindowOpen(at("2026-11-12T00:00:00Z"), 21, 8), null); // janela inválida não restringe
});
