/**
 * Auditoria dos filtros do Catálogo WhatsApp / páginas Produtos (23/11/2026).
 *
 * Roda o MESMO código de filtro da tela (catalogFilters.ts + catalogoHelpers.ts) contra os dados de produção
 * e confere cada resultado com uma fonte independente:
 *  - LI: linhas de li_products (variações, estoque do produto, nomes das grades) e, por amostra, a API da loja;
 *  - Bling: linhas das variações (bling_products com produto_pai_id).
 * Regras conferidas (o que o cliente recebe = foto + nome + preço):
 *  1. sem estoque, sem foto ou fora do site nunca aparece no padrão;
 *  2. filtro de tamanho/cor/(cor+tamanho): todo resultado tem UMA variação com esse tamanho/cor e estoque > 0,
 *     e nenhum produto que tem fica de fora;
 *  3. tipo e busca: só o que casa;
 *  4. preço: o da loja (promocional quando houver);
 *  5. amostra na API da LI: estoque e preço batem com a loja agora.
 * Só lê. Uso: SUPABASE_URL=... SERVICE_KEY=... deno run --allow-env --allow-net scripts/audit-catalog-filters.ts
 */
import {
  applyCatalogFilters, baseCatalog, buildCatalogFilterOptions, colorOf, DEFAULT_CATALOG_FILTERS, fold, productType, sizeOf,
  type CatalogFilterState,
} from "../src/components/catalogo/catalogFilters.ts";
import {
  normalizeBlingProducts, normalizeLiCatalogRows, parseVariationString,
  type BlingProductRow, type CatalogProduct, type LiCatalogRow,
} from "../src/components/catalogo/catalogoHelpers.ts";
import { linkBlingVariations, type BlingChildRow } from "../src/components/catalogo/blingVariations.ts";

const URL_ = Deno.env.get("SUPABASE_URL") ?? "https://api.spypro.com.br";
const KEY = Deno.env.get("SERVICE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rest<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    const d = await r.json() as T[];
    out.push(...d);
    if (d.length < 1000) return out;
  }
}
async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return await r.json() as T;
}

/** variação "verdade" (fonte independente do código da tela) */
interface TruthVariant { size?: string; color?: string; stock: number; ref?: string }
type Truth = Map<string, TruthVariant[]>; // id do produto (catálogo) -> variações

let failures = 0;
const problems: string[] = [];
function fail(msg: string) { failures++; if (problems.length < 60) problems.push(msg); }

function checkSource(label: string, products: CatalogProduct[], truth: Truth, priceTruth: Map<string, number | null>) {
  console.log(`\n=== ${label}: ${products.length} produtos no catálogo`);
  const base = baseCatalog(products, DEFAULT_CATALOG_FILTERS);
  console.log(`  padrão (só com estoque, com foto, no site): ${base.visible.length}  | sem foto ocultos: ${base.withoutPhoto} | fora do site ocultos: ${base.offSite}`);

  // 1. padrão
  for (const p of base.visible) {
    if (p.stock <= 0) fail(`${label}: "${p.name}" aparece sem estoque`);
    if (!p.imageUrl) fail(`${label}: "${p.name}" aparece sem foto`);
    if (!p.onSite) fail(`${label}: "${p.name}" aparece fora do site`);
    const t = truth.get(p.id);
    if (t && t.length && t.reduce((s, v) => s + v.stock, 0) <= 0) fail(`${label}: "${p.name}" aparece mas a fonte diz 0 em todas as variações`);
  }
  // produtos com estoque pela fonte que somem do padrão
  let hiddenWithStock = 0;
  for (const p of products) {
    const t = truth.get(p.id);
    const tStock = t?.length ? t.reduce((s, v) => s + v.stock, 0) : null;
    if (tStock != null && tStock > 0 && p.stock <= 0) { hiddenWithStock++; fail(`${label}: "${p.name}" tem ${tStock} na fonte e o catálogo diz 0`); }
  }

  const opts = buildCatalogFilterOptions(base.visible);
  console.log(`  opções: ${opts.types.length} tipos, ${opts.colors.length} cores, ${opts.sizes.length} tamanhos`);
  console.log(`  tamanhos: ${opts.sizes.join(", ")}`);
  console.log(`  cores: ${opts.colors.join(", ")}`);

  const has = (p: CatalogProduct, color: string, size: string) => {
    const t = truth.get(p.id) ?? [];
    if (t.length === 0) return !size && !!color && fold(p.name).includes(fold(color)); // sem grade: cor no nome
    return t.some(v => v.stock > 0 && (!color || fold(v.color ?? "") === fold(color)) && (!size || fold(v.size ?? "") === fold(size)));
  };
  const run = (f: Partial<CatalogFilterState>, what: string) => {
    const filters = { ...DEFAULT_CATALOG_FILTERS, ...f };
    const res = applyCatalogFilters(base.visible, filters);
    const ids = new Set(res.map(p => p.id));
    let wrong = 0, missing = 0;
    for (const p of res) if (!has(p, filters.color, filters.size)) { wrong++; fail(`${label}: [${what}] "${p.name}" não tem ${what} em estoque na fonte`); }
    for (const p of base.visible) if (!ids.has(p.id) && has(p, filters.color, filters.size)) { missing++; fail(`${label}: [${what}] "${p.name}" tem ${what} na fonte e ficou de fora`); }
    return { n: res.length, wrong, missing };
  };

  // 2. tamanho, cor e cor+tamanho (todas as combinações que existem)
  let checks = 0, wrongT = 0, missT = 0;
  for (const s of opts.sizes) { const r = run({ size: s }, `tamanho ${s}`); checks++; wrongT += r.wrong; missT += r.missing; }
  for (const c of opts.colors) { const r = run({ color: c }, `cor ${c}`); checks++; wrongT += r.wrong; missT += r.missing; }
  const pairs = new Set<string>();
  for (const p of base.visible) for (const v of p.variants) {
    const c = colorOf(v.attrs), s = sizeOf(v.attrs);
    if (c && s && v.stock > 0) pairs.add(`${c}\u0000${s}`);
  }
  for (const k of pairs) { const [c, s] = k.split("\u0000"); const r = run({ color: c, size: s }, `${c} ${s}`); checks++; wrongT += r.wrong; missT += r.missing; }
  console.log(`  tamanho/cor: ${checks} filtros conferidos (${pairs.size} pares cor+tamanho) → errados ${wrongT}, faltando ${missT}`);

  // 3. tipo e busca
  for (const t of opts.types) {
    const res = applyCatalogFilters(base.visible, { ...DEFAULT_CATALOG_FILTERS, type: t.value });
    const expected = base.visible.filter(p => productType(p.name) === t.value).length;
    if (res.length !== expected || res.some(p => productType(p.name) !== t.value)) fail(`${label}: tipo ${t.value} devolveu ${res.length}, esperado ${expected}`);
  }
  for (const q of ["camiseta preta", "bone", "moletom", "tenis"]) {
    const res = applyCatalogFilters(base.visible, { ...DEFAULT_CATALOG_FILTERS, search: q });
    const words = fold(q).split(/\s+/);
    for (const p of res) if (!words.every(w => fold(`${p.name} ${p.sku ?? ""}`).includes(w))) fail(`${label}: busca "${q}" trouxe "${p.name}"`);
  }
  // ordenação por preço
  const asc = applyCatalogFilters(base.visible, { ...DEFAULT_CATALOG_FILTERS, sort: "price_asc" });
  for (let i = 1; i < asc.length; i++) if ((asc[i - 1].price ?? Infinity) > (asc[i].price ?? Infinity)) { fail(`${label}: ordem por preço quebrada em ${i}`); break; }

  // 4. preço
  let priceBad = 0;
  for (const p of base.visible) {
    if (!priceTruth.has(p.id)) continue;
    const exp = priceTruth.get(p.id);
    if (exp != null && Math.abs((p.price ?? 0) - exp) > 0.009) { priceBad++; fail(`${label}: preço de "${p.name}" ${p.price} ≠ ${exp}`); }
    if (!p.price) fail(`${label}: "${p.name}" sem preço (sai sem preço na mensagem)`);
  }
  // nomes de variação que não viraram tamanho/cor (sairiam fora dos filtros)
  const unnamed = base.visible.filter(p => p.variants.some(v => !sizeOf(v.attrs) && !colorOf(v.attrs))).length;
  console.log(`  produtos com estoque na fonte e 0 no catálogo: ${hiddenWithStock} | preço divergente: ${priceBad} | com variação sem tamanho/cor reconhecido: ${unnamed}`);
}

// ---------------- Loja Integrada ----------------
interface LiRow { id: string; loja_integrada_product_id: number; name: string | null; active: boolean; stock: number | null; price: number | null; promotional_price: number | null; raw_json: Record<string, unknown> }
interface Grade { variation_id: number; grade_name: string; name: string }

async function auditLi(integrationId: string, label: string, liveSample: number) {
  const rows = await rpc<LiCatalogRow[]>("get_catalog_products", { p_integration_id: integrationId });
  const products = normalizeLiCatalogRows(rows);
  const li = await rest<LiRow>(`li_products?integration_id=eq.${integrationId}&select=id,loja_integrada_product_id,name,active,stock,price,promotional_price,raw_json->tipo,raw_json->pai,raw_json->variacoes,raw_json->estoque_quantidade`.replace(/raw_json->(\w+)/g, "$1:raw_json->$1"));
  const grades = new Map((await rest<Grade>(`li_grade_variations?integration_id=eq.${integrationId}&select=variation_id,grade_name,name`)).map(g => [g.variation_id, g]));
  // deno-lint-ignore no-explicit-any
  const raw = (r: any, k: string) => r[k];
  const byLiId = new Map(li.map(r => [r.loja_integrada_product_id, r]));
  const truth: Truth = new Map();
  const priceTruth = new Map<string, number | null>();
  const qty = (r: LiRow) => Math.max(Number(raw(r, "estoque_quantidade")) || 0, 0);
  const eff = (r: LiRow) => (r.promotional_price && Number(r.promotional_price) > 0 ? Number(r.promotional_price) : r.price == null ? null : Number(r.price));
  const kidsSample: { liId: number; parent: string; stock: number }[] = [];
  for (const r of li) {
    if (raw(r, "tipo") !== "atributo_opcao") { priceTruth.set(r.id, eff(r)); continue; }
    const pai = Number(String(raw(r, "pai") ?? "").match(/(\d+)$/)?.[1]);
    const parent = byLiId.get(pai);
    if (!parent || !r.active) continue;
    const attrs: Record<string, string> = {};
    for (const v of (raw(r, "variacoes") as string[] | null) ?? []) {
      const g = grades.get(Number(String(v).match(/(\d+)$/)?.[1]));
      if (g) attrs[g.grade_name] = g.name;
    }
    const a = Object.keys(attrs).length ? attrs : parseVariationString((r.name ?? "").replace(parent.name ?? "", ""));
    const list = truth.get(parent.id) ?? [];
    list.push({ size: sizeOf(a), color: colorOf(a), stock: qty(r), ref: String(r.loja_integrada_product_id) });
    truth.set(parent.id, list);
    if (qty(r) > 0) kidsSample.push({ liId: r.loja_integrada_product_id, parent: parent.name ?? "", stock: qty(r) });
  }
  // pai com preço só nas variações: o catálogo usa o menor preço das variações em estoque
  for (const p of products) if (priceTruth.get(p.id) == null) priceTruth.delete(p.id);
  checkSource(label, products, truth, priceTruth);

  // 5. amostra ao vivo na API da loja (estoque disponível e preço agora)
  if (!liveSample) return;
  const tok = (await rest<{ api_key: string }>(`integrations?id=eq.${integrationId}&select=api_key`))[0]?.api_key;
  if (!tok) return;
  const auth = { Authorization: `Basic ${tok.trim().replace(/^Basic\s+/i, "")}` };
  const pick = kidsSample.sort(() => Math.random() - 0.5).slice(0, liveSample);
  let soldOut = 0, diff = 0;
  for (const k of pick) {
    const r = await fetch(`https://api.awsli.com.br/v1/produto_estoque/${k.liId}`, { headers: auth });
    if (!r.ok) { console.log(`  (API ${r.status} para ${k.liId})`); continue; }
    const d = await r.json() as { quantidade_disponivel?: number; quantidade?: number };
    const live = Number(d.quantidade_disponivel ?? d.quantidade ?? 0);
    if (live <= 0) { soldOut++; fail(`${label}: variação ${k.liId} de "${k.parent}" está ESGOTADA na loja e o catálogo oferece (${k.stock})`); }
    else if (live !== k.stock) diff++;
    await new Promise(res => setTimeout(res, 700));
  }
  const parentsWithPrice = products.filter(p => p.stock > 0 && p.imageUrl && p.onSite).sort(() => Math.random() - 0.5).slice(0, Math.ceil(liveSample / 2));
  let priceLiveBad = 0;
  for (const p of parentsWithPrice) {
    const liId = li.find(r => r.id === p.id)?.loja_integrada_product_id;
    const r = await fetch(`https://api.awsli.com.br/v1/produto_preco/${liId}`, { headers: auth });
    if (!r.ok) continue;
    const d = await r.json() as { cheio?: string; promocional?: string | null };
    const live = Number(d.promocional) > 0 ? Number(d.promocional) : Number(d.cheio);
    if (live && p.price && Math.abs(live - p.price) > 0.009) { priceLiveBad++; fail(`${label}: preço de "${p.name}" na loja agora ${live}, catálogo ${p.price}`); }
    await new Promise(res => setTimeout(res, 700));
  }
  console.log(`  API da loja (amostra ${pick.length} variações + ${parentsWithPrice.length} preços): esgotadas oferecidas ${soldOut}, quantidade diferente (mas >0) ${diff}, preço diferente ${priceLiveBad}`);
}

// ---------------- Bling ----------------
async function auditBling(integrationId: string, label: string) {
  const parents = await rest<BlingProductRow & { preco: number | null }>(`bling_products?integration_id=eq.${integrationId}&produto_pai_id=is.null&select=id,bling_id,nome,preco,estoque_atual,imagem_url,imagens,codigo,variacoes,created_at&order=id`);
  const kidsRows = await rest<BlingChildRow>(`bling_products?integration_id=eq.${integrationId}&select=bling_id,produto_pai_id,nome,estoque_atual&order=id`);
  const { kids, variantIds } = linkBlingVariations(parents, kidsRows);
  const orphanVariants = parents.filter(p => variantIds.has(Number(p.bling_id)) ).length;
  console.log(`  variações sem produto_pai_id que antes apareciam como produto próprio: ${orphanVariants}`);
  const realParents = parents.filter(p => !variantIds.has(Number(p.bling_id)));
  const products = normalizeBlingProducts(realParents, kids);
  // nenhum "produto" do catálogo pode ser uma variação (nome com Tamanho:/Cor:)
  for (const p of products) if (/(tamanho|cor):S/i.test(p.name) && p.stock > 0 && p.imageUrl) fail(`${label}: variação aparece como produto: "${p.name}"`);
  const truth: Truth = new Map();
  const priceTruth = new Map<string, number | null>();
  for (const p of realParents) {
    priceTruth.set(p.id, p.preco);
    const ks = p.bling_id != null ? kids.get(Number(p.bling_id)) : undefined;
    if (!ks?.length) continue;
    truth.set(p.id, ks.map(k => {
      // fonte independente do parser da tela: o Bling grava "<nome do pai> Chave:Valor;Chave:Valor"
      const tail = (k.nome ?? "").slice((p.nome ?? "").length);
      const a: Record<string, string> = {};
      for (const m of tail.matchAll(/([^\s:;]+):([^;]+)/g)) a[m[1]] = m[2].trim();
      return { size: sizeOf(a), color: colorOf(a), stock: Math.max(Number(k.estoque_atual) || 0, 0) };
    }));
  }
  const stale = realParents.filter(p => {
    const ks = p.bling_id != null ? kids.get(Number(p.bling_id)) : undefined;
    const json = (p.variacoes as { estoque?: { saldoVirtualTotal?: number } }[] | null) ?? [];
    if (!ks?.length || !json.length) return false;
    const a = json.reduce((s, v) => s + Math.max(v.estoque?.saldoVirtualTotal || 0, 0), 0);
    return a !== ks.reduce((s, k) => s + Math.max(Number(k.estoque_atual) || 0, 0), 0);
  }).length;
  console.log(`\n(Bling: ${realParents.length} pais, ${kidsRows.length - realParents.length} variações; pais cujo JSON de variações já difere das linhas: ${stale})`);
  checkSource(label, products, truth, priceTruth);
}

if (!KEY) { console.error("SERVICE_KEY ausente"); Deno.exit(2); }
const live = Number(Deno.env.get("LIVE_SAMPLE") ?? "30");
await auditLi("be7cd06d-da27-47af-b632-84f5aece5d92", "LI Use Chronic", live);
await auditLi("692d790d-aee7-47ef-a68f-8462d85df052", "LI Outback", Math.min(live, 10));
await auditBling("5e7570b5-5763-449f-b585-1bcf43da8d6c", "Bling Outback");

console.log(`\n==== ${failures === 0 ? "OK: nenhum problema" : `${failures} problema(s)`} ====`);
for (const p of problems) console.log(" - " + p);
Deno.exit(failures ? 1 : 0);
