/**
 * Loja Integrada — processOrder: upsert one order with customer, items, cashback, notifications.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
import { processOrderNotificationsInJob } from "./li-sync-carts.ts";

const log = createLogger("li-sync-orders", "shared");
type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export async function processOrder(
  supabase: ServiceClient,
  order: Record<string, unknown>,
  tenantId: string | null,
  supabaseUrl: string,
  supabaseKey: string,
  authHeader: string,
  integrationId?: string | null
) {
  let clienteId = null;
  let clienteNome = null;
  let clienteEmail = null;
  let clienteTelefone = null;
  let clienteCpf = null;

  if (order.cliente) {
    log.info(`[DEBUG] Order ${order.numero} cliente field:`, JSON.stringify(order.cliente));

    if (typeof order.cliente === "object" && order.cliente !== null) {
      clienteId = order.cliente.id ? parseInt(order.cliente.id) : null;
      clienteNome = order.cliente.nome || null;
      clienteEmail = order.cliente.email || null;
      clienteTelefone = order.cliente.telefone_celular || order.cliente.telefone_principal || null;
      clienteCpf = order.cliente.cpf || null;

      log.info(`[DEBUG] Cliente from object: id=${clienteId}, nome=${clienteNome}`);

      if (clienteId) {
        await supabase.from("li_customers").upsert({
          loja_integrada_customer_id: clienteId,
          integration_id: integrationId,
          tenant_id: tenantId,
          name: clienteNome || "Sem nome",
          email: clienteEmail || null,
          phone: order.cliente.telefone_celular || order.cliente.telefone_principal || null,
          doc: clienteCpf || order.cliente.cnpj || null,
          raw_json: order.cliente,
          updated_at_local: new Date().toISOString(),
        }, { onConflict: "integration_id,loja_integrada_customer_id" });
      }
    } else if (typeof order.cliente === "string") {
      const clienteMatch = order.cliente.match(/\/cliente\/(\d+)/);
      if (clienteMatch) {
        clienteId = parseInt(clienteMatch[1]);
        try {
          const clienteRes = await fetch(`${LI_API_BASE}/cliente/${clienteId}`, {
            headers: { "Authorization": authHeader },
          });
          if (clienteRes.ok) {
            const cliente = await clienteRes.json();
            clienteNome = cliente.nome;
            clienteEmail = cliente.email;
            clienteTelefone = cliente.telefone_celular || cliente.telefone_principal;
            clienteCpf = cliente.cpf || null;
            log.info(`[DEBUG] Cliente from API: id=${clienteId}, nome=${clienteNome}`);
            await supabase.from("li_customers").upsert({
              loja_integrada_customer_id: cliente.id,
              integration_id: integrationId,
              tenant_id: tenantId,
              name: cliente.nome || "Sem nome",
              email: cliente.email || null,
              phone: cliente.telefone_celular || cliente.telefone_principal || null,
              doc: cliente.cpf || cliente.cnpj || null,
              raw_json: cliente,
              updated_at_local: new Date().toISOString(),
            }, { onConflict: "integration_id,loja_integrada_customer_id" });
          }
        } catch (e) {
          log.info(`[DEBUG] Could not fetch customer ${clienteId}:`, e);
        }
      }
    } else if (typeof order.cliente === "number") {
      clienteId = order.cliente;
      try {
        const clienteRes = await fetch(`${LI_API_BASE}/cliente/${clienteId}`, {
          headers: { "Authorization": authHeader },
        });
        if (clienteRes.ok) {
          const cliente = await clienteRes.json();
          clienteNome = cliente.nome;
          clienteEmail = cliente.email;
          clienteTelefone = cliente.telefone_celular || cliente.telefone_principal;
          clienteCpf = cliente.cpf || null;
          log.info(`[DEBUG] Cliente from API (numeric id): id=${clienteId}, nome=${clienteNome}`);
          await supabase.from("li_customers").upsert({
            loja_integrada_customer_id: cliente.id,
            integration_id: integrationId,
            tenant_id: tenantId,
            name: cliente.nome || "Sem nome",
            email: cliente.email || null,
            phone: cliente.telefone_celular || cliente.telefone_principal || null,
            doc: cliente.cpf || cliente.cnpj || null,
            raw_json: cliente,
            updated_at_local: new Date().toISOString(),
          }, { onConflict: "integration_id,loja_integrada_customer_id" });
        }
      } catch (e) {
        log.info(`[DEBUG] Could not fetch customer ${clienteId}:`, e);
      }
    }
  } else {
    log.info(`[DEBUG] Order ${order.numero} has no cliente field`);
  }

  let formaPagamento = null;
  let pagamentoTipo = null;
  let pagamentoParcelas = 1;
  let pagamentoBandeira = null;
  let pagamentoCodigo = null;

  if (order.pagamentos && Array.isArray(order.pagamentos) && order.pagamentos.length > 0) {
    const pagamento = order.pagamentos[0];
    formaPagamento = pagamento.forma_pagamento?.nome || pagamento.nome || null;
    pagamentoTipo = pagamento.pagamento_tipo || null;
    pagamentoCodigo = pagamento.forma_pagamento?.codigo || null;
    pagamentoBandeira = pagamento.bandeira || null;
    if (pagamento.parcelamento && typeof pagamento.parcelamento === "object") {
      pagamentoParcelas = pagamento.parcelamento.numero_parcelas || pagamento.parcelamento.parcelas || 1;
    }
  }

  let formaEnvio = null;
  if (order.envios && Array.isArray(order.envios) && order.envios.length > 0) {
    formaEnvio = order.envios[0].forma_envio?.nome || null;
  }

  const rawJsonData = {
    ...order,
    cliente: typeof order.cliente === "object" ? order.cliente : {
      id: clienteId, nome: clienteNome, email: clienteEmail, telefone_celular: clienteTelefone, cpf: clienteCpf,
    },
  };

  const { data: orderData } = await supabase
    .from("li_orders")
    .upsert({
      loja_integrada_order_id: order.id,
      order_number: String(order.numero),
      tenant_id: tenantId,
      integration_id: integrationId,
      status_id: order.situacao?.id || null,
      status_name: order.situacao?.nome || null,
      customer_id: clienteId ? String(clienteId) : null,
      totals_json: {
        subtotal: order.valor_subtotal ? parseFloat(order.valor_subtotal) : null,
        discount: order.valor_desconto ? parseFloat(order.valor_desconto) : null,
        shipping: order.valor_envio ? parseFloat(order.valor_envio) : null,
        total: order.valor_total ? parseFloat(order.valor_total) : null,
      },
      payment_json: {
        forma_pagamento: formaPagamento, tipo: pagamentoTipo, parcelas: pagamentoParcelas,
        bandeira: pagamentoBandeira, codigo: pagamentoCodigo,
      },
      shipping_json: {
        forma_envio: formaEnvio,
        cep: order.endereco_entrega?.cep || null,
        endereco: order.endereco_entrega?.endereco || null,
        numero: order.endereco_entrega?.numero || null,
        bairro: order.endereco_entrega?.bairro || null,
        cidade: order.endereco_entrega?.cidade || null,
        estado: order.endereco_entrega?.estado || null,
      },
      items_json: order.itens || null,
      created_at_remote: order.data_criacao || null,
      updated_at_remote: order.data_modificacao || null,
      raw_json: rawJsonData,
      updated_at_local: new Date().toISOString(),
      last_status_check_at: new Date().toISOString(),
    }, { onConflict: "integration_id,loja_integrada_order_id" })
    .select()
    .single();

  if (order.itens && Array.isArray(order.itens) && orderData) {
    await supabase.from("li_order_items").delete().eq("order_id", orderData.id);
    const itemsData = order.itens.map((item: Record<string, unknown>) => {
      let productId = null;
      const productMatch = typeof item.produto === "string" ? item.produto.match?.(/\/produto\/(\d+)/) : null;
      if (productMatch) productId = parseInt(productMatch[1]);
      return {
        order_id: orderData.id, tenant_id: tenantId,
        loja_integrada_product_id: productId,
        name: item.nome || "Item", sku: item.sku || null,
        qty: parseInt(item.quantidade) || 1,
        price: parseFloat(item.preco_venda || item.preco_cheio) || 0,
        raw_json: item,
      };
    });
    if (itemsData.length > 0) await supabase.from("li_order_items").insert(itemsData);
  }

  const situacaoNome = order.situacao?.nome || "";

  const { data: cashbackConfig } = await supabase
    .from("cashback_configs")
    .select("trigger_statuses, is_active, id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  log.info(`[CASHBACK] Order #${order.numero} status: "${situacaoNome}", config: ${!!cashbackConfig}`);

  if (cashbackConfig?.is_active && cashbackConfig.trigger_statuses?.length > 0) {
    const shouldTrigger = (cashbackConfig.trigger_statuses as string[]).some(
      (s: string) => situacaoNome.toLowerCase() === s.toLowerCase(),
    );
    log.info(`[CASHBACK] Should trigger: ${shouldTrigger}`);
    if (shouldTrigger && order.valor_total) {
      const { data: existingCoupon } = await supabase
        .from("generated_coupons").select("id")
        .eq("order_id", String(order.numero)).eq("tenant_id", tenantId).maybeSingle();
      if (!existingCoupon) {
        log.info(`[CASHBACK] Triggering cashback for order #${order.numero}`);
        try {
          const cashbackRes = await fetch(`${supabaseUrl}/functions/v1/li-cashback`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({
              order_id: order.id, order_number: String(order.numero),
              customer_name: clienteNome || "Cliente", customer_email: clienteEmail || "",
              customer_phone: clienteTelefone || "", customer_cpf: clienteCpf || "",
              order_total: parseFloat(order.valor_total), tenant_id: tenantId,
            }),
          });
          const cashbackResult = await cashbackRes.json();
          log.info(`[CASHBACK] Result for order #${order.numero}:`, JSON.stringify(cashbackResult));
        } catch (e) {
          log.error(`[CASHBACK] Failed to trigger for order #${order.numero}:`, e);
        }
      } else {
        log.info(`[CASHBACK] Coupon already exists for order #${order.numero}`);
      }
    }
  }

  if (situacaoNome && tenantId && integrationId && orderData) {
    log.info(`[NEW-ORDER-NOTIFICATION] Checking notifications for new order #${order.numero}, status: "${situacaoNome}"`);
    await processOrderNotificationsInJob(
      supabase,
      order,
      {
        ...orderData,
        numero: order.numero,
        cliente_nome: order.cliente?.nome || "Cliente",
        cliente_telefone: order.cliente?.telefone_celular || order.cliente?.telefone_principal || "",
        cliente_email: order.cliente?.email || "",
        codigo_rastreio: "", url_rastreio: "",
        valor_total: order.valor_total ? parseFloat(order.valor_total) : 0,
        li_id: order.id,
      },
      situacaoNome, tenantId, integrationId,
    );
  }
}
