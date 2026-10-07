import { fetchAllRows, formatPhoneNumber, type InactiveCustomer } from "./helpers.ts";

/**
 * Clientes cujo último pedido (depois da ativação da regra) é mais antigo que o corte.
 * Loja Integrada: dados do cliente vêm de li_customers, com raw_json do pedido como reserva.
 */
export async function findInactiveCustomers(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storeType: string,
  integrationId: string,
  activatedAt: string,
  cutoffDate: Date,
  now: Date,
): Promise<InactiveCustomer[]> {
  const inactiveCustomers: InactiveCustomer[] = [];

  if (storeType === 'loja_integrada') {
    // LI orders don't have customer_name/phone/email columns directly.
    // Customer data is inside raw_json->'cliente', or we join with li_customers.
    // Strategy: fetch orders with raw_json->cliente fields via li_customers join by customer_id.
    const orders = await fetchAllRows(
      supabase
        .from('li_orders')
        .select('customer_id, created_at_remote, raw_json')
        .eq('integration_id', integrationId)
        .gte('created_at_remote', activatedAt)
        .order('created_at_remote', { ascending: false })
    );

    if (orders.length > 0) {
      // Extract unique customer_ids to batch-fetch customer details
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];

      // Fetch customer details from li_customers
      const customerMap = new Map<string, { name: string; phone: string | null; email: string | null }>();

      if (customerIds.length > 0) {
        // Fetch in batches of 500 to avoid query size limits
        for (let i = 0; i < customerIds.length; i += 500) {
          const batch = customerIds.slice(i, i + 500);
          const { data: customers } = await supabase
            .from('li_customers')
            .select('loja_integrada_id, name, phone, email')
            .eq('integration_id', integrationId)
            .in('loja_integrada_id', batch);

          if (customers) {
            for (const c of customers) {
              customerMap.set(String(c.loja_integrada_id), {
                name: c.name || 'Cliente',
                phone: c.phone || null,
                email: c.email || null,
              });
            }
          }
        }
      }

      // Group orders by customer, tracking last order date
      const lastOrderMap = new Map<string, { name: string; phone: string | null; email: string | null; lastOrder: string }>();

      for (const o of orders) {
        // Try to get customer info from li_customers first, fallback to raw_json
        let custInfo = o.customer_id ? customerMap.get(String(o.customer_id)) : null;

        if (!custInfo && o.raw_json) {
          const rawJson = typeof o.raw_json === 'string' ? JSON.parse(o.raw_json) : o.raw_json;
          const cliente = rawJson?.cliente;
          if (cliente) {
            custInfo = {
              name: cliente.nome || 'Cliente',
              phone: cliente.telefone_celular || cliente.telefone_principal || null,
              email: cliente.email || null,
            };
          }
        }

        if (!custInfo) continue;

        const phone = custInfo.phone ? formatPhoneNumber(custInfo.phone) : null;
        const key = phone || custInfo.email || '';
        if (!key) continue;

        if (!lastOrderMap.has(key)) {
          lastOrderMap.set(key, {
            name: custInfo.name,
            phone: custInfo.phone,
            email: custInfo.email,
            lastOrder: o.created_at_remote,
          });
        }
        // Already ordered desc, so first occurrence is the latest
      }

      // Filter inactive ones
      for (const [, cust] of lastOrderMap) {
        const lastOrderDate = new Date(cust.lastOrder);
        if (lastOrderDate < cutoffDate) {
          const diffMs = now.getTime() - lastOrderDate.getTime();
          const daysInactive = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          inactiveCustomers.push({
            name: cust.name,
            phone: cust.phone,
            email: cust.email,
            lastOrderDate: cust.lastOrder,
            daysInactive,
            source: 'loja_integrada',
          });
        }
      }
    }
  } else if (storeType === 'bling') {
    const orders = await fetchAllRows(
      supabase
        .from('bling_orders')
        .select('cliente_nome, cliente_telefone, cliente_email, data_criacao')
        .eq('integration_id', integrationId)
        .gte('data_criacao', activatedAt)
        .order('data_criacao', { ascending: false })
    );

    if (orders.length > 0) {
      const customerMap = new Map<string, { name: string; phone: string | null; email: string | null; lastOrder: string }>();

      for (const o of orders) {
        const phone = o.cliente_telefone ? formatPhoneNumber(o.cliente_telefone) : null;
        const key = phone || o.cliente_email || '';
        if (!key) continue;

        if (!customerMap.has(key)) {
          customerMap.set(key, {
            name: o.cliente_nome || 'Cliente',
            phone: o.cliente_telefone,
            email: o.cliente_email,
            lastOrder: o.data_criacao,
          });
        }
      }

      for (const [, cust] of customerMap) {
        const lastOrderDate = new Date(cust.lastOrder);
        if (lastOrderDate < cutoffDate) {
          const diffMs = now.getTime() - lastOrderDate.getTime();
          const daysInactive = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          inactiveCustomers.push({
            name: cust.name,
            phone: cust.phone,
            email: cust.email,
            lastOrderDate: cust.lastOrder,
            daysInactive,
            source: 'bling',
          });
        }
      }
    }
  }

  return inactiveCustomers;
}
