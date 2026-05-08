/**
 * Loja Integrada Customer Sync Functions
 * Extracted from li-job-processor/index.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("li-sync-customers", "shared");

type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export async function syncNewCustomers(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId?: string | null
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  const MAX_SYNC_PER_EXECUTION = 500; // Limit per execution to avoid timeout
  const BATCH_SIZE = 100; // API pagination size

  if (!tenantId || !integrationId) {
    return { success: false, synced: 0, errors: ['Missing tenant_id or integration_id'] };
  }

  try {
    // Get count from API for logging
    const countResponse = await fetch(`${LI_API_BASE}/cliente?limit=1`, {
      headers: { 'Authorization': authHeader }
    });

    if (!countResponse.ok) {
      throw new Error(`API error: ${countResponse.status}`);
    }

    const countData = await countResponse.json();
    const totalApiCustomers = countData.meta?.total_count || 0;

    // Get all existing loja_integrada_customer_ids from DB for this integration
    const { data: existingCustomers, error: fetchError } = await supabase
      .from('li_customers')
      .select('loja_integrada_customer_id')
      .eq('integration_id', integrationId);

    if (fetchError) {
      throw new Error(`DB fetch error: ${fetchError.message}`);
    }

    const existingLiIds = new Set((existingCustomers || []).map((c: Record<string, unknown>) => Number(c.loja_integrada_customer_id)));
    const dbCustomerCount = existingLiIds.size;
    
    log.info(`[CUSTOMERS] API: ${totalApiCustomers}, DB: ${dbCustomerCount}, Missing: ${totalApiCustomers - dbCustomerCount}`);

    // Iterate through API pages to find missing customers
    let offset = 0;
    let foundNewInBatch = true;
    let emptyBatchesInRow = 0;

    while (synced < MAX_SYNC_PER_EXECUTION && foundNewInBatch && emptyBatchesInRow < 3) {
      log.info(`[CUSTOMERS] Fetching batch at offset ${offset}...`);
      
      const response = await fetch(`${LI_API_BASE}/cliente?limit=${BATCH_SIZE}&offset=${offset}`, {
        headers: { 'Authorization': authHeader }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const customers = data.objects || [];

      if (customers.length === 0) {
        log.info(`[CUSTOMERS] No more customers from API at offset ${offset}`);
        break;
      }

      // Filter to only customers not in our database
      const newCustomers = customers.filter((c: Record<string, unknown>) => !existingLiIds.has(Number(c.id)));
      
      if (newCustomers.length === 0) {
        emptyBatchesInRow++;
        foundNewInBatch = emptyBatchesInRow < 3;
      } else {
        emptyBatchesInRow = 0;
        foundNewInBatch = true;
      }

      log.info(`[CUSTOMERS] Batch has ${customers.length} customers, ${newCustomers.length} are new`);

      // Fetch and save each new customer
      for (const customerItem of newCustomers) {
        if (synced >= MAX_SYNC_PER_EXECUTION) break;

        try {
          const customerRes = await fetch(`${LI_API_BASE}/cliente/${customerItem.id}`, {
            headers: { 'Authorization': authHeader }
          });

          if (!customerRes.ok) {
            errors.push(`Customer ${customerItem.id}: API ${customerRes.status}`);
            continue;
          }

          const customer = await customerRes.json();

          // Build address JSON
          const addressJson: Record<string, unknown> = {};
          if (customer.endereco) addressJson.main = customer.endereco;

          await supabase
            .from('li_customers')
            .upsert({
              tenant_id: tenantId,
              integration_id: integrationId,
              loja_integrada_customer_id: customer.id,
              name: customer.nome || 'Sem nome',
              email: customer.email || null,
              phone: customer.telefone_celular || customer.telefone_principal || null,
              doc: customer.cpf || customer.cnpj || null,
              address_json: Object.keys(addressJson).length > 0 ? addressJson : null,
              raw_json: customer,
              updated_at_remote: customer.data_modificacao || null,
              updated_at_local: new Date().toISOString(),
            }, { onConflict: 'integration_id,loja_integrada_customer_id' });

          synced++;
          existingLiIds.add(Number(customer.id)); // Track to avoid re-processing
          log.info(`[CUSTOMERS] ✓ Synced: ${customer.nome} (${customer.id})`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          errors.push(`Customer ${customerItem.id}: ${msg}`);
        }
      }

      offset += BATCH_SIZE;
    }

    log.info(`[CUSTOMERS] Sync complete: ${synced} new customers synced this execution`);
    return { success: true, synced, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[CUSTOMERS] Sync error:', msg);
    return { success: false, synced: 0, errors: [msg] };
  }
}

// Update existing customers with all latest data from API
export async function updateExistingCustomers(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId: string
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  const MAX_UPDATE_PER_EXECUTION = 100;

  if (!tenantId || !integrationId) {
    return { success: false, updated: 0, errors: ['Missing tenant_id or integration_id'] };
  }

  try {
    // Get customers that were synced more than 30 minutes ago
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: customersToUpdate, error: fetchError } = await supabase
      .from('li_customers')
      .select('id, loja_integrada_customer_id, name')
      .eq('integration_id', integrationId)
      .lt('updated_at_local', thirtyMinutesAgo)
      .order('updated_at_local', { ascending: true })
      .limit(MAX_UPDATE_PER_EXECUTION);

    if (fetchError) {
      throw new Error(`DB fetch error: ${fetchError.message}`);
    }

    if (!customersToUpdate || customersToUpdate.length === 0) {
      log.info('[CUSTOMER-UPDATE] No customers need updating');
      return { success: true, updated: 0, errors: [] };
    }

    log.info(`[CUSTOMER-UPDATE] Updating ${customersToUpdate.length} customers`);

    for (const customer of customersToUpdate) {
      try {
        const response = await fetch(`${LI_API_BASE}/cliente/${customer.loja_integrada_customer_id}`, {
          headers: { 'Authorization': authHeader }
        });

        if (!response.ok) {
          if (response.status === 404) {
            await supabase
              .from('li_customers')
              .update({ updated_at_local: new Date().toISOString() })
              .eq('id', customer.id);
            continue;
          }
          errors.push(`Customer ${customer.loja_integrada_customer_id}: API ${response.status}`);
          continue;
        }

        const apiCustomer = await response.json();

        const addressJson: Record<string, unknown> = {};
        if (apiCustomer.endereco) addressJson.main = apiCustomer.endereco;

        const updatePayload: Record<string, unknown> = {
          name: apiCustomer.nome || 'Sem nome',
          email: apiCustomer.email || null,
          phone: apiCustomer.telefone_celular || apiCustomer.telefone_principal || null,
          doc: apiCustomer.cpf || apiCustomer.cnpj || null,
          address_json: Object.keys(addressJson).length > 0 ? addressJson : null,
          raw_json: apiCustomer,
          updated_at_remote: apiCustomer.data_modificacao || null,
          updated_at_local: new Date().toISOString(),
        };

        await supabase
          .from('li_customers')
          .update(updatePayload)
          .eq('id', customer.id);

        updated++;
        log.info(`[CUSTOMER-UPDATE] ✓ Updated: ${apiCustomer.nome}`);

        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Customer ${customer.loja_integrada_customer_id}: ${msg}`);
      }
    }

    log.info(`[CUSTOMER-UPDATE] Complete: ${updated} customers updated`);
    return { success: true, updated, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[CUSTOMER-UPDATE] Error:', msg);
    return { success: false, updated: 0, errors: [msg] };
  }
}

// Update stock/info for existing products that haven't been updated recently
