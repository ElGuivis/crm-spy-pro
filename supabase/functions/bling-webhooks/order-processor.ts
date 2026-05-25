import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import type { Logger } from "../_shared/correlation.ts";
import { getValidAccessToken } from './webhook-helpers.ts';

const BLING_API_BASE = 'https://api.bling.com.br/Api/v3';

async function fetchOrderDetails(accessToken: string, orderId: number, log: Logger): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${BLING_API_BASE}/pedidos/vendas/${orderId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) { log.error('[Bling Webhook] Erro ao buscar pedido:', response.status, await response.text()); return null; }
    const json = await response.json();
    return json.data;
  } catch (err) { log.error('[Bling Webhook] Erro na requisição do pedido:', err); return null; }
}

async function fetchContactDetails(accessToken: string, contactId: number, log: Logger): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${BLING_API_BASE}/contatos/${contactId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) { log.error('[Bling Webhook] Erro ao buscar contato:', response.status, await response.text()); return null; }
    const json = await response.json();
    return json.data;
  } catch (err) { log.error('[Bling Webhook] Erro na requisição do contato:', err); return null; }
}

export async function processOrderEvent(
  supabase: ServiceClient, tenantId: string, integrationId: string, action: string, orderId: number, _eventId: string, log: Logger,
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando pedido: action=${action}, orderId=${orderId}`);

  if (action === 'deleted') {
    const { error } = await supabase.from('bling_orders').delete().eq('bling_id', orderId).eq('integration_id', integrationId);
    if (error) { log.error('[Bling Webhook] Erro ao deletar pedido:', error); return { success: false, message: error.message }; }
    return { success: true, message: 'Pedido deletado' };
  }

  const accessToken = await getValidAccessToken(supabase, tenantId, log);
  if (!accessToken) return { success: false, message: 'Token de acesso não disponível' };

  const order = await fetchOrderDetails(accessToken, orderId, log);
  if (!order) return { success: false, message: 'Não foi possível buscar detalhes do pedido' };

  let formaPagamento = (order.formaPagamento as Record<string, unknown>)?.descricao || null;
  if (!formaPagamento && order.parcelas && Array.isArray(order.parcelas) && (order.parcelas as unknown[]).length > 0) {
    formaPagamento = ((order.parcelas as Record<string, unknown>[])[0]?.formaPagamento as Record<string, unknown>)?.descricao || null;
  }

  const contato = (order.contato || {}) as Record<string, unknown>;
  const transporte = (order.transporte || {}) as Record<string, unknown>;
  const situacao = (order.situacao || {}) as Record<string, unknown>;
  const loja = (order.loja || {}) as Record<string, unknown>;
  const desconto = (order.desconto || {}) as Record<string, unknown>;
  const volumes = (transporte.volumes || []) as Record<string, unknown>[];

  const orderData = {
    bling_id: order.id, integration_id: integrationId, tenant_id: tenantId,
    numero: String(order.numero || order.id), numero_loja: order.numeroLoja || null,
    numero_pedido_compra: order.numeroPedidoCompra || null, data_criacao: order.data || null,
    data_modificacao: order.dataModificacao || null, data_saida: order.dataSaida || null,
    data_prevista: order.dataPrevista || null, situacao_id: situacao.id || null,
    situacao_nome: situacao.valor || null, valor_total: order.total || null,
    valor_produtos: order.totalProdutos || null, valor_desconto: desconto.valor || null,
    valor_frete: transporte.fretePorConta === 0 ? (transporte.frete || null) : null,
    valor_base: order.totalProdutos || null, custo_frete: transporte.frete || null,
    outras_despesas: order.outrasDespesas || null, observacoes: order.observacoes || null,
    observacoes_internas: order.observacoesInternas || null, cliente_id: contato.id || null,
    cliente_nome: contato.nome || null,
    cliente_cpf_cnpj: contato.tipoPessoa === 'J' ? contato.cnpj : contato.cpf || null,
    cliente_email: contato.email || null, cliente_telefone: contato.telefone || contato.celular || null,
    forma_pagamento: formaPagamento, parcelas: order.parcelas || null,
    forma_envio: volumes[0]?.servico || null, frete_por_conta: transporte.fretePorConta ?? null,
    transportador_id: (transporte.contato as Record<string, unknown>)?.id || null,
    transportador_nome: (transporte.contato as Record<string, unknown>)?.nome || null,
    peso_bruto: transporte.pesoBruto || null, quantidade_volumes: transporte.quantidadeVolumes || null,
    prazo_entrega: transporte.prazoEntrega || null, volumes: transporte.volumes || null,
    etiqueta: transporte.etiqueta || null, endereco_entrega: transporte.enderecoEntrega || null,
    loja_id: loja.id || null, loja_nome: loja.descricao || null,
    vendedor_id: (order.vendedor as Record<string, unknown>)?.id || null,
    categoria_id: (order.categoria as Record<string, unknown>)?.id || null,
    nota_fiscal_id: (order.notaFiscal as Record<string, unknown>)?.id || null,
    intermediador_cnpj: (order.intermediador as Record<string, unknown>)?.cnpj || null,
    intermediador_nome_usuario: (order.intermediador as Record<string, unknown>)?.nomeUsuario || null,
    taxa_comissao: order.taxaComissao || null, total_icms: order.totalICMS || null, total_ipi: order.totalIPI || null,
    raw_data: order, synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  const { data: upserted, error: upsertError } = await supabase.from('bling_orders').upsert(orderData, { onConflict: 'bling_id,integration_id' }).select('id').single();
  if (upsertError) { log.error('[Bling Webhook] Erro ao upsert pedido:', upsertError); return { success: false, message: upsertError.message }; }

  if (order.itens && Array.isArray(order.itens) && upserted?.id) {
    await supabase.from('bling_order_items').delete().eq('order_id', upserted.id);
    const items = (order.itens as Record<string, unknown>[]).map((item) => ({
      order_id: upserted.id, tenant_id: tenantId,
      bling_id: item.id || null, produto_id: (item.produto as Record<string, unknown>)?.id || null,
      produto_nome: item.descricao || (item.produto as Record<string, unknown>)?.nome || null,
      sku: item.codigo || null, quantidade: item.quantidade || null, valor_unitario: item.valor || null,
      valor_total: ((item.valor as number) || 0) * ((item.quantidade as number) || 0),
      desconto: item.desconto || null, unidade: item.unidade || null, preco_custo: item.precoCusto || null,
      aliquota_ipi: item.aliquotaIPI || null, descricao_detalhada: item.descricaoDetalhada || null,
      comissao_base: (item.comissao as Record<string, unknown>)?.base || null,
      comissao_aliquota: (item.comissao as Record<string, unknown>)?.aliquota || null,
      comissao_valor: (item.comissao as Record<string, unknown>)?.valor || null, raw_data: item,
    }));
    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('bling_order_items').insert(items);
      if (itemsError) log.error('[Bling Webhook] Erro ao inserir itens:', itemsError);
    }
  }

  log.info('[Bling Webhook] Pedido processado com sucesso:', orderId);
  return { success: true, message: `Pedido ${action === 'created' ? 'criado' : 'atualizado'}` };
}

export async function processCustomerEvent(
  supabase: ServiceClient, tenantId: string, integrationId: string, action: string, contactId: number, _eventId: string, log: Logger,
): Promise<{ success: boolean; message: string }> {
  log.info(`[Bling Webhook] Processando contato: action=${action}, contactId=${contactId}`);

  if (action === 'deleted') {
    const { error } = await supabase.from('bling_customers').delete().eq('bling_id', contactId).eq('integration_id', integrationId);
    if (error) { log.error('[Bling Webhook] Erro ao deletar contato:', error); return { success: false, message: error.message }; }
    return { success: true, message: 'Contato deletado' };
  }

  const accessToken = await getValidAccessToken(supabase, tenantId, log);
  if (!accessToken) return { success: false, message: 'Token de acesso não disponível' };

  const contact = await fetchContactDetails(accessToken, contactId, log);
  if (!contact) return { success: false, message: 'Não foi possível buscar detalhes do contato' };

  const endereco = (contact.endereco || (contact.enderecos as unknown[])?.[0] || null) as Record<string, unknown> | null;

  const customerData = {
    bling_id: contact.id, integration_id: integrationId, tenant_id: tenantId,
    nome: contact.nome || 'Sem nome', fantasia: contact.fantasia || null,
    tipo_pessoa: contact.tipo || contact.tipoPessoa || null,
    cpf_cnpj: contact.numeroDocumento || contact.cpfCnpj || null,
    ie: contact.ie || null, rg: contact.rg || null, orgao_emissor: contact.orgaoEmissor || null,
    email: contact.email || null, telefone: contact.telefone || null, celular: contact.celular || null,
    sexo: contact.sexo || null, data_nascimento: contact.dataNascimento || null,
    naturalidade: contact.naturalidade || null, data_inclusao: contact.dataInclusao || null,
    situacao: contact.situacao || null,
    endereco: endereco ? { endereco: endereco.endereco || null, numero: endereco.numero || null, complemento: endereco.complemento || null, bairro: endereco.bairro || null, cep: endereco.cep || null, municipio: endereco.municipio || null, uf: endereco.uf || null, pais: endereco.pais || null } : null,
    raw_data: contact, synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await supabase.from('bling_customers').upsert(customerData, { onConflict: 'bling_id,integration_id' });
  if (upsertError) { log.error('[Bling Webhook] Erro ao upsert contato:', upsertError); return { success: false, message: upsertError.message }; }
  log.info('[Bling Webhook] Contato processado com sucesso:', contactId);
  return { success: true, message: `Contato ${action === 'created' ? 'criado' : 'atualizado'}` };
}
