/**
 * Bling products sync logic (resumable).
 * Extracted from bling-sync/index.ts.
 */

import type { ServiceClient } from "./supabase-types.ts";
import { fetchBlingData } from "./bling-sync-helpers.ts";
import { createLogger } from "./correlation.ts";
const log = createLogger("bling-sync-products", "shared");

const UPSERT_CHUNK_SIZE = 25; // stay well under PostgREST 8s statement_timeout at scale

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}


/** Sync products from Bling - first page processed inline, rest delegated to job processor */
export async function syncProducts(
  supabase: ServiceClient,
  accessToken: string,
  integrationId: string,
  tenantId: string,
  jobId: string
): Promise<number> {
  log.info('[bling-sync] Setting up resumable product sync...');

  const { data: firstPageProducts, hasMore: hasMorePages } = await fetchBlingData(
    accessToken, '/produtos', 1
  );

  if (firstPageProducts.length === 0) {
    log.info('[bling-sync] No products found');
    return 0;
  }

  const estimatedTotal = hasMorePages ? firstPageProducts.length * 15 : firstPageProducts.length;

  // Process first page immediately
  let synced = 0;
  const productsToUpsert = firstPageProducts.map((product: Record<string, unknown>) => {
    const estoque = product.estoque as Record<string, unknown> | undefined;
    return {
      bling_id: product.id,
      nome: (product.nome as string) || 'Sem nome',
      codigo: product.codigo,
      preco: product.preco,
      preco_custo: product.precoCusto,
      estoque_atual: estoque?.saldoVirtualTotal ?? estoque?.saldoFisicoTotal ?? product.estoqueAtual ?? 0,
      tipo: product.tipo,
      situacao: product.situacao,
      formato: product.formato,
      gtin: product.gtin,
      imagem_url: product.imagemURL || null,
      raw_data: product,
      tenant_id: tenantId,
      integration_id: integrationId,
      synced_at: new Date().toISOString(),
    };
  });

  let upsertError = null;
  for (const chunk of chunkArray(productsToUpsert, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from('bling_products')
      .upsert(chunk, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false });
    if (error) { upsertError = error; break; }
    synced += chunk.length;
  }
  if (upsertError) synced = 0;

  await supabase
    .from('bling_sync_jobs')
    .update({
      status: hasMorePages ? 'pending' : 'completed',
      total_count: estimatedTotal,
      current_page: 1,
      resume_page: 2,
      processed_count: synced,
      saved_count: synced,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: hasMorePages ? null : new Date().toISOString(),
    })
    .eq('id', jobId);

  log.info(`[bling-sync] First page done: ${synced} products. Job set to ${hasMorePages ? 'pending for resumption' : 'completed'}.`);

  // Trigger job processor for remaining pages
  if (hasMorePages) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const triggerProcessor = async () => {
      try {
        await fetch(`${supabaseUrl}/functions/v1/bling-products-job-processor`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId }),
        });
      } catch (err) {
        log.error('[bling-sync] Error triggering job processor:', err);
      }
    };

    const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<void>) => void } }).EdgeRuntime;
    if (edgeRuntime) {
      edgeRuntime.waitUntil(triggerProcessor());
    } else {
      triggerProcessor();
    }
  }

  return synced;
}
