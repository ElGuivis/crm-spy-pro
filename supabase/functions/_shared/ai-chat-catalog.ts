/**
 * Catalogo para a IA: so produtos DISPONIVEIS (ativos e com estoque) do tenant,
 * filtrados pelo que o cliente perguntou. Antes a IA lia colunas inexistentes e nunca via produto.
 * LI: li_products (name, price, promotional_price, stock, active). Bling: bling_products.
 */

import type { StoreIntegrationInfo } from "./ai-chat-store.ts";

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

const STOPWORDS = new Set([
  'que', 'qual', 'quais', 'quanto', 'quantos', 'custa', 'custam', 'tem', 'tens', 'voces', 'voce', 'vocês', 'vocês',
  'uma', 'umas', 'uns', 'para', 'por', 'com', 'sem', 'tem', 'ter', 'quero', 'queria', 'gostaria', 'saber',
  'esse', 'essa', 'isso', 'aqui', 'ola', 'oi', 'bom', 'boa', 'dia', 'tarde', 'noite', 'vendem', 'vende',
  'preco', 'preço', 'valor', 'produto', 'produtos', 'disponivel', 'disponíveis', 'estoque', 'mais', 'muito',
  'pode', 'podem', 'sobre', 'como', 'onde', 'qual', 'dos', 'das', 'nos', 'nas', 'meu', 'minha', 'entre',
  'tudo', 'bem', 'obrigado', 'obrigada', 'valeu', 'blz', 'beleza', 'entao', 'então', 'favor', 'ajuda', 'ajudar',
]);

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palavras uteis da pergunta (sem acento, so letras/numeros, sem stopwords). */
export function extractSearchTerms(text: string, max = 4): string[] {
  const seen = new Set<string>();
  for (const raw of normalize(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Ultima mensagem enviada pelo cliente (contato), pela data. */
export function lastContactQuestion(history: Array<{ sender_type: string; content: string; created_at: string }>): string {
  return history
    .filter((m) => m.sender_type === 'contact')
    .reduce((latest, m) => (m.created_at > latest.created_at ? m : latest), { content: '', created_at: '' }).content;
}

const money = (v: unknown) => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;

interface LiRow { name: string; price: number | null; promotional_price: number | null; stock: number | null }
interface BlingRow { nome: string; preco: number | null; estoque_atual: number | null }

export function formatCatalogBlock(lines: string[], searched: boolean): string {
  if (!lines.length) {
    return searched
      ? '\n=== PRODUTOS DISPONÍVEIS (busca pela pergunta) ===\nNenhum produto em estoque encontrado para essa busca. Não cite produto nem preço; ofereça um atendente.\n'
      : '';
  }
  return `\n=== PRODUTOS DISPONÍVEIS EM ESTOQUE (${lines.length}) ===\n${lines.join('\n')}\nCite SOMENTE estes produtos e preços; o que não está aqui não é confirmado.\n`;
}

/** Busca produtos disponiveis; `terms` vazio lista os com mais estoque. */
export async function buildAvailableProductsInfo(
  supabase: ServiceClient,
  storeInfo: StoreIntegrationInfo,
  tenantId: string,
  question: string,
): Promise<string> {
  const terms = extractSearchTerms(question);
  const isLI = storeInfo.type === 'loja_integrada';
  const table = storeInfo.tables.products;
  const nameCol = isLI ? 'name' : 'nome';
  const columns = isLI ? 'name, price, promotional_price, stock' : 'nome, preco, estoque_atual';

  const run = async (mode: 'all' | 'any') => {
    // LI: funcao SQL que compara sem acento ("bone" acha "Boné"); ilike nao casa acento.
    if (isLI) return await supabase.rpc('search_available_products', { p_tenant: tenantId, p_terms: terms, p_mode: mode, p_limit: terms.length ? 20 : 10 });
    let query = supabase.from(table).select(columns).eq('tenant_id', tenantId);
    query = isLI ? query.eq('active', true).gt('stock', 0) : query.eq('situacao', 'Ativo').gt('estoque_atual', 0);
    if (terms.length && mode === 'all') for (const t of terms) query = query.ilike(nameCol, `%${t}%`);
    if (terms.length && mode === 'any') query = query.or(terms.map((t) => `${nameCol}.ilike.%${t}%`).join(','));
    return await query.order(isLI ? 'stock' : 'estoque_atual', { ascending: false }).limit(terms.length ? 20 : 10);
  };

  // Primeiro exige todos os termos ("moletom preto"); se nada, aceita qualquer um.
  let { data, error } = await run('all');
  if (!error && terms.length > 1 && (!data || data.length === 0)) ({ data, error } = await run('any'));
  if (error || !data) return '';

  const lines = isLI
    ? (data as LiRow[]).map((p) => {
      const price = p.promotional_price ? `${money(p.promotional_price)} (de ${money(p.price)})` : money(p.price);
      return `- ${p.name}: ${price} | ${p.stock} em estoque`;
    })
    : (data as BlingRow[]).map((p) => `- ${p.nome}: ${money(p.preco)} | ${p.estoque_atual} em estoque`);
  return formatCatalogBlock(lines, terms.length > 0);
}
