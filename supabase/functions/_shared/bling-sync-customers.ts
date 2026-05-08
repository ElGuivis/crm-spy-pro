/**
 * Bling customers sync logic.
 * Extracted from bling-sync/index.ts.
 */

import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
import {
  DETAIL_FETCH_DELAY,
  delay, fetchBlingDetail,
  parseBrazilianDate, isJobCancelled, updateJobProgress,
} from "./bling-sync-helpers.ts";

const log = createLogger("bling-sync-customers", "shared");

/** Sync customers by fetching details for each unique client from synced orders */
export async function syncCustomersFromOrders(
  supabase: ServiceClient,
  accessToken: string,
  integrationId: string,
  tenantId: string,
  jobId: string
): Promise<number> {
  let totalSynced = 0;

  try {
    const { data: orderClients, error: clientsError } = await supabase
      .from('bling_orders')
      .select('cliente_id')
      .eq('integration_id', integrationId)
      .not('cliente_id', 'is', null);

    if (clientsError) {
      log.error('[bling-sync] Error fetching client IDs from orders:', clientsError);
      throw clientsError;
    }

    if (!orderClients || orderClients.length === 0) {
      log.info('[bling-sync] No orders with clients found');
      return 0;
    }

    const clientIdSet = new Set<number>(orderClients.map((o: Record<string, unknown>) => o.cliente_id as number));
    const uniqueClientIds = Array.from(clientIdSet);
    log.info(`[bling-sync] Found ${uniqueClientIds.length} unique clients from orders`);

    await updateJobProgress(supabase, jobId, { total_count: uniqueClientIds.length });

    for (let i = 0; i < uniqueClientIds.length; i++) {
      const clienteId = uniqueClientIds[i];

      if (await isJobCancelled(supabase, jobId)) {
        log.info('[bling-sync] Job cancelled, stopping customers sync');
        throw new Error('CANCELLED');
      }

      try {
        await updateJobProgress(supabase, jobId, { processed_count: i + 1 });

        const customerDetails = await fetchBlingDetail(accessToken, `/contatos/${clienteId}`, `contact ${clienteId}`);
        await delay(DETAIL_FETCH_DELAY);

        if (!customerDetails) {
          log.info(`[bling-sync] Could not fetch details for client ${clienteId}`);
          continue;
        }

        const customer = customerDetails;
        const dadosAdicionais = (customer.dadosAdicionais as Record<string, unknown>) || {};

        const customerData = {
          bling_id: customer.id,
          nome: (customer.nome as string) || 'Sem nome',
          fantasia: customer.fantasia,
          tipo_pessoa: customer.tipo,
          cpf_cnpj: customer.numeroDocumento,
          ie: customer.ie,
          email: customer.email,
          telefone: customer.telefone,
          celular: customer.celular,
          endereco: customer.endereco || null,
          situacao: customer.situacao,
          data_inclusao: customer.dataInclusao ? new Date(customer.dataInclusao as string).toISOString() : null,
          data_nascimento: parseBrazilianDate(dadosAdicionais.dataNascimento as string | undefined),
          sexo: (dadosAdicionais.sexo as string) || null,
          naturalidade: (dadosAdicionais.naturalidade as string) || null,
          rg: customer.rg || null,
          orgao_emissor: customer.orgaoEmissor || null,
          raw_data: customer,
          tenant_id: tenantId,
          integration_id: integrationId,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('bling_customers')
          .upsert(customerData, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false });

        if (error) {
          log.error(`[bling-sync] Error upserting customer ${clienteId}:`, error);
        } else {
          totalSynced++;
          log.info(`[bling-sync] ✓ Synced customer: ${customer.nome} (bling_id: ${clienteId})`);
        }

        await updateJobProgress(supabase, jobId, { saved_count: totalSynced });
      } catch (customerErr: unknown) {
        const errMsg = (customerErr as Error)?.message;
        if (errMsg === 'RATE_LIMITED') {
          log.info('[bling-sync] Rate limited on customer details, waiting 2 seconds...');
          await delay(2000);
          i--; // Retry
        } else if (errMsg === 'CANCELLED') {
          throw customerErr;
        } else {
          log.error(`[bling-sync] Error processing customer ${clienteId}:`, customerErr);
        }
      }
    }

    return totalSynced;
  } catch (err: unknown) {
    const errMsg = (err as Error)?.message;
    if (errMsg === 'CANCELLED') throw err;
    log.error('[bling-sync] Error in syncCustomersFromOrders:', err);
    throw err;
  }
}
