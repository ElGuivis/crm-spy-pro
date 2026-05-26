import { createLogger } from "../_shared/correlation.ts";
import type { ServiceClient } from "../_shared/supabase-types.ts";
import { RATE_LIMIT_DELAY, delay, fetchProductDetails } from "./job-helpers.ts";

type Log = ReturnType<typeof createLogger>;

export async function updateProductStock(
  supabase: ServiceClient, accessToken: string, integrationId: string, _tenantId: string, log: Log
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: staleProducts, error: fetchError } = await supabase
      .from('bling_products').select('id, bling_id, nome').eq('integration_id', integrationId)
      .lt('synced_at', fifteenMinutesAgo).order('synced_at', { ascending: true }).limit(100);

    if (fetchError) throw new Error(`Failed to fetch stale products: ${fetchError.message}`);
    if (!staleProducts || staleProducts.length === 0) { log.info('[BLING-JOB] No stale products to update stock'); return { success: true, updated: 0, errors: [] }; }

    log.info(`[BLING-JOB] Updating stock for ${staleProducts.length} products`);

    for (const product of staleProducts) {
      try {
        const details = await fetchProductDetails(accessToken, product.bling_id, log);
        await delay(RATE_LIMIT_DELAY);
        if (!details) { errors.push(`Product ${product.nome}: Failed to fetch details`); continue; }

        const updateData: Record<string, unknown> = {
          estoque_atual: (details.estoque as Record<string, unknown>)?.saldoVirtualTotal || 0,
          preco: details.preco, preco_custo: details.precoCusto, situacao: details.situacao, synced_at: new Date().toISOString(),
        };
        if ((details.estoque as Record<string, unknown>)?.depositos) updateData.estoque_depositos = (details.estoque as Record<string, unknown>).depositos;

        const { error: updateError } = await supabase.from('bling_products').update(updateData).eq('id', product.id);
        if (updateError) { errors.push(`Product ${product.nome}: ${updateError.message}`); }
        else { updated++; log.info(`[BLING-JOB] ✓ Updated stock for: ${product.nome} (stock: ${updateData.estoque_atual})`); }
      } catch (e) { errors.push(`Product ${product.nome}: ${e instanceof Error ? e.message : 'Unknown error'}`); }
    }
    return { success: true, updated, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Stock update error:', msg);
    return { success: false, updated: 0, errors: [msg] };
  }
}
