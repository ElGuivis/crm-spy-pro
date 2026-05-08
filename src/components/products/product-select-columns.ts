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
