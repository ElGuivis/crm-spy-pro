import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";
import { LI_API_BASE, PAGE_SIZE, rateLimitedFetch, getOrCreateSyncState } from "./fetch-helpers.ts";

type ServiceClient = ReturnType<typeof createClient>;
const log = createLogger("li-sync", "bg");

export async function syncAllOrders(
  supabase: ServiceClient, integrationId: string, tenantId: string, authHeader: string, deadline: number
): Promise<number> {
  const syncState = await getOrCreateSyncState(supabase, integrationId, tenantId, 'orders');
  let synced = 0;
  let offset = syncState?.last_offset || 0;
  let hasMore = true;
  const startOffset = offset;

  log.info(`[LI-SYNC] Orders: resuming from offset=${offset}`);

  while (hasMore && Date.now() < deadline) {
    const url = `${LI_API_BASE}/pedido/search?limit=${PAGE_SIZE}&offset=${offset}`;
    log.info(`[LI-SYNC] Fetching orders: offset=${offset}, synced=${synced}`);
    const res = await rateLimitedFetch(url, authHeader);
    let objects: Record<string, unknown>[] = [];

    if (!res.ok) {
      const fallbackRes = await rateLimitedFetch(`${LI_API_BASE}/pedido?limit=${PAGE_SIZE}&offset=${offset}`, authHeader);
      if (!fallbackRes.ok) { log.error(`[LI-SYNC] Orders API returned ${fallbackRes.status}`); break; }
      objects = (await fallbackRes.json()).objects || [];
    } else {
      const data = await res.json();
      objects = data.objects || [];
      log.info(`[LI-SYNC] Orders page: ${objects.length} objects, total=${data.meta?.total_count || 'N/A'}`);
      const totalCount = data.meta?.total_count;
      if (typeof totalCount === 'number' && syncState?.id) {
        await supabase.from('li_sync_state').update({ total_count: totalCount }).eq('id', syncState.id);
      }
    }

    if (objects.length === 0) {
      offset = 0; hasMore = false;
      log.info(`[LI-SYNC] All orders fetched, resetting offset to 0`);
      if (syncState?.id) await supabase.from('li_sync_state').update({ last_offset: 0, updated_at: new Date().toISOString() }).eq('id', syncState.id);
      break;
    }

    let processedInPage = 0;
    for (const obj of objects) {
      if (Date.now() >= deadline) break;
      try {
        const orderNumero = obj.numero || obj.id;
        const detailRes = await rateLimitedFetch(`${LI_API_BASE}/pedido/${orderNumero}`, authHeader);
        const orderData = detailRes.ok ? await detailRes.json() : (log.warn(`[LI-SYNC] Order ${orderNumero} detail returned ${detailRes.status}, using list data`), obj);
        await upsertOrderFromData(supabase, orderData, integrationId, tenantId);
        synced++;
        processedInPage++;
        if (synced % 50 === 0) log.info(`[LI-SYNC] Orders progress: ${synced} synced`);
      } catch (e: unknown) { log.error(`[LI-SYNC] Order ${obj.id} error:`, (e as Error).message); processedInPage++; }
    }

    offset += processedInPage;
    const isEndOfData = objects.length < PAGE_SIZE && processedInPage === objects.length;
    hasMore = !isEndOfData;
    if (syncState?.id) await supabase.from('li_sync_state').update({ last_offset: isEndOfData ? 0 : offset, updated_at: new Date().toISOString() }).eq('id', syncState.id);
  }

  log.info(`[LI-SYNC] Orders batch complete: ${synced} synced (offset ${startOffset} -> ${offset})`);
  return synced;
}

async function upsertOrderFromData(
  supabase: ServiceClient, order: Record<string, unknown>, integrationId: string, tenantId: string
) {
  let customerId: string | null = null;
  const clienteRef = order.cliente;
  let clienteNome: string | null = null, clienteEmail: string | null = null;
  let clienteTelefone: string | null = null, clienteDoc: string | null = null;

  if (clienteRef) {
    if (typeof clienteRef === 'object' && clienteRef !== null) {
      clienteNome = (clienteRef as Record<string, unknown>).nome as string || null;
      clienteEmail = (clienteRef as Record<string, unknown>).email as string || null;
      clienteTelefone = ((clienteRef as Record<string, unknown>).telefone_celular || (clienteRef as Record<string, unknown>).telefone_principal) as string || null;
      clienteDoc = ((clienteRef as Record<string, unknown>).cpf || (clienteRef as Record<string, unknown>).cnpj) as string || null;
      const clienteLiId = (clienteRef as Record<string, unknown>).id;
      if (clienteLiId) {
        const { data: existing } = await supabase.from('li_customers').select('id').eq('integration_id', integrationId).eq('loja_integrada_customer_id', clienteLiId).maybeSingle();
        customerId = existing?.id || null;
      }
    } else if (typeof clienteRef === 'string') {
      const clienteMatch = clienteRef.match(/\/cliente\/(\d+)/);
      const clienteLiId = clienteMatch ? parseInt(clienteMatch[1]) : null;
      if (clienteLiId) {
        const { data: existing } = await supabase.from('li_customers').select('id, name, raw_json').eq('integration_id', integrationId).eq('loja_integrada_customer_id', clienteLiId).maybeSingle();
        customerId = existing?.id || null;
        if (existing) {
          clienteNome = existing.name || null;
          const cRaw = existing.raw_json as Record<string, unknown> | null;
          if (cRaw) { clienteEmail = cRaw.email as string || null; clienteTelefone = (cRaw.telefone_celular || cRaw.telefone_principal) as string || null; clienteDoc = (cRaw.cpf || cRaw.cnpj) as string || null; }
        }
      }
    }
  }

  const paymentJson: Record<string, unknown> = {};
  if (Array.isArray(order.pagamentos) && order.pagamentos.length > 0) {
    const p = order.pagamentos[0];
    const formaPag = typeof p.forma_pagamento === 'object' ? p.forma_pagamento : null;
    paymentJson.method = formaPag?.nome || p.forma_pagamento || p.nome || null;
    paymentJson.gateway = p.gateway || null; paymentJson.installments = p.parcelamento?.numero_parcelas || p.parcelas || 1;
    paymentJson.transaction_id = p.transacao_id || null; paymentJson.brand = p.bandeira || null;
    paymentJson.type = formaPag?.codigo || p.tipo || null; paymentJson.valor = p.valor || null;
    paymentJson.data_pagamento = p.data_confirmacao || p.data || null; paymentJson.all_payments = order.pagamentos;
  }

  const shippingJson: Record<string, unknown> = {};
  if (Array.isArray(order.envios) && order.envios.length > 0) {
    const envio = order.envios[0];
    const formaEnvio = typeof envio.forma_envio === 'object' ? envio.forma_envio : null;
    shippingJson.method = formaEnvio?.nome || envio.forma_envio || null; shippingJson.tracking_code = envio.objeto || null;
    shippingJson.tracking_url = envio.url_rastreio || null; shippingJson.data_envio = envio.data_envio || envio.data || null; shippingJson.all_envios = order.envios;
  }
  if (order.endereco_entrega) {
    if (typeof order.endereco_entrega === 'object') { shippingJson.address = order.endereco_entrega; shippingJson.nome_destinatario = (order.endereco_entrega as Record<string, unknown>).nome || null; shippingJson.telefone_destinatario = (order.endereco_entrega as Record<string, unknown>).telefone || null; }
    else { shippingJson.address = order.endereco_entrega; }
  }
  shippingJson.peso_real = order.peso_real ? parseFloat(order.peso_real as string) : null;

  const itemsJson = (order.itens as Record<string, unknown>[] || []).map((item) => {
    let productId: number | null = null, productName = item.nome || 'Item', sku = item.sku || null, imageUrl = null, variacao = null;
    if (typeof item.produto === 'string') { const pm = (item.produto as string).match(/\/produto\/(\d+)/); productId = pm ? parseInt(pm[1]) : null; }
    else if (typeof item.produto === 'object' && item.produto) { const p = item.produto as Record<string, unknown>; productId = p.id as number || null; productName = p.nome || productName; sku = p.sku || sku; imageUrl = (p.imagem_principal as Record<string, unknown>)?.grande || (p.imagem_principal as Record<string, unknown>)?.media || null; }
    if (item.variacao) { variacao = typeof item.variacao === 'object' ? (item.variacao as Record<string, unknown>).nome : item.variacao; }
    return { product_id: productId, sku, name: productName, qty: parseInt(item.quantidade as string) || 1, price: parseFloat((item.preco_venda || item.preco_cheio) as string) || 0, preco_custo: parseFloat(item.preco_custo as string) || null, preco_promocional: parseFloat(item.preco_promocional as string) || null, peso: parseFloat(item.peso as string) || null, imagem_url: imageUrl, variacao };
  });

  let statusId: number | null = null, statusName: string | null = null;
  if (order.situacao) {
    if (typeof order.situacao === 'object') { statusId = (order.situacao as Record<string, unknown>).id as number || null; statusName = (order.situacao as Record<string, unknown>).nome as string || null; }
    else if (typeof order.situacao === 'string') { const sitMatch = (order.situacao as string).match(/\/situacao\/pedido\/(\d+)/); if (sitMatch) statusId = parseInt(sitMatch[1]); }
  }

  const orderNumber = String(order.numero || order.id);
  const { data: orderRow, error: orderError } = await supabase.from('li_orders').upsert({
    integration_id: integrationId, tenant_id: tenantId, loja_integrada_order_id: order.id, order_number: orderNumber,
    status_id: statusId, status_name: statusName, customer_id: customerId,
    totals_json: { subtotal: parseFloat(order.valor_subtotal as string) || 0, total: parseFloat(order.valor_total as string) || 0, shipping: parseFloat(order.valor_envio as string) || 0, discount: parseFloat(order.valor_desconto as string) || 0 },
    shipping_json: shippingJson, payment_json: paymentJson, items_json: itemsJson,
    created_at_remote: order.data_criacao || null, updated_at_remote: order.data_modificacao || null,
    raw_json: { ...order, cliente_nome: clienteNome, cliente_email: clienteEmail, cliente_telefone: clienteTelefone, cliente_cpf_cnpj: clienteDoc, cupom_desconto: order.cupom_desconto || null, observacoes: order.observacoes || null, numero_nota_fiscal: order.numero_nota_fiscal || null, data_expiracao: order.data_expiracao || null },
    updated_at_local: new Date().toISOString(),
  }, { onConflict: 'integration_id,loja_integrada_order_id' }).select('id').single();

  if (orderError) { log.error(`[LI-SYNC] Order upsert error for ${orderNumber}:`, orderError.message); return; }

  if (orderRow?.id && itemsJson.length > 0) {
    await supabase.from('li_order_items').delete().eq('order_id', orderRow.id);
    await supabase.from('li_order_items').insert(itemsJson.map((item) => ({
      order_id: orderRow.id, tenant_id: tenantId, loja_integrada_product_id: item.product_id,
      sku: item.sku, name: item.name, qty: item.qty, price: item.price, raw_json: item,
    })));
  }
}
