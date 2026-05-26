import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/correlation.ts";
import { LI_API_BASE, PAGE_SIZE, rateLimitedFetch, getOrCreateSyncState } from "./fetch-helpers.ts";

type ServiceClient = ReturnType<typeof createClient>;
const log = createLogger("li-sync", "bg");

export async function syncAllProducts(
  supabase: ServiceClient, integrationId: string, tenantId: string, authHeader: string, deadline: number
): Promise<number> {
  const syncState = await getOrCreateSyncState(supabase, integrationId, tenantId, 'products');
  let synced = 0;
  let offset = syncState?.last_offset || 0;
  let hasMore = true;

  log.info(`[LI-SYNC] Products: resuming from offset=${offset}`);

  while (hasMore && Date.now() < deadline) {
    const res = await rateLimitedFetch(`${LI_API_BASE}/produto?limit=${PAGE_SIZE}&offset=${offset}`, authHeader);
    if (!res.ok) break;
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
        const detailRes = await rateLimitedFetch(`${LI_API_BASE}/produto/${obj.id}`, authHeader);
        if (!detailRes.ok) continue;
        const p = await detailRes.json();
        const { error: upErr } = await supabase.from('li_products').upsert({
          integration_id: integrationId, tenant_id: tenantId,
          loja_integrada_product_id: p.id, sku: p.sku || null, name: p.nome || 'Sem nome',
          price: parseFloat(p.preco_cheio) || null, promotional_price: parseFloat(p.preco_promocional) || null,
          cost_price: parseFloat(p.preco_custo) || null, stock: p.estoque_gerenciado ? (parseInt(p.estoque) || 0) : null,
          stock_managed: p.estoque_gerenciado || false, active: p.ativo !== false,
          variations_json: p.variacoes || null, image_url: p.imagem_principal?.grande || p.imagem_principal?.media || null,
          raw_json: p, updated_at_remote: p.data_modificacao || null, updated_at_local: new Date().toISOString(),
        }, { onConflict: 'integration_id,loja_integrada_product_id' });
        if (upErr) { log.error(`[LI-SYNC] Product ${p.id} upsert error: ${upErr.message} | code=${upErr.code} | details=${upErr.details}`); }
        else { synced++; }
        processedInPage++;
      } catch (e: unknown) { log.error(`[LI-SYNC] Product ${obj.id} error:`, (e as Error).message); processedInPage++; }
    }

    offset += processedInPage;
    const isEndOfData = objects.length < PAGE_SIZE && processedInPage === objects.length;
    hasMore = !isEndOfData;
    if (syncState?.id) await supabase.from('li_sync_state').update({ last_offset: isEndOfData ? 0 : offset, updated_at: new Date().toISOString() }).eq('id', syncState.id);
  }
  return synced;
}
