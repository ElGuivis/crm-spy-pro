/**
 * BLING WEBHOOKS - Edge Function para receber webhooks do Bling ERP
 * 
 * URL de Produção: https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bling-webhooks
 * 
 * Configuração no Bling:
 * 1. Acesse: Central de Extensões > Área do Integrador > Seu App
 * 2. Na aba "Webhooks", clique em "Adicionar webhook"
 * 3. Cole a URL acima
 * 4. Selecione os resources e actions desejados (ex: pedidos.created, produtos.updated)
 * 5. Salve
 * 
 * O Bling assina cada payload com HMAC-SHA256 usando o Client Secret.
 * A assinatura vem no header X-Bling-Signature-256.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorrelationId, createLogger, type Logger } from "../_shared/correlation.ts";
type ServiceClient = ReturnType<typeof createClient>;

// Module-level logger, re-created per request in handler
let log: Logger = createLogger("bling-webhooks", "init");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bling-signature-256',
};

const BLING_API_BASE = 'https://api.bling.com.br/Api/v3';

/**
 * Comparação constant-time para evitar timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Verifica assinatura HMAC-SHA256 do Bling usando WebCrypto API
 */
async function verifyBlingSignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) {
    log.info('[Bling Webhook] Assinatura ausente');
    return false;
  }
  
  // Normalizar assinatura (remover prefixo sha256= se existir)
  const cleanSignature = signature.replace(/^sha256=/, '').toLowerCase();
  
  try {
    // Criar key HMAC
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    // Calcular HMAC do rawBody
    const messageData = encoder.encode(rawBody);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
    
    // Converter para hex
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Comparação constant-time
    const isValid = timingSafeEqual(cleanSignature, expectedSignature);
    
    if (!isValid) {
      log.info('[Bling Webhook] Assinatura inválida');
      log.info('[Bling Webhook] Esperado:', expectedSignature.substring(0, 16) + '...');
      log.info('[Bling Webhook] Recebido:', cleanSignature.substring(0, 16) + '...');
    }
    
    return isValid;
  } catch (error) {
    log.error('[Bling Webhook] Erro ao verificar assinatura:', error);
    return false;
  }
}

/**
 * Gera chave idempotente para o evento
 */
function generateEventKey(payload: Record<string, unknown>): string {
  const companyId = payload.companyId || 'unknown';
  const resource = payload.resource || 'unknown';
  const action = payload.action || 'unknown';
  const occurredAt = payload.occurredAt || new Date().toISOString();
  const dataId = payload.data?.id || payload.id || 'unknown';
  
  return `${companyId}:${resource}:${action}:${occurredAt}:${dataId}`;
}

/**
 * Busca access token válido do Bling para um tenant
 */
async function getValidAccessToken(supabase: ServiceClient, tenantId: string): Promise<string | null> {
  try {
    const { data: connection, error } = await supabase
      .from('bling_connections')
      .select('id, access_token_encrypted, token_expires_at, refresh_token_encrypted')
      .eq('tenant_id', tenantId)
      .eq('status', 'connected')
      .maybeSingle();

    if (error || !connection) {
      log.info('[Bling Webhook] Conexão Bling não encontrada para tenant:', tenantId);
      return null;
    }

    // Resolve token from encrypted column (with plaintext fallback)
    const { readBlingTokens } = await import("../_shared/credential-helpers.ts");
    const tokens = await readBlingTokens(supabase, connection);
    if (!tokens) {
      log.info('[Bling Webhook] Nenhum token válido encontrado');
      return null;
    }

    const expiresAt = new Date(connection.token_expires_at);
    const now = new Date();
    const marginMs = 5 * 60 * 1000;

    if (expiresAt.getTime() - marginMs > now.getTime()) {
      return tokens.accessToken;
    }

    log.info('[Bling Webhook] Token Bling pode estar expirado, tentando usar mesmo assim');
    return tokens.accessToken;
  } catch (err) {
    log.error('[Bling Webhook] Erro ao buscar token:', err);
    return null;
  }
}

/**
 * Busca detalhes completos de um produto no Bling
 */
async function fetchProductDetails(accessToken: string, productId: number): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${BLING_API_BASE}/produtos/${productId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      log.error('[Bling Webhook] Erro ao buscar produto:', response.status, await response.text());
      return null;
    }

    const json = await response.json();
    return json.data;
  } catch (err) {
    log.error('[Bling Webhook] Erro na requisição do produto:', err);
    return null;
  }
}

/**
 * Processa evento de produto (created, updated, deleted)
 */
async function processProductEvent(
  supabase: ServiceClient,
  tenantId: string,
  integrationId: string,
  action: string,
  productId: number,
  eventId: string
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando produto: action=${action}, productId=${productId}`);

  // Handle delete
  if (action === 'deleted') {
    const { error } = await supabase
      .from('bling_products')
      .delete()
      .eq('bling_id', productId)
      .eq('integration_id', integrationId);

    if (error) {
      log.error('[Bling Webhook] Erro ao deletar produto:', error);
      return { success: false, message: error.message };
    }

    log.info('[Bling Webhook] Produto deletado com sucesso:', productId);
    return { success: true, message: 'Produto deletado' };
  }

  // Handle created/updated - fetch full details from API
  const accessToken = await getValidAccessToken(supabase, tenantId);
  if (!accessToken) {
    return { success: false, message: 'Token de acesso não disponível' };
  }

  const product = await fetchProductDetails(accessToken, productId);
  if (!product) {
    return { success: false, message: 'Não foi possível buscar detalhes do produto' };
  }

  // Extract images
  let imagens: Array<{ link: string }> = [];
  const midia = product.midia as Record<string, unknown>;
  if (midia?.imagens) {
    const internas = midia.imagens.internas || [];
    const externas = midia.imagens.externas || [];
    imagens = [...internas, ...externas]
      .filter((img: Record<string, unknown>) => img.link)
      .map((img: Record<string, unknown>) => ({ link: img.link }));
  }

  // Prepare data for upsert with ALL available fields
  const productData = {
    bling_id: product.id,
    integration_id: integrationId,
    tenant_id: tenantId,
    // Identificadores
    codigo: product.codigo || null,
    nome: product.nome,
    gtin: product.gtin || null,
    gtin_embalagem: product.gtinEmbalagem || null,
    ean: product.ean || null,
    // Preços
    preco: product.preco || null,
    preco_custo: product.precoCusto || null,
    // Estoque
    estoque_atual: product.estoque?.saldoVirtualTotal ?? product.estoqueAtual ?? 0,
    estoque_minimo: product.estoque?.minimo ?? null,
    estoque_depositos: product.estoque?.depositos || null,
    // Status e tipo
    situacao: product.situacao || null,
    tipo: product.tipo || null,
    formato: product.formato || null,
    unidade: product.unidade || null,
    // Dimensões e peso
    peso_liquido: product.pesoLiquido ?? null,
    peso_bruto: product.pesoBruto ?? null,
    altura: product.dimensoes?.altura ?? null,
    largura: product.dimensoes?.largura ?? null,
    profundidade: product.dimensoes?.profundidade ?? null,
    // Tributação
    ncm: product.tributacao?.ncm || null,
    cest: product.tributacao?.cest || null,
    origem: product.tributacao?.origem ?? null,
    tributacao: product.tributacao || null,
    classe_fiscal: product.classeIpi || null,
    // Categoria e marca
    categoria_id: product.categoria?.id || null,
    categoria_nome: product.categoria?.descricao || null,
    marca: product.marca || null,
    // Fornecedor
    fornecedor_id: product.fornecedor?.id || null,
    fornecedor_nome: product.fornecedor?.contato?.nome || null,
    fornecedor_codigo: product.fornecedor?.codigo || null,
    // Descrições
    descricao_curta: product.descricaoCurta || null,
    descricao_completa: product.descricao || product.descricaoComplementar || null,
    observacoes: product.observacoes || null,
    // Imagens e variações
    imagem_url: imagens.length > 0 ? imagens[0].link : product.imagemURL || null,
    imagens: imagens.length > 0 ? imagens : null,
    variacoes: product.variacoes || null,
    produto_pai_id: product.variacao?.produtoPai?.id || null,
    // Localização
    localizacao: product.localizacao || null,
    // Flags e condições
    condicao: product.condicao ?? null,
    frete_gratis: product.freteGratis === true,
    sob_encomenda: product.sobEncomenda === true,
    producao_propria: product.producao === 'P',
    // Valores numéricos adicionais
    cross_docking: product.crossdocking ?? null,
    garantia: product.garantia ?? null,
    volumes_por_produto: product.volumesPorProduto ?? null,
    // Campos especiais
    campos_customizados: product.camposCustomizados || null,
    data_validade: product.dataValidade || null,
    // Dados para NF-e
    dados_nfe: (product.spedTipoItem || product.canalVendasCodigo) ? {
      spedTipoItem: product.spedTipoItem || null,
      canalVendasCodigo: product.canalVendasCodigo || null,
    } : null,
    // Metadados
    raw_data: product,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from('bling_products')
    .upsert(productData, {
      onConflict: 'bling_id,integration_id',
    });

  if (upsertError) {
    log.error('[Bling Webhook] Erro ao upsert produto:', upsertError);
    return { success: false, message: upsertError.message };
  }

  log.info('[Bling Webhook] Produto atualizado com sucesso:', productId);
  return { success: true, message: `Produto ${action === 'created' ? 'criado' : 'atualizado'}` };
}

/**
 * Processa evento de estoque (created, updated, deleted)
 * Atualiza o estoque do produto em tempo real
 */
async function processStockEvent(
  supabase: ServiceClient,
  tenantId: string,
  integrationId: string,
  action: string,
  stockData: Record<string, unknown>,
  eventId: string
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando estoque: action=${action}, data=`, JSON.stringify(stockData).substring(0, 200));

  // O webhook de estoque pode ter diferentes estruturas
  // Pode vir como { id: produtoId, saldo: X } ou { produto: { id: X }, saldo: Y }
  const productId = stockData.produto?.id || stockData.id || null;
  
  if (!productId) {
    log.info('[Bling Webhook] Estoque: ID do produto não encontrado no payload');
    return { success: false, message: 'ID do produto não encontrado' };
  }

  // Extrair saldo de estoque do payload
  // Pode vir como 'saldo', 'saldoVirtualTotal', 'quantidade' etc
  const novoSaldo = stockData.saldo ?? 
                   stockData.saldoVirtualTotal ?? 
                   stockData.quantidade ?? 
                   stockData.saldoFisico ?? 
                   null;

  if (novoSaldo === null || novoSaldo === undefined) {
    log.info('[Bling Webhook] Estoque: Saldo não encontrado no payload, buscando via API');
    
    // Se não tiver saldo no payload, vamos buscar via API
    const accessToken = await getValidAccessToken(supabase, tenantId);
    if (!accessToken) {
      return { success: false, message: 'Token não disponível para buscar estoque' };
    }
    
    // Buscar produto completo para obter estoque
    const product = await fetchProductDetails(accessToken, productId);
    if (product) {
      const estoqueAtual = product.estoque?.saldoVirtualTotal ?? product.estoqueAtual ?? 0;
      
      const { error, count } = await supabase
        .from('bling_products')
        .update({
          estoque_atual: estoqueAtual,
          estoque_depositos: product.estoque?.depositos || null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('bling_id', productId)
        .eq('integration_id', integrationId);

      if (error) {
        log.error('[Bling Webhook] Erro ao atualizar estoque via API:', error);
        return { success: false, message: error.message };
      }

      log.info(`[Bling Webhook] Estoque atualizado via API: produto ${productId} = ${estoqueAtual}`);
      return { success: true, message: `Estoque atualizado para ${estoqueAtual} (via API)` };
    }
    
    return { success: false, message: 'Não foi possível obter saldo do estoque' };
  }

  // Atualizar estoque diretamente do payload
  const { error } = await supabase
    .from('bling_products')
    .update({
      estoque_atual: novoSaldo,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('bling_id', productId)
    .eq('integration_id', integrationId);

  if (error) {
    log.error('[Bling Webhook] Erro ao atualizar estoque:', error);
    return { success: false, message: error.message };
  }

  log.info(`[Bling Webhook] Estoque atualizado: produto ${productId} = ${novoSaldo}`);
  return { success: true, message: `Estoque atualizado para ${novoSaldo}` };
}

/**
 * Busca detalhes completos de um pedido no Bling
 */
async function fetchOrderDetails(accessToken: string, orderId: number): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${BLING_API_BASE}/pedidos/vendas/${orderId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) {
      log.error('[Bling Webhook] Erro ao buscar pedido:', response.status, await response.text());
      return null;
    }
    const json = await response.json();
    return json.data;
  } catch (err) {
    log.error('[Bling Webhook] Erro na requisição do pedido:', err);
    return null;
  }
}

/**
 * Busca detalhes completos de um contato no Bling
 */
async function fetchContactDetails(accessToken: string, contactId: number): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${BLING_API_BASE}/contatos/${contactId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) {
      log.error('[Bling Webhook] Erro ao buscar contato:', response.status, await response.text());
      return null;
    }
    const json = await response.json();
    return json.data;
  } catch (err) {
    log.error('[Bling Webhook] Erro na requisição do contato:', err);
    return null;
  }
}

/**
 * Processa evento de pedido (created, updated, deleted)
 */
async function processOrderEvent(
  supabase: ServiceClient,
  tenantId: string,
  integrationId: string,
  action: string,
  orderId: number,
  eventId: string
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando pedido: action=${action}, orderId=${orderId}`);

  if (action === 'deleted') {
    const { error } = await supabase
      .from('bling_orders')
      .delete()
      .eq('bling_id', orderId)
      .eq('integration_id', integrationId);
    if (error) {
      log.error('[Bling Webhook] Erro ao deletar pedido:', error);
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Pedido deletado' };
  }

  const accessToken = await getValidAccessToken(supabase, tenantId);
  if (!accessToken) return { success: false, message: 'Token de acesso não disponível' };

  const order = await fetchOrderDetails(accessToken, orderId);
  if (!order) return { success: false, message: 'Não foi possível buscar detalhes do pedido' };

  // Extract payment method from parcelas
  let formaPagamento = order.formaPagamento?.descricao || null;
  if (!formaPagamento && order.parcelas && Array.isArray(order.parcelas) && order.parcelas.length > 0) {
    formaPagamento = order.parcelas[0]?.formaPagamento?.descricao || null;
  }

  const orderData = {
    bling_id: order.id,
    integration_id: integrationId,
    tenant_id: tenantId,
    numero: String(order.numero || order.id),
    numero_loja: order.numeroLoja || null,
    numero_pedido_compra: order.numeroPedidoCompra || null,
    data_criacao: order.data || null,
    data_modificacao: order.dataModificacao || null,
    data_saida: order.dataSaida || null,
    data_prevista: order.dataPrevista || null,
    situacao_id: order.situacao?.id || null,
    situacao_nome: order.situacao?.valor || null,
    valor_total: order.total || null,
    valor_produtos: order.totalProdutos || null,
    valor_desconto: order.desconto?.valor || null,
    valor_frete: order.transporte?.fretePorConta === 0 ? (order.transporte?.frete || null) : null,
    valor_base: order.totalProdutos || null,
    custo_frete: order.transporte?.frete || null,
    outras_despesas: order.outrasDespesas || null,
    observacoes: order.observacoes || null,
    observacoes_internas: order.observacoesInternas || null,
    cliente_id: order.contato?.id || null,
    cliente_nome: order.contato?.nome || null,
    cliente_cpf_cnpj: order.contato?.tipoPessoa === 'J' ? order.contato?.cnpj : order.contato?.cpf || null,
    cliente_email: order.contato?.email || null,
    cliente_telefone: order.contato?.telefone || order.contato?.celular || null,
    forma_pagamento: formaPagamento,
    parcelas: order.parcelas || null,
    forma_envio: order.transporte?.volumes?.[0]?.servico || null,
    frete_por_conta: order.transporte?.fretePorConta ?? null,
    transportador_id: order.transporte?.contato?.id || null,
    transportador_nome: order.transporte?.contato?.nome || null,
    peso_bruto: order.transporte?.pesoBruto || null,
    quantidade_volumes: order.transporte?.quantidadeVolumes || null,
    prazo_entrega: order.transporte?.prazoEntrega || null,
    volumes: order.transporte?.volumes || null,
    etiqueta: order.transporte?.etiqueta || null,
    endereco_entrega: order.transporte?.enderecoEntrega || null,
    loja_id: order.loja?.id || null,
    loja_nome: order.loja?.descricao || null,
    vendedor_id: order.vendedor?.id || null,
    categoria_id: order.categoria?.id || null,
    nota_fiscal_id: order.notaFiscal?.id || null,
    intermediador_cnpj: order.intermediador?.cnpj || null,
    intermediador_nome_usuario: order.intermediador?.nomeUsuario || null,
    taxa_comissao: order.taxaComissao || null,
    total_icms: order.totalICMS || null,
    total_ipi: order.totalIPI || null,
    raw_data: order,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertError } = await supabase
    .from('bling_orders')
    .upsert(orderData, { onConflict: 'bling_id,integration_id' })
    .select('id')
    .single();

  if (upsertError) {
    log.error('[Bling Webhook] Erro ao upsert pedido:', upsertError);
    return { success: false, message: upsertError.message };
  }

  // Process order items
  if (order.itens && Array.isArray(order.itens) && upserted?.id) {
    // Delete existing items first
    await supabase.from('bling_order_items').delete().eq('order_id', upserted.id);

    const items = order.itens.map((item: Record<string, unknown>) => ({
      order_id: upserted.id,
      tenant_id: tenantId,
      bling_id: item.id || null,
      produto_id: item.produto?.id || null,
      produto_nome: item.descricao || item.produto?.nome || null,
      sku: item.codigo || null,
      quantidade: item.quantidade || null,
      valor_unitario: item.valor || null,
      valor_total: (item.valor || 0) * (item.quantidade || 0),
      desconto: item.desconto || null,
      unidade: item.unidade || null,
      preco_custo: item.precoCusto || null,
      aliquota_ipi: item.aliquotaIPI || null,
      descricao_detalhada: item.descricaoDetalhada || null,
      comissao_base: item.comissao?.base || null,
      comissao_aliquota: item.comissao?.aliquota || null,
      comissao_valor: item.comissao?.valor || null,
      raw_data: item,
    }));

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('bling_order_items').insert(items);
      if (itemsError) log.error('[Bling Webhook] Erro ao inserir itens:', itemsError);
    }
  }

  log.info('[Bling Webhook] Pedido processado com sucesso:', orderId);
  return { success: true, message: `Pedido ${action === 'created' ? 'criado' : 'atualizado'}` };
}

/**
 * Processa evento de contato/cliente (created, updated, deleted)
 */
async function processCustomerEvent(
  supabase: ServiceClient,
  tenantId: string,
  integrationId: string,
  action: string,
  contactId: number,
  eventId: string
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando contato: action=${action}, contactId=${contactId}`);

  if (action === 'deleted') {
    const { error } = await supabase
      .from('bling_customers')
      .delete()
      .eq('bling_id', contactId)
      .eq('integration_id', integrationId);
    if (error) {
      log.error('[Bling Webhook] Erro ao deletar contato:', error);
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Contato deletado' };
  }

  const accessToken = await getValidAccessToken(supabase, tenantId);
  if (!accessToken) return { success: false, message: 'Token de acesso não disponível' };

  const contact = await fetchContactDetails(accessToken, contactId);
  if (!contact) return { success: false, message: 'Não foi possível buscar detalhes do contato' };

  const endereco = contact.endereco || contact.enderecos?.[0] || null;

  const customerData = {
    bling_id: contact.id,
    integration_id: integrationId,
    tenant_id: tenantId,
    nome: contact.nome || 'Sem nome',
    fantasia: contact.fantasia || null,
    tipo_pessoa: contact.tipo || contact.tipoPessoa || null,
    cpf_cnpj: contact.numeroDocumento || contact.cpfCnpj || null,
    ie: contact.ie || null,
    rg: contact.rg || null,
    orgao_emissor: contact.orgaoEmissor || null,
    email: contact.email || null,
    telefone: contact.telefone || null,
    celular: contact.celular || null,
    sexo: contact.sexo || null,
    data_nascimento: contact.dataNascimento || null,
    naturalidade: contact.naturalidade || null,
    data_inclusao: contact.dataInclusao || null,
    situacao: contact.situacao || null,
    endereco: endereco ? {
      endereco: endereco.endereco || null,
      numero: endereco.numero || null,
      complemento: endereco.complemento || null,
      bairro: endereco.bairro || null,
      cep: endereco.cep || null,
      municipio: endereco.municipio || null,
      uf: endereco.uf || null,
      pais: endereco.pais || null,
    } : null,
    raw_data: contact,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase
    .from('bling_customers')
    .upsert(customerData, { onConflict: 'bling_id,integration_id' });

  if (upsertError) {
    log.error('[Bling Webhook] Erro ao upsert contato:', upsertError);
    return { success: false, message: upsertError.message };
  }

  log.info('[Bling Webhook] Contato processado com sucesso:', contactId);
  return { success: true, message: `Contato ${action === 'created' ? 'criado' : 'atualizado'}` };
}

/**
 * Busca integration_id para um tenant
 */
async function findIntegrationId(supabase: ServiceClient, tenantId: string): Promise<string | null> {
  const { data: integration } = await supabase
    .from('integrations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('type', 'bling')
    .eq('is_active', true)
    .maybeSingle();

  return integration?.id || null;
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  log = createLogger("bling-webhooks", cid);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Apenas POST aceito
  if (req.method !== 'POST') {
    log.info('[Bling Webhook] Método não permitido:', req.method);
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    // Obter secrets
    const BLING_CLIENT_SECRET = Deno.env.get('BLING_CLIENT_SECRET');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!BLING_CLIENT_SECRET) {
      log.error('[Bling Webhook] BLING_CLIENT_SECRET não configurado');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Ler body como texto RAW (importante para validação HMAC)
    const rawBody = await req.text();
    
    // Obter assinatura do header
    const signature = req.headers.get('X-Bling-Signature-256');
    
    log.info('[Bling Webhook] Recebendo webhook...');
    log.info('[Bling Webhook] Tamanho do payload:', rawBody.length, 'bytes');
    log.info('[Bling Webhook] Assinatura presente:', !!signature);
    
    // Validar assinatura HMAC-SHA256
    const isValid = await verifyBlingSignature(rawBody, signature, BLING_CLIENT_SECRET);
    
    if (!isValid) {
      log.info('[Bling Webhook] Assinatura inválida - rejeitando webhook');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    log.info('[Bling Webhook] Assinatura válida');
    
    // Parsear JSON
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      log.error('[Bling Webhook] Erro ao parsear JSON:', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extrair campos do payload
    // O campo 'event' do Bling vem no formato "resource.action" (ex: "stock.updated", "produtos.created")
    const companyId = payload.companyId || null;
    const eventField = payload.event || ''; // Ex: "stock.updated", "produtos.created"
    const [resourceFromEvent, actionFromEvent] = eventField.includes('.') ? eventField.split('.') : [null, null];
    const resource = resourceFromEvent || payload.resource || 'unknown';
    const action = actionFromEvent || payload.action || 'unknown';
    const dataId = payload.data?.id || null;
    
    log.info('[Bling Webhook] Evento recebido:', {
      companyId,
      resource,
      action,
      dataId
    });
    
    // Gerar event_key idempotente
    const eventKey = generateEventKey(payload);
    log.info('[Bling Webhook] Event key:', eventKey);
    
    // Criar cliente Supabase com service role
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Verificar se evento já existe (idempotência)
    const { data: existingEvent } = await supabase
      .from('bling_webhook_events')
      .select('id, status')
      .eq('event_key', eventKey)
      .maybeSingle();
    
    if (existingEvent) {
      log.info('[Bling Webhook] Evento duplicado - já processado:', existingEvent.id, existingEvent.status);
      return new Response(
        JSON.stringify({ ok: true, message: 'Event already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Mapear companyId -> tenant_id via bling_connections
    let tenantId: string | null = null;
    
    if (companyId) {
      const { data: connection } = await supabase
        .from('bling_connections')
        .select('tenant_id')
        .eq('bling_company_id', companyId)
        .eq('status', 'connected')
        .maybeSingle();
      
      tenantId = connection?.tenant_id || null;
    }
    
    // Determinar status inicial
    let status = 'received';
    let processResult: { success: boolean; message: string } | null = null;
    
    if (!tenantId) {
      log.info('[Bling Webhook] Tenant não encontrado para companyId:', companyId);
      status = 'ignored';
    }
    
    // Inserir evento no banco
    const { data: insertedEvent, error: insertError } = await supabase
      .from('bling_webhook_events')
      .insert({
        event_key: eventKey,
        tenant_id: tenantId,
        company_id: companyId || 'unknown',
        resource,
        action,
        payload,
        status
      })
      .select('id')
      .single();
    
    if (insertError) {
      // Se for erro de unique constraint, evento já existe
      if (insertError.code === '23505') {
        log.info('[Bling Webhook] Evento duplicado (race condition) - já existe');
        return new Response(
          JSON.stringify({ ok: true, message: 'Event already exists' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      log.error('[Bling Webhook] Erro ao inserir evento:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    log.info('[Bling Webhook] Evento salvo com sucesso:', {
      id: insertedEvent.id,
      status,
      tenantId: tenantId || 'N/A'
    });

    // Processar eventos em tempo real
    if (tenantId) {
      const integrationId = await findIntegrationId(supabase, tenantId);
      
      if (integrationId) {
        // Processar eventos de produtos
        if (resource === 'produtos' && dataId) {
          log.info('[Bling Webhook] Processando evento de produto...');
          
          processResult = await processProductEvent(
            supabase,
            tenantId,
            integrationId,
            action,
            dataId,
            insertedEvent.id
          );
        }
        
        // Processar eventos de estoque (estoques, stock, virtual_stock, estoques_virtuais)
        if ((resource === 'estoques' || resource === 'stock' || resource === 'estoques_virtuais' || resource === 'virtual_stock') && payload.data) {
          log.info('[Bling Webhook] Processando evento de estoque...');
          
          processResult = await processStockEvent(
            supabase,
            tenantId,
            integrationId,
            action,
            payload.data,
            insertedEvent.id
          );
        }

        // Processar eventos de pedidos
        if ((resource === 'pedidos' || resource === 'pedidos.vendas') && dataId) {
          log.info('[Bling Webhook] Processando evento de pedido...');
          
          processResult = await processOrderEvent(
            supabase,
            tenantId,
            integrationId,
            action,
            dataId,
            insertedEvent.id
          );
        }

        // Processar eventos de contatos/clientes
        if (resource === 'contatos' && dataId) {
          log.info('[Bling Webhook] Processando evento de contato...');
          
          processResult = await processCustomerEvent(
            supabase,
            tenantId,
            integrationId,
            action,
            dataId,
            insertedEvent.id
          );
        }

        // Atualizar status do evento se foi processado
        if (processResult) {
          await supabase
            .from('bling_webhook_events')
            .update({
              status: processResult.success ? 'processed' : 'failed',
              error: processResult.success ? null : processResult.message,
              processed_at: new Date().toISOString()
            })
            .eq('id', insertedEvent.id);

          log.info('[Bling Webhook] Processamento concluído:', processResult);
        }
      } else {
        log.info('[Bling Webhook] Integration_id não encontrado para tenant:', tenantId);
      }
    }
    
    // Retornar sucesso rapidamente
    return new Response(
      JSON.stringify({ 
        ok: true,
        processed: processResult?.success ?? false,
        message: processResult?.message
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    log.error('[Bling Webhook] Erro inesperado:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
