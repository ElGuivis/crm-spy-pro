import { createLogger } from "../_shared/correlation.ts";
import type { ServiceClient } from "../_shared/supabase-types.ts";
import { BLING_API_BASE, RATE_LIMIT_DELAY, delay, safeParseDate } from "./job-helpers.ts";

type Log = ReturnType<typeof createLogger>;

export async function syncCustomersFromOrders(
  supabase: ServiceClient, accessToken: string, integrationId: string, tenantId: string, log: Log
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  try {
    const { data: orders } = await supabase.from('bling_orders').select('cliente_id').eq('integration_id', integrationId).not('cliente_id', 'is', null);
    if (!orders || orders.length === 0) { log.info('[BLING-JOB] No orders found for customer sync'); return { success: true, synced: 0, errors: [] }; }

    const uniqueClientIds = [...new Set(orders.map((o: Record<string, unknown>) => o.cliente_id).filter(Boolean))] as number[];
    log.info(`[BLING-JOB] Found ${uniqueClientIds.length} unique customer IDs in orders`);

    const { data: existingCustomers } = await supabase.from('bling_customers').select('bling_id').eq('integration_id', integrationId).in('bling_id', uniqueClientIds);
    const existingIds = new Set((existingCustomers || []).map((c: Record<string, unknown>) => c.bling_id));
    const newClientIds = uniqueClientIds.filter(id => !existingIds.has(id));
    log.info(`[BLING-JOB] ${newClientIds.length} new customers to sync (${existingIds.size} already exist)`);
    if (newClientIds.length === 0) return { success: true, synced: 0, errors: [] };

    for (const clientId of newClientIds.slice(0, 20)) {
      try {
        const response = await fetch(`${BLING_API_BASE}/contatos/${clientId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
        });
        await delay(RATE_LIMIT_DELAY);
        if (!response.ok) { if (response.status === 404) { log.info(`[BLING-JOB] Customer ${clientId} not found, skipping`); continue; } errors.push(`Customer ${clientId}: API error ${response.status}`); continue; }

        const customer = (await response.json()).data;
        if (!customer) { errors.push(`Customer ${clientId}: No data returned`); continue; }

        const { error } = await supabase.from('bling_customers').upsert({
          bling_id: customer.id, nome: customer.nome || 'Cliente sem nome', fantasia: customer.fantasia,
          tipo_pessoa: customer.tipo, cpf_cnpj: customer.numeroDocumento, ie: customer.ie, rg: customer.rg,
          orgao_emissor: customer.orgaoEmissor, email: customer.email, telefone: customer.telefone, celular: customer.celular,
          endereco: customer.endereco || null, data_nascimento: safeParseDate(customer.dataNascimento), sexo: customer.sexo,
          naturalidade: customer.naturalidade, situacao: customer.situacao, data_inclusao: safeParseDate(customer.dataInclusao),
          raw_data: customer, tenant_id: tenantId, integration_id: integrationId, synced_at: new Date().toISOString(),
        }, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false });

        if (error) { errors.push(`Customer ${customer.nome}: ${error.message}`); }
        else { synced++; log.info(`[BLING-JOB] ✓ Synced customer: ${customer.nome} (bling_id: ${customer.id})`); }
      } catch (e) { errors.push(`Customer ${clientId}: ${e instanceof Error ? e.message : 'Unknown error'}`); }
    }
    return { success: true, synced, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Customer sync error:', msg);
    return { success: false, synced: 0, errors: [msg] };
  }
}
