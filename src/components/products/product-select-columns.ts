/**
 * Explicit column lists for product queries in the frontend.
 * Replaces select('*') to reduce payload and improve performance.
 */

/** bling_products — all UI-relevant columns (excludes raw_data) */
export const BLING_PRODUCT_SELECT = [
  'id', 'tenant_id', 'integration_id', 'bling_id', 'nome', 'codigo', 'ean', 'gtin', 'gtin_embalagem',
  'tipo', 'formato', 'situacao', 'condicao', 'unidade',
  'preco', 'preco_custo', 'estoque_atual', 'estoque_minimo', 'estoque_depositos',
  'ncm', 'cest', 'classe_fiscal', 'origem',
  'descricao_curta', 'descricao_completa', 'observacoes',
  'imagem_url', 'imagens',
  'categoria_id', 'categoria_nome', 'marca',
  'peso_bruto', 'peso_liquido', 'largura', 'altura', 'profundidade',
  'volumes_por_produto', 'localizacao',
  'fornecedor_id', 'fornecedor_nome', 'fornecedor_codigo',
  'frete_gratis', 'garantia', 'sob_encomenda', 'cross_docking', 'producao_propria',
  'produto_pai_id', 'variacoes', 'tributacao', 'dados_nfe', 'campos_customizados',
  'data_validade', 'synced_at', 'created_at', 'updated_at',
].join(', ');

/** li_products — all columns (table is small, raw_json needed for getRaw()) */
export const LI_PRODUCT_SELECT = [
  'id', 'tenant_id', 'integration_id', 'loja_integrada_product_id',
  'name', 'sku', 'price', 'promotional_price', 'cost_price',
  'stock', 'stock_managed', 'active',
  'image_url', 'raw_json', 'variations_json',
  'updated_at_local', 'updated_at_remote',
].join(', ');

/**
 * Campos do `raw_json` que a LISTA de produtos usa. O resto (descrição completa = ~70% do
 * peso, imagens, categorias...) só é buscado quando o produto é aberto.
 */
export const LI_PRODUCT_LIST_RAW_KEYS = ['tipo', 'pai', 'imagem_principal', 'destaque', 'bloqueado', 'estoque_quantidade'] as const;

/** li_products para a lista: colunas leves + só as chaves acima extraídas do `raw_json` (PostgREST `alias:coluna->chave`). */
export const LI_PRODUCT_LIST_SELECT = [
  'id', 'tenant_id', 'integration_id', 'loja_integrada_product_id',
  'name', 'sku', 'price', 'promotional_price', 'cost_price',
  'stock', 'stock_managed', 'active',
  'image_url', 'variations_json',
  'updated_at_local', 'updated_at_remote',
  ...LI_PRODUCT_LIST_RAW_KEYS.map((k) => `raw_${k}:raw_json->${k}`),
].join(', ');

/** Remonta o `raw_json` reduzido a partir das colunas `raw_<chave>` devolvidas por LI_PRODUCT_LIST_SELECT. */
export function withLightRawJson<T extends Record<string, unknown>>(row: T): Omit<T, `raw_${typeof LI_PRODUCT_LIST_RAW_KEYS[number]}`> & { raw_json: Record<string, unknown> } {
  const rest: Record<string, unknown> = {};
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const rawKey = LI_PRODUCT_LIST_RAW_KEYS.find((k) => key === `raw_${k}`);
    if (rawKey) { if (value !== null && value !== undefined) raw[rawKey] = value; } else rest[key] = value;
  }
  return { ...rest, raw_json: raw } as never;
}
