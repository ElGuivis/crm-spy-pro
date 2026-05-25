import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { BLING_API_BASE, PAGE_SIZE, UPSERT_CHUNK_SIZE, RATE_LIMIT_DELAY, MAX_PAGES_PER_RUN, type BlingConnection, type Log, chunkArray, delay, ensureValidToken, updateJobProgress, getJobStatus } from './job-helpers.ts';

async function fetchBlingProducts(
  accessToken: string,
  page: number,
  log: Log,
): Promise<{ data: Record<string, unknown>[]; hasMore: boolean }> {
  const params = new URLSearchParams({ pagina: String(page), limite: String(PAGE_SIZE) });
  const url = `${BLING_API_BASE}/produtos?${params}`;
  log.info(`[PRODUCTS-JOB] Fetching page ${page}`);

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`Bling API error: ${response.status}`);
  }

  const result = await response.json();
  const data = result.data || [];
  return { data, hasMore: data.length === PAGE_SIZE };
}

export async function createEnrichmentJob(
  supabase: ServiceClient,
  syncLogId: string,
  integrationId: string,
  tenantId: string,
  log: Log,
): Promise<void> {
  const { count } = await supabase.from('bling_products').select('*', { count: 'exact', head: true }).eq('integration_id', integrationId).is('imagens', null);

  if (!count || count === 0) { log.info('[ENRICHMENT] No products need enrichment'); return; }

  log.info(`[ENRICHMENT] Creating enrichment job for ${count} products`);
  const { error } = await supabase.from('bling_sync_jobs').insert({
    sync_log_id: syncLogId, integration_id: integrationId, tenant_id: tenantId,
    job_type: 'product_enrichment', status: 'pending', total_count: count,
    processed_count: 0, saved_count: 0, resume_page: 0, started_at: new Date().toISOString(),
  });
  if (error) log.error('[ENRICHMENT] Error creating enrichment job:', error);
}

export async function processProductJob(
  supabase: ServiceClient,
  job: Record<string, unknown>,
  connection: BlingConnection,
  log: Log,
): Promise<{ success: boolean; synced: number; completed: boolean; error?: string }> {
  const jobId = job.id;
  const integrationId = job.integration_id;
  const tenantId = job.tenant_id;

  let synced = 0;
  let currentPage = (job.resume_page as number) || 1;
  const maxPagesThisRun = (job.max_pages_per_run as number) || MAX_PAGES_PER_RUN;
  let pagesProcessed = 0;
  let hasMore = true;
  let estimatedTotal = (job.total_count as number) || 0;

  try {
    const accessToken = await ensureValidToken(supabase, connection);

    await supabase.from('bling_sync_jobs').update({
      status: 'running',
      started_at: job.started_at || new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    while (hasMore && pagesProcessed < maxPagesThisRun) {
      const { cancelled } = await getJobStatus(supabase, jobId as string);
      if (cancelled) {
        log.info(`[PRODUCTS-JOB] Job ${jobId} cancelled, stopping`);
        return { success: true, synced, completed: false, error: 'CANCELLED' };
      }

      try {
        const { data: products, hasMore: morePages } = await fetchBlingProducts(accessToken, currentPage, log);
        hasMore = morePages;

        log.info(`[PRODUCTS-JOB] Page ${currentPage}: ${products.length} products, hasMore=${hasMore}`);
        if (products.length === 0) break;

        if (hasMore && currentPage * PAGE_SIZE >= estimatedTotal) {
          estimatedTotal = (currentPage + 5) * PAGE_SIZE;
          await updateJobProgress(supabase, jobId as string, { total_count: estimatedTotal });
        }

        const productsToUpsert = products.map((product) => ({
          bling_id: product.id, nome: product.nome || 'Sem nome',
          codigo: product.codigo, preco: product.preco, preco_custo: product.precoCusto,
          estoque_atual: (product.estoque as Record<string, unknown>)?.saldoVirtualTotal ?? (product.estoque as Record<string, unknown>)?.saldoFisicoTotal ?? product.estoqueAtual ?? 0,
          estoque_minimo: (product.estoque as Record<string, unknown>)?.minimo ?? null,
          tipo: product.tipo, situacao: product.situacao, formato: product.formato,
          gtin: product.gtin, gtin_embalagem: product.gtinEmbalagem || null, ean: product.ean || null,
          unidade: product.unidade || null, imagem_url: product.imagemURL || null,
          condicao: product.condicao ?? null, frete_gratis: product.freteGratis === true,
          sob_encomenda: product.sobEncomenda === true, raw_data: product,
          tenant_id: tenantId, integration_id: integrationId, synced_at: new Date().toISOString(),
        }));

        let upsertError = null;
        let pageSynced = 0;
        for (const chunk of chunkArray(productsToUpsert, UPSERT_CHUNK_SIZE)) {
          const { error } = await supabase.from('bling_products').upsert(chunk, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false });
          if (error) { upsertError = error; break; }
          pageSynced += chunk.length;
        }

        if (upsertError) {
          log.error(`[PRODUCTS-JOB] Upsert error on page ${currentPage}:`, upsertError);
        } else {
          synced += pageSynced;
        }

        await updateJobProgress(supabase, jobId as string, {
          current_page: currentPage, resume_page: currentPage + 1,
          processed_count: ((job.processed_count as number) || 0) + products.length,
          saved_count: ((job.saved_count as number) || 0) + products.length,
        });

        currentPage++;
        pagesProcessed++;
        if (hasMore && pagesProcessed < maxPagesThisRun) await delay(RATE_LIMIT_DELAY);

      } catch (err: unknown) {
        if ((err as Error).message === 'RATE_LIMITED') {
          log.info('[PRODUCTS-JOB] Rate limited, waiting 2 seconds...');
          await delay(2000);
          continue;
        }
        throw err;
      }
    }

    if (!hasMore) {
      log.info(`[PRODUCTS-JOB] Job ${jobId} completed: ${synced} products synced`);
      await supabase.from('bling_sync_jobs').update({
        status: 'completed', total_count: ((job.saved_count as number) || 0) + synced,
        processed_count: ((job.processed_count as number) || 0) + synced,
        saved_count: ((job.saved_count as number) || 0) + synced,
        completed_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      await createEnrichmentJob(supabase, job.sync_log_id as string, integrationId as string, tenantId as string, log);
      return { success: true, synced, completed: true };
    }

    log.info(`[PRODUCTS-JOB] Job ${jobId} paused at page ${currentPage}, will resume`);
    await supabase.from('bling_sync_jobs').update({
      status: 'pending', resume_page: currentPage,
      last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    return { success: true, synced, completed: false };

  } catch (err: unknown) {
    log.error(`[PRODUCTS-JOB] Error processing job ${jobId}:`, err);
    const newAttempts = ((job.attempts as number) || 0) + 1;
    const maxAttempts = 5;

    if (newAttempts >= maxAttempts) {
      await supabase.from('bling_sync_jobs').update({ status: 'failed', error_message: `Failed after ${maxAttempts} attempts: ${(err as Error).message}`, attempts: newAttempts, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId);
      await supabase.from('bling_sync_logs').update({ status: 'failed', error_message: (err as Error).message, completed_at: new Date().toISOString() }).eq('id', job.sync_log_id);
      return { success: false, synced, completed: false, error: (err as Error).message };
    }

    await supabase.from('bling_sync_jobs').update({ status: 'pending', attempts: newAttempts, error_message: (err as Error).message, updated_at: new Date().toISOString() }).eq('id', jobId);
    return { success: false, synced, completed: false, error: (err as Error).message };
  }
}
