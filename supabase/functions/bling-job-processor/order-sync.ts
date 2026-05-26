import { createLogger } from "../_shared/correlation.ts";
import type { ServiceClient } from "../_shared/supabase-types.ts";
import { BLING_API_BASE, RATE_LIMIT_DELAY, delay, safeParseDate, fetchOrderDetails } from "./job-helpers.ts";

type Log = ReturnType<typeof createLogger>;

export async function syncNewOrders(
  supabase: ServiceClient, accessToken: string, integrationId: string, tenantId: string,
  storeIds: number[] | null, lastBlingId: number, log: Log
): Promise<{ success: boolean; synced: number; errors: string[]; debug: Record<string, unknown> }> {
  const errors: string[] = [];
  let synced = 0;
  const debug: Record<string, unknown> = { lastBlingId, newOrders: [] };

  try {
    const allOrders: Record<string, unknown>[] = [];
    for (let page = 1; page <= 2; page++) {
      const response = await fetch(`${BLING_API_BASE}/pedidos/vendas?pagina=${page}&limite=100`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
      });
      if (!response.ok) { if (response.status === 429) throw new Error('RATE_LIMITED'); throw new Error(`API error: ${response.status}`); }
      const result = await response.json();
      const orders = result.data || [];
      allOrders.push(...orders);
      if (orders.length < 100) break;
      await delay(RATE_LIMIT_DELAY);
    }

    log.info(`[BLING-JOB] Fetched ${allOrders.length} orders from API`);
    let filteredOrders = allOrders;
    if (storeIds && storeIds.length > 0) {
      filteredOrders = allOrders.filter((o: Record<string, unknown>) => (o.loja as Record<string, unknown>)?.id && storeIds.includes((o.loja as Record<string, unknown>).id as number));
      log.info(`[BLING-JOB] Filtered to ${filteredOrders.length} orders for stores: ${storeIds.join(', ')}`);
    }

    const newOrders = filteredOrders.filter((o: Record<string, unknown>) => (o.id as number) > lastBlingId);
    debug.newOrdersCount = newOrders.length;
    log.info(`[BLING-JOB] Found ${newOrders.length} new orders (bling_id > ${lastBlingId})`);
    if (newOrders.length === 0) return { success: true, synced: 0, errors: [], debug };

    newOrders.sort((a: Record<string, unknown>, b: Record<string, unknown>) => (a.id as number) - (b.id as number));
    debug.newOrders = newOrders.slice(0, 5).map((o: Record<string, unknown>) => ({ id: o.id, numero: o.numero }));

    for (const orderSummary of newOrders) {
      try {
        const orderDetails = await fetchOrderDetails(accessToken, orderSummary.id as number, log);
        await delay(RATE_LIMIT_DELAY);
        const order = orderDetails || orderSummary;

        const situacaoId = (order.situacao as Record<string, unknown>)?.id;
        const situacaoNome = (order.situacao as Record<string, unknown>)?.nome || (order.situacao as Record<string, unknown>)?.valor;

        const { error, data: upsertedOrder } = await supabase.from('bling_orders').upsert({
          bling_id: order.id, numero: order.numero || String(order.id),
          data_criacao: safeParseDate(order.data as string), data_modificacao: safeParseDate(order.dataAlteracao as string),
          situacao_id: situacaoId, situacao_nome: situacaoNome,
          cliente_id: (order.contato as Record<string, unknown>)?.id, cliente_nome: (order.contato as Record<string, unknown>)?.nome,
          cliente_cpf_cnpj: (order.contato as Record<string, unknown>)?.numeroDocumento, cliente_email: (order.contato as Record<string, unknown>)?.email,
          cliente_telefone: (order.contato as Record<string, unknown>)?.telefone || (order.contato as Record<string, unknown>)?.celular,
          valor_total: order.total, valor_desconto: (order.desconto as Record<string, unknown>)?.valor || 0,
          valor_frete: (order.transporte as Record<string, unknown>)?.frete || 0, valor_produtos: order.totalProdutos,
          forma_pagamento: (order.pagamento as Record<string, unknown>)?.formaPagamento?.descricao || (order.parcelas as Record<string, unknown>[])?.[0]?.formaPagamento?.descricao || null,
          forma_envio: (order.transporte as Record<string, unknown>)?.transportador,
          observacoes: order.observacoes, observacoes_internas: order.observacoesInternas,
          endereco_entrega: (order.transporte as Record<string, unknown>)?.enderecoEntrega || null,
          loja_id: (order.loja as Record<string, unknown>)?.id, loja_nome: (order.loja as Record<string, unknown>)?.nome, numero_loja: order.numeroLoja,
          data_saida: safeParseDate(order.dataSaida as string), data_prevista: safeParseDate(order.dataPrevista as string),
          outras_despesas: order.outrasDespesas || 0, numero_pedido_compra: order.numeroPedidoCompra,
          categoria_id: (order.categoria as Record<string, unknown>)?.id, nota_fiscal_id: (order.notaFiscal as Record<string, unknown>)?.id,
          total_icms: (order.tributacao as Record<string, unknown>)?.totalICMS || 0, total_ipi: (order.tributacao as Record<string, unknown>)?.totalIPI || 0,
          vendedor_id: (order.vendedor as Record<string, unknown>)?.id, intermediador_cnpj: (order.intermediador as Record<string, unknown>)?.cnpj,
          intermediador_nome_usuario: (order.intermediador as Record<string, unknown>)?.nomeUsuario,
          taxa_comissao: (order.taxas as Record<string, unknown>)?.taxaComissao || 0, custo_frete: (order.taxas as Record<string, unknown>)?.custoFrete || 0,
          valor_base: (order.taxas as Record<string, unknown>)?.valorBase || 0, frete_por_conta: (order.transporte as Record<string, unknown>)?.fretePorConta,
          quantidade_volumes: (order.transporte as Record<string, unknown>)?.quantidadeVolumes, peso_bruto: (order.transporte as Record<string, unknown>)?.pesoBruto,
          prazo_entrega: (order.transporte as Record<string, unknown>)?.prazoEntrega, transportador_id: (order.transporte as Record<string, unknown>)?.contato?.id,
          transportador_nome: (order.transporte as Record<string, unknown>)?.contato?.nome,
          etiqueta: (order.transporte as Record<string, unknown>)?.etiqueta || null, volumes: (order.transporte as Record<string, unknown>)?.volumes || null,
          parcelas: order.parcelas || null, raw_data: order,
          tenant_id: tenantId, integration_id: integrationId, synced_at: new Date().toISOString(),
        }, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false }).select('id').single();

        if (error) { errors.push(`Order ${order.numero}: ${error.message}`); }
        else {
          synced++;
          log.info(`[BLING-JOB] ✓ Synced order #${order.numero} (bling_id: ${order.id})`);
          const items = order.itens as Record<string, unknown>[] || [];
          if (items.length > 0 && upsertedOrder) {
            await supabase.from('bling_order_items').delete().eq('order_id', upsertedOrder.id);
            await supabase.from('bling_order_items').insert(items.map((item) => ({
              order_id: upsertedOrder.id, bling_id: item.id, produto_id: (item.produto as Record<string, unknown>)?.id,
              produto_nome: item.descricao || (item.produto as Record<string, unknown>)?.nome, sku: item.codigo,
              quantidade: item.quantidade, valor_unitario: item.valor, valor_total: ((item.quantidade as number) || 1) * ((item.valor as number) || 0),
              desconto: (item.desconto as Record<string, unknown>)?.valor || 0, preco_custo: (item.produto as Record<string, unknown>)?.precoCusto || 0,
              unidade: item.unidade, aliquota_ipi: item.aliquotaIPI || 0, descricao_detalhada: item.descricaoDetalhada,
              natureza_operacao_id: (item.naturezaOperacao as Record<string, unknown>)?.id,
              comissao_base: (item.comissao as Record<string, unknown>)?.base || 0, comissao_aliquota: (item.comissao as Record<string, unknown>)?.aliquota || 0,
              comissao_valor: (item.comissao as Record<string, unknown>)?.valor || 0, raw_data: item, tenant_id: tenantId,
            })));
          }
        }
      } catch (e) { errors.push(`Order ${orderSummary.numero}: ${e instanceof Error ? e.message : 'Unknown error'}`); }
    }
    return { success: true, synced, errors, debug };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Sync error:', msg);
    return { success: false, synced: 0, errors: [msg], debug };
  }
}
