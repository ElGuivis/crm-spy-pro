import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";
import { LI_API_BASE, PAGE_SIZE, rateLimitedFetch, getOrCreateSyncState } from "./fetch-helpers.ts";

type ServiceClient = ReturnType<typeof createClient>;
const log = createLogger("li-sync", "bg");

export async function syncAllCustomers(
  supabase: ServiceClient, integrationId: string, tenantId: string, authHeader: string, deadline: number
): Promise<number> {
  const syncState = await getOrCreateSyncState(supabase, integrationId, tenantId, 'customers');
  let synced = 0;
  let offset = syncState?.last_offset || 0;
  let hasMore = true;

  log.info(`[LI-SYNC] Customers: resuming from offset=${offset}`);

  while (hasMore && Date.now() < deadline) {
    const res = await rateLimitedFetch(`${LI_API_BASE}/cliente?limit=${PAGE_SIZE}&offset=${offset}`, authHeader);
    if (!res.ok) { log.error(`[LI-SYNC] Customers list fetch failed: status=${res.status} offset=${offset}`); break; }
    const data = await res.json();
    const objects = data.objects || [];
    const totalCount = data.meta?.total_count;
    if (typeof totalCount === 'number' && syncState?.id) {
      await supabase.from('li_sync_state').update({ total_count: totalCount }).eq('id', syncState.id);
    }

    if (objects.length === 0) {
      offset = 0; hasMore = false;
      if (syncState?.id) await supabase.from('li_sync_state').update({ last_offset: 0, updated_at: new Date().toISOString() }).eq('id', syncState.id);
      break;
    }

    let processedInPage = 0;
    for (const obj of objects) {
      if (Date.now() >= deadline) break;
      try {
        const detailRes = await rateLimitedFetch(`${LI_API_BASE}/cliente/${obj.id}`, authHeader);
        if (!detailRes.ok) continue;
        const c = await detailRes.json();
        const enderecos = Array.isArray(c.enderecos) ? c.enderecos : [];
        const principalAddr = enderecos.find((e: Record<string, unknown>) => e.principal) || enderecos[0] || null;
        const { error: upErr } = await supabase.from('li_customers').upsert({
          integration_id: integrationId, tenant_id: tenantId,
          loja_integrada_customer_id: c.id, name: c.nome || 'Sem nome', email: c.email,
          phone: c.telefone_celular || c.telefone_principal, doc: c.cpf || c.cnpj || null,
          address_json: principalAddr, raw_json: c,
          updated_at_remote: c.data_modificacao || null, updated_at_local: new Date().toISOString(),
        }, { onConflict: 'integration_id,loja_integrada_customer_id' });
        if (upErr) { log.error(`[LI-SYNC] Customer ${c.id} upsert error: ${upErr.message} | code=${upErr.code} | details=${upErr.details}`); }
        else { synced++; }
        processedInPage++;
      } catch (e: unknown) { log.error(`[LI-SYNC] Customer ${obj.id} error:`, (e as Error).message); processedInPage++; }
    }

    offset += processedInPage;
    const isEndOfData = objects.length < PAGE_SIZE && processedInPage === objects.length;
    hasMore = !isEndOfData;
    if (syncState?.id) await supabase.from('li_sync_state').update({ last_offset: isEndOfData ? 0 : offset, updated_at: new Date().toISOString() }).eq('id', syncState.id);
  }
  return synced;
}
