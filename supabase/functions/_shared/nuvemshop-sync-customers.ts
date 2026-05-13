/**
 * Nuvemshop customers sync — paginated, resumable.
 * Endpoint: GET /customers?page=N&per_page=200
 */

import {
  ServiceClient,
  nuvemshopApiBase,
  nuvemshopFetch,
  hasNextPage,
  getOrCreateNuvemshopSyncState,
  updateNuvemshopSyncState,
  NUVEMSHOP_PAGE_SIZE,
} from "./nuvemshop-helpers.ts";
import { createLogger } from "./correlation.ts";

const log = createLogger("nuvemshop-sync-customers", "shared");

interface NuvemshopCustomer {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  identification?: string;
  default_address?: Record<string, unknown>;
  addresses?: Record<string, unknown>[];
  total_spent?: string;
  total_spent_currency?: string;
  last_order_id?: number | null;
  updated_at?: string;
  created_at?: string;
}

export async function syncNuvemshopCustomers(
  supabase: ServiceClient,
  integrationId: string,
  tenantId: string,
  storeId: number,
  accessToken: string,
  deadline: number,
): Promise<number> {
  const state = await getOrCreateNuvemshopSyncState(supabase, integrationId, tenantId, "customers");
  let synced = 0;
  let page = (state?.last_page || 0) + 1;
  let keepGoing = true;

  log.info(`[nuvemshop-sync] Customers: resuming from page=${page}`);

  while (keepGoing && Date.now() < deadline) {
    const url = `${nuvemshopApiBase(storeId)}/customers?page=${page}&per_page=${NUVEMSHOP_PAGE_SIZE}`;
    const res = await nuvemshopFetch(url, accessToken);
    if (!res.ok) {
      log.error(`[nuvemshop-sync] Customers fetch failed status=${res.status} page=${page}`);
      break;
    }
    const customers: NuvemshopCustomer[] = await res.json();
    if (!customers.length) {
      keepGoing = false;
      if (state?.id) await updateNuvemshopSyncState(supabase, state.id, { last_page: 0 });
      break;
    }

    const rows = customers.map((c) => ({
      integration_id: integrationId,
      tenant_id: tenantId,
      nuvemshop_customer_id: c.id,
      name: c.name || "Sem nome",
      email: c.email || null,
      phone: c.phone || null,
      doc: c.identification || null,
      address_json: c.default_address || (c.addresses && c.addresses[0]) || null,
      total_spent: c.total_spent ? parseFloat(c.total_spent) : null,
      total_orders: null,
      raw_json: c as unknown as Record<string, unknown>,
      updated_at_remote: c.updated_at || null,
      updated_at_local: new Date().toISOString(),
    }));

    const { error: upErr } = await supabase.from("nuvemshop_customers").upsert(rows, {
      onConflict: "integration_id,nuvemshop_customer_id",
    });
    if (upErr) {
      log.error(`[nuvemshop-sync] Customers upsert error page=${page}: ${upErr.message}`);
      break;
    }
    synced += rows.length;

    if (state?.id) {
      await updateNuvemshopSyncState(supabase, state.id, {
        last_page: page,
        records_synced: (state.records_synced || 0) + synced,
      });
    }

    keepGoing = hasNextPage(res);
    page += 1;
  }

  if (!keepGoing && state?.id) {
    await updateNuvemshopSyncState(supabase, state.id, {
      last_page: 0,
      last_synced_at: new Date().toISOString(),
    });
  }

  log.info(`[nuvemshop-sync] Customers batch done: ${synced} (more=${keepGoing})`);
  return synced;
}
