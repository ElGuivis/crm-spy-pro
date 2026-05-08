/**
 * Bling orders sync logic.
 * Extracted from bling-sync/index.ts.
 */

import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
import {
  PAGE_SIZE, DETAIL_FETCH_DELAY, RATE_LIMIT_DELAY,
  delay, fetchBlingData, fetchBlingDetail,
  safeParseDate, isJobCancelled, updateJobProgress,
} from "./bling-sync-helpers.ts";

const log = createLogger("bling-sync-orders", "shared");

/** Sync orders from Bling - fetches complete details for each order */
export async function syncOrders(
  supabase: ServiceClient,
  accessToken: string,
  integrationId: string,
  tenantId: string,
  jobId: string,
  storeIds?: number[],
  incremental: boolean = false
): Promise<number> {
  let page = 1;
  let totalSynced = 0;
  let hasMore = true;
  const maxPages = incremental ? 3 : 100;

  while (hasMore && page <= maxPages) {
    if (await isJobCancelled(supabase, jobId)) {
      log.info('[bling-sync] Job cancelled, stopping orders sync');
      throw new Error('CANCELLED');
    }

    try {
      await updateJobProgress(supabase, jobId, { current_page: page });

      const { data: orders, hasMore: more } = await fetchBlingData(accessToken, '/pedidos/vendas', page);
      hasMore = more;
      if (orders.length === 0) break;

      let filteredOrders = orders;
      if (storeIds && storeIds.length > 0) {
        filteredOrders = orders.filter((o: Record<string, unknown>) =>
          (o.loja as Record<string, unknown>)?.id && storeIds.includes((o.loja as Record<string, unknown>).id as number)
        );
        log.info(`[bling-sync] Filtered ${orders.length} orders to ${filteredOrders.length} (stores: ${storeIds.join(', ')})`);
      }

      for (const orderSummary of filteredOrders) {
        try {
          const orderDetails = await fetchBlingDetail(accessToken, `/pedidos/vendas/${orderSummary.id}`, `order ${orderSummary.id}`);
          await delay(DETAIL_FETCH_DELAY);

          const order: Record<string, unknown> = (orderDetails || orderSummary) as Record<string, unknown>;
          const contato = order.contato as Record<string, unknown> | undefined;
          const situacao = order.situacao as Record<string, unknown> | undefined;
          const transporte = order.transporte as Record<string, unknown> | undefined;
          const desconto = order.desconto as Record<string, unknown> | undefined;
          const tributacao = order.tributacao as Record<string, unknown> | undefined;
          const vendedor = order.vendedor as Record<string, unknown> | undefined;
          const intermediador = order.intermediador as Record<string, unknown> | undefined;
          const taxas = order.taxas as Record<string, unknown> | undefined;
          const categoria = order.categoria as Record<string, unknown> | undefined;
          const notaFiscal = order.notaFiscal as Record<string, unknown> | undefined;
          const loja = order.loja as Record<string, unknown> | undefined;

          const situacaoId = situacao?.id;
          const situacaoNome = (situacao?.nome || situacao?.valor) as string | undefined;

          const transporteContato = transporte?.contato as Record<string, unknown> | undefined;

          const orderData = {
            bling_id: order.id,
            numero: order.numero || String(order.id),
            data_criacao: safeParseDate(order.data as string),
            data_modificacao: safeParseDate(order.dataAlteracao as string),
            situacao_id: situacaoId,
            situacao_nome: situacaoNome,
            cliente_id: contato?.id,
            cliente_nome: contato?.nome,
            cliente_cpf_cnpj: contato?.numeroDocumento,
            cliente_email: contato?.email,
            cliente_telefone: contato?.telefone || contato?.celular,
            valor_total: order.total,
            valor_desconto: (desconto?.valor as number) || 0,
            valor_frete: (transporte?.frete as number) || 0,
            valor_produtos: order.totalProdutos,
            forma_pagamento: (order.pagamento as Record<string, unknown>)?.formaPagamento
              ? ((order.pagamento as Record<string, unknown>).formaPagamento as Record<string, unknown>)?.descricao
              : ((order.parcelas as Record<string, unknown>[])?.[0] as Record<string, unknown>)?.formaPagamento
                ? (((order.parcelas as Record<string, unknown>[])?.[0] as Record<string, unknown>).formaPagamento as Record<string, unknown>)?.descricao
                : null,
            forma_envio: transporte?.transportador,
            observacoes: order.observacoes,
            observacoes_internas: order.observacoesInternas,
            endereco_entrega: transporte?.enderecoEntrega || null,
            loja_id: loja?.id,
            loja_nome: loja?.nome,
            numero_loja: order.numeroLoja,
            data_saida: safeParseDate(order.dataSaida as string),
            data_prevista: safeParseDate(order.dataPrevista as string),
            outras_despesas: (order.outrasDespesas as number) || 0,
            numero_pedido_compra: order.numeroPedidoCompra,
            categoria_id: categoria?.id,
            nota_fiscal_id: notaFiscal?.id,
            total_icms: (tributacao?.totalICMS as number) || 0,
            total_ipi: (tributacao?.totalIPI as number) || 0,
            vendedor_id: vendedor?.id,
            intermediador_cnpj: intermediador?.cnpj,
            intermediador_nome_usuario: intermediador?.nomeUsuario,
            taxa_comissao: (taxas?.taxaComissao as number) || 0,
            custo_frete: (taxas?.custoFrete as number) || 0,
            valor_base: (taxas?.valorBase as number) || 0,
            frete_por_conta: transporte?.fretePorConta,
            quantidade_volumes: transporte?.quantidadeVolumes,
            peso_bruto: transporte?.pesoBruto,
            prazo_entrega: transporte?.prazoEntrega,
            transportador_id: transporteContato?.id,
            transportador_nome: transporteContato?.nome,
            etiqueta: transporte?.etiqueta || null,
            volumes: transporte?.volumes || null,
            parcelas: order.parcelas || null,
            raw_data: order,
            tenant_id: tenantId,
            integration_id: integrationId,
            synced_at: new Date().toISOString(),
          };

          const { error, data: upsertedOrder } = await supabase
            .from('bling_orders')
            .upsert(orderData, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false })
            .select('id')
            .single();

          if (error) {
            log.error('[bling-sync] Error upserting order:', error);
          } else {
            totalSynced++;
            const items = (order.itens as Record<string, unknown>[]) || [];
            if (items.length > 0 && upsertedOrder) {
              await supabase.from('bling_order_items').delete().eq('order_id', upsertedOrder.id);

              const itemsToInsert = items.map((item: Record<string, unknown>) => {
                const produto = item.produto as Record<string, unknown> | undefined;
                const itemDesconto = item.desconto as Record<string, unknown> | undefined;
                const comissao = item.comissao as Record<string, unknown> | undefined;
                const naturezaOp = item.naturezaOperacao as Record<string, unknown> | undefined;
                return {
                  order_id: upsertedOrder.id,
                  bling_id: item.id,
                  produto_id: produto?.id,
                  produto_nome: item.descricao || produto?.nome,
                  sku: item.codigo,
                  quantidade: item.quantidade,
                  valor_unitario: item.valor,
                  valor_total: ((item.quantidade as number) || 1) * ((item.valor as number) || 0),
                  desconto: (itemDesconto?.valor as number) || 0,
                  preco_custo: (produto?.precoCusto as number) || 0,
                  unidade: item.unidade,
                  aliquota_ipi: (item.aliquotaIPI as number) || 0,
                  descricao_detalhada: item.descricaoDetalhada,
                  comissao_base: (comissao?.base as number) || 0,
                  comissao_aliquota: (comissao?.aliquota as number) || 0,
                  comissao_valor: (comissao?.valor as number) || 0,
                  natureza_operacao_id: naturezaOp?.id,
                  raw_data: item,
                  tenant_id: tenantId,
                };
              });

              const { error: itemsError } = await supabase.from('bling_order_items').insert(itemsToInsert);
              if (itemsError) {
                log.error(`[bling-sync] Error inserting items for order ${order.id}:`, itemsError);
              } else {
                log.info(`[bling-sync] Inserted ${itemsToInsert.length} items for order ${order.id}`);
              }
            }
          }
        } catch (orderErr: unknown) {
          const errMsg = (orderErr as Error)?.message;
          if (errMsg === 'RATE_LIMITED') {
            log.info('[bling-sync] Rate limited on order details, waiting 2 seconds...');
            await delay(2000);
          } else {
            log.error(`[bling-sync] Error processing order ${orderSummary.id}:`, orderErr);
          }
        }
      }

      await updateJobProgress(supabase, jobId, {
        processed_count: page * PAGE_SIZE,
        saved_count: totalSynced,
      });

      page++;
      await delay(RATE_LIMIT_DELAY);
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message;
      if (errMsg === 'RATE_LIMITED') {
        log.info('[bling-sync] Rate limited, waiting 2 seconds...');
        await delay(2000);
        continue;
      }
      throw err;
    }
  }

  return totalSynced;
}
