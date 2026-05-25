import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import type { Logger } from "../_shared/correlation.ts";
import { getValidAccessToken } from './webhook-helpers.ts';

const BLING_API_BASE = 'https://api.bling.com.br/Api/v3';

async function fetchProductDetails(accessToken: string, productId: number, log: Logger): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${BLING_API_BASE}/produtos/${productId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) { log.error('[Bling Webhook] Erro ao buscar produto:', response.status, await response.text()); return null; }
    const json = await response.json();
    return json.data;
  } catch (err) { log.error('[Bling Webhook] Erro na requisição do produto:', err); return null; }
}

export async function processProductEvent(
  supabase: ServiceClient, tenantId: string, integrationId: string, action: string, productId: number, _eventId: string, log: Logger,
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando produto: action=${action}, productId=${productId}`);

  if (action === 'deleted') {
    const { error } = await supabase.from('bling_products').delete().eq('bling_id', productId).eq('integration_id', integrationId);
    if (error) { log.error('[Bling Webhook] Erro ao deletar produto:', error); return { success: false, message: error.message }; }
    log.info('[Bling Webhook] Produto deletado com sucesso:', productId);
    return { success: true, message: 'Produto deletado' };
  }

  const accessToken = await getValidAccessToken(supabase, tenantId, log);
  if (!accessToken) return { success: false, message: 'Token de acesso não disponível' };

  const product = await fetchProductDetails(accessToken, productId, log);
  if (!product) return { success: false, message: 'Não foi possível buscar detalhes do produto' };

  let imagens: Array<{ link: string }> = [];
  const midia = product.midia as Record<string, unknown>;
  if (midia?.imagens) {
    const imgObj = midia.imagens as Record<string, unknown>;
    const internas = (imgObj.internas || []) as Record<string, unknown>[];
    const externas = (imgObj.externas || []) as Record<string, unknown>[];
    imagens = [...internas, ...externas].filter(img => img.link).map(img => ({ link: img.link as string }));
  }

  const productData = {
    bling_id: product.id, integration_id: integrationId, tenant_id: tenantId,
    codigo: product.codigo || null, nome: product.nome, gtin: product.gtin || null,
    gtin_embalagem: product.gtinEmbalagem || null, ean: product.ean || null,
    preco: product.preco || null, preco_custo: product.precoCusto || null,
    estoque_atual: (product.estoque as Record<string, unknown>)?.saldoVirtualTotal ?? product.estoqueAtual ?? 0,
    estoque_minimo: (product.estoque as Record<string, unknown>)?.minimo ?? null,
    estoque_depositos: (product.estoque as Record<string, unknown>)?.depositos || null,
    situacao: product.situacao || null, tipo: product.tipo || null, formato: product.formato || null, unidade: product.unidade || null,
    peso_liquido: product.pesoLiquido ?? null, peso_bruto: product.pesoBruto ?? null,
    altura: (product.dimensoes as Record<string, unknown>)?.altura ?? null,
    largura: (product.dimensoes as Record<string, unknown>)?.largura ?? null,
    profundidade: (product.dimensoes as Record<string, unknown>)?.profundidade ?? null,
    ncm: (product.tributacao as Record<string, unknown>)?.ncm || null,
    cest: (product.tributacao as Record<string, unknown>)?.cest || null,
    origem: (product.tributacao as Record<string, unknown>)?.origem ?? null,
    tributacao: product.tributacao || null, classe_fiscal: product.classeIpi || null,
    categoria_id: (product.categoria as Record<string, unknown>)?.id || null,
    categoria_nome: (product.categoria as Record<string, unknown>)?.descricao || null, marca: product.marca || null,
    fornecedor_id: (product.fornecedor as Record<string, unknown>)?.id || null,
    fornecedor_nome: ((product.fornecedor as Record<string, unknown>)?.contato as Record<string, unknown>)?.nome || null,
    fornecedor_codigo: (product.fornecedor as Record<string, unknown>)?.codigo || null,
    descricao_curta: product.descricaoCurta || null,
    descricao_completa: product.descricao || product.descricaoComplementar || null,
    observacoes: product.observacoes || null,
    imagem_url: imagens.length > 0 ? imagens[0].link : product.imagemURL || null,
    imagens: imagens.length > 0 ? imagens : null, variacoes: product.variacoes || null,
    produto_pai_id: (product.variacao as Record<string, unknown>)?.produtoPai ? ((product.variacao as Record<string, unknown>).produtoPai as Record<string, unknown>)?.id : null,
    localizacao: product.localizacao || null, condicao: product.condicao ?? null,
    frete_gratis: product.freteGratis === true, sob_encomenda: product.sobEncomenda === true,
    producao_propria: product.producao === 'P', cross_docking: product.crossdocking ?? null,
    garantia: product.garantia ?? null, volumes_por_produto: product.volumesPorProduto ?? null,
    campos_customizados: product.camposCustomizados || null, data_validade: product.dataValidade || null,
    dados_nfe: (product.spedTipoItem || product.canalVendasCodigo) ? { spedTipoItem: product.spedTipoItem || null, canalVendasCodigo: product.canalVendasCodigo || null } : null,
    raw_data: product, synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase.from('bling_products').upsert(productData, { onConflict: 'bling_id,integration_id' });
  if (upsertError) { log.error('[Bling Webhook] Erro ao upsert produto:', upsertError); return { success: false, message: upsertError.message }; }
  log.info('[Bling Webhook] Produto atualizado com sucesso:', productId);
  return { success: true, message: `Produto ${action === 'created' ? 'criado' : 'atualizado'}` };
}

export async function processStockEvent(
  supabase: ServiceClient, tenantId: string, integrationId: string, action: string, stockData: Record<string, unknown>, _eventId: string, log: Logger,
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando estoque: action=${action}, data=`, JSON.stringify(stockData).substring(0, 200));
  const productId = (stockData.produto as Record<string, unknown>)?.id || stockData.id || null;
  if (!productId) { log.info('[Bling Webhook] Estoque: ID do produto não encontrado no payload'); return { success: false, message: 'ID do produto não encontrado' }; }

  const novoSaldo = stockData.saldo ?? stockData.saldoVirtualTotal ?? stockData.quantidade ?? stockData.saldoFisico ?? null;

  if (novoSaldo === null || novoSaldo === undefined) {
    log.info('[Bling Webhook] Estoque: Saldo não encontrado no payload, buscando via API');
    const accessToken = await getValidAccessToken(supabase, tenantId, log);
    if (!accessToken) return { success: false, message: 'Token não disponível para buscar estoque' };
    const product = await fetchProductDetails(accessToken, productId as number, log);
    if (product) {
      const estoqueAtual = (product.estoque as Record<string, unknown>)?.saldoVirtualTotal ?? product.estoqueAtual ?? 0;
      const { error } = await supabase.from('bling_products').update({ estoque_atual: estoqueAtual, estoque_depositos: (product.estoque as Record<string, unknown>)?.depositos || null, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('bling_id', productId).eq('integration_id', integrationId);
      if (error) { log.error('[Bling Webhook] Erro ao atualizar estoque via API:', error); return { success: false, message: error.message }; }
      log.info(`[Bling Webhook] Estoque atualizado via API: produto ${productId} = ${estoqueAtual}`);
      return { success: true, message: `Estoque atualizado para ${estoqueAtual} (via API)` };
    }
    return { success: false, message: 'Não foi possível obter saldo do estoque' };
  }

  const { error } = await supabase.from('bling_products').update({ estoque_atual: novoSaldo, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('bling_id', productId).eq('integration_id', integrationId);
  if (error) { log.error('[Bling Webhook] Erro ao atualizar estoque:', error); return { success: false, message: error.message }; }
  log.info(`[Bling Webhook] Estoque atualizado: produto ${productId} = ${novoSaldo}`);
  return { success: true, message: `Estoque atualizado para ${novoSaldo}` };
}
