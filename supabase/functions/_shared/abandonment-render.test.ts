import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCartVars, cartItemsHtml, inQuietHours, nextDueStep, type CartItem, type FlowStep } from "./abandonment-render.ts";
import { normalizeCampaign, type LiCampaign } from "./li-marketing.ts";
import { replaceVariables } from "./email-variable-replacer.ts";

const items: CartItem[] = [
  { product_id: 1, quantity: 2, name: "Camiseta <b>X</b>", variant: "Tamanho: M", price: 100, image: "https://cdn/x.jpg", url: "/produto/x.html" },
  { product_id: 2, quantity: 1, name: "Boné", variant: null, price: 50, image: null, url: null },
];

Deno.test("itens do carrinho: escapa HTML, soma o total e liga ao produto", () => {
  const html = cartItemsHtml(items, "https://loja.com.br/", 250);
  assertStringIncludes(html, "Camiseta &lt;b&gt;X&lt;/b&gt;");
  assertStringIncludes(html, "https://loja.com.br/produto/x.html");
  assertStringIncludes(html, "R$ 250,00");
  assertStringIncludes(html, "Qtd: 2");
  assert(!html.includes("<b>X</b>"));
});

Deno.test("variáveis do carrinho: total, contagem e link, e se encaixam em replaceVariables", () => {
  const v = buildCartVars(items, 0, "https://loja.com.br");
  assertEquals(v.cart_total, "R$ 250,00");
  assertEquals(v.cart_count, "3");
  assertEquals(v.cart_url, "https://loja.com.br/carrinho/index");
  assertEquals(v.product_name, "Camiseta <b>X</b>");
  assertEquals(replaceVariables("Total {{cart_total}} em {{cart_count}} itens", v), "Total R$ 250,00 em 3 itens");
  // sem itens: usa o valor informado e deixa o bloco vazio (o e-mail não quebra)
  const empty = buildCartVars([], 80, "https://loja.com.br");
  assertEquals(empty.cart_items, "");
  assertEquals(empty.cart_total, "R$ 80,00");
});

Deno.test("janela de silêncio cruza a meia-noite no horário de Brasília", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 9, 5, h + 3, 0)); // Brasília = UTC-3
  assertEquals(inQuietHours(at(22), "21:00", "08:00"), true);
  assertEquals(inQuietHours(at(3), "21:00", "08:00"), true);
  assertEquals(inQuietHours(at(8), "21:00", "08:00"), false);
  assertEquals(inQuietHours(at(15), "21:00", "08:00"), false);
  assertEquals(inQuietHours(at(15), "12:00", "12:00"), false); // início = fim: sem silêncio
  assertEquals(inQuietHours(at(10), "09:00", "11:00"), true);   // janela dentro do mesmo dia
});

const steps: FlowStep[] = [
  { id: "a", delay_minutes: 60, email: { enabled: true, campaign_id: "c1" } },
  { id: "b", delay_minutes: 1440, email: { enabled: true, campaign_id: "c2" }, whatsapp: { enabled: true, text: "oi" } },
  { id: "x", delay_minutes: 2880, email: { enabled: false, campaign_id: null } }, // sem canal: ignorada
];
const MIN = 60_000;

Deno.test("próxima etapa: respeita o atraso, a ordem, os dois canais e o intervalo entre etapas", () => {
  const t0 = Date.parse("2026-10-05T12:00:00Z");
  assertEquals(nextDueStep(steps, t0, t0 + 30 * MIN, new Set(), null), null);                       // ainda não deu 1 h
  assertEquals(nextDueStep(steps, t0, t0 + 61 * MIN, new Set(), null)?.id, "a");
  const doneA = new Set(["a:email"]);
  assertEquals(nextDueStep(steps, t0, t0 + 120 * MIN, doneA, t0 + 61 * MIN), null);                  // etapa b só em 24 h
  assertEquals(nextDueStep(steps, t0, t0 + 1441 * MIN, doneA, t0 + 61 * MIN)?.id, "b");
  assertEquals(nextDueStep(steps, t0, t0 + 1441 * MIN, doneA, t0 + 1425 * MIN), null);               // anterior saiu há <30 min
  assertEquals(nextDueStep(steps, t0, t0 + 1500 * MIN, new Set(["a:email", "b:email"]), t0)?.id, "b"); // falta o WhatsApp da etapa b
  assertEquals(nextDueStep(steps, t0, t0 + 3000 * MIN, new Set(["a:email", "b:email", "b:whatsapp"]), t0), null); // acabou
});

Deno.test("campanha da loja: e-mail pode vir só no identificador e telefone no formato E.164", () => {
  const base = { id: 9, ruleId: 1, status: "P", value: 150, custom: [{ id: 357, quantity: 3 }], lastSentDate: null, createdAt: null, eventAt: "2026-10-05T10:00:00Z", productIds: null, orderIds: null, clientId: 0, automationId: 6, storeId: 1 };
  const a = normalizeCampaign({ ...base, recipient: { name: null, email: null, cellPhone: null }, recipientIdentifier: "Maria@Email.com" } as LiCampaign, "cart");
  assertEquals(a.recipient_email, "maria@email.com");
  assertEquals(a.client_id, null);
  assertEquals(a.product_ids, [357]);
  assertEquals((a.quantities as Record<string, number>)[357], 3);
  const b = normalizeCampaign({ ...base, recipient: { name: "João", email: null, cellPhone: "+5511999998888" }, recipientIdentifier: "+5511999998888" } as LiCampaign, "browse");
  assertEquals(b.recipient_email, null);
  assertEquals(b.recipient_phone, "+5511999998888");
});
