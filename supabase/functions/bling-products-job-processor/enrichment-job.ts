import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { mirrorBlingImages } from '../_shared/bling-images.ts';
import { BLING_API_BASE, ENRICHMENT_BATCH_SIZE, ENRICHMENT_DELAY, type BlingConnection, type Log, delay, ensureValidToken, updateJobProgress, getJobStatus } from './job-helpers.ts';

async function fetchProductDetails(accessToken: string, productId: number, log: Log): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${BLING_API_BASE}/produtos/${productId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error('RATE_LIMITED');
    log.error(`[ENRICHMENT] Error fetching product ${productId}: ${response.status}`);
    return null;
  }
  const result = await response.json();
  return result.data || null;
}

function extractVariations(productDetail: Record<string, unknown>): Record<string, unknown>[] {
  const variacoes = productDetail?.variacoes;
  if (!Array.isArray(variacoes) || variacoes.length === 0) return [];
  return (variacoes as Record<string, unknown>[]).map((v) => ({
    id: v.id, nome: v.nome, codigo: v.codigo, preco: v.preco, gtin: v.gtin,
    estoque: v.estoque, produtoPaiId: (v.variacao as Record<string, unknown>)?.produtoPai ? ((v.variacao as Record<string, unknown>).produtoPai as Record<string, unknown>)?.id : undefined,
    midia: v.midia,
  }));
}

function getParentProductId(productDetail: Record<string, unknown>): number | null {
  const produtoPai = (productDetail?.variacao as Record<string, unknown>)?.produtoPai as Record<string, unknown> | undefined;
  return produtoPai?.id ? produtoPai.id as number : null;
}

export async function processEnrichmentJob(
  supabase: ServiceClient,
  job: Record<string, unknown>,
  connection: BlingConnection,
  log: Log,
): Promise<{ success: boolean; synced: number; completed: boolean; error?: string }> {
  const jobId = job.id;
  const integrationId = job.integration_id;
  let enriched = 0;
  // Sempre do começo: quem já foi enriquecido sai do filtro `imagens IS NULL` (o offset antigo pulava
  // produtos). Produto sem foto ou que falhou de vez fica com imagens = [] para não voltar.
  const offset = 0;
  const startedAt = Date.now();
  const BUDGET_MS = 100_000; // a cópia das fotos leva tempo; o resto fica para a próxima chamada
  const known = new Map<string, string>(); // fotos já copiadas nesta chamada (pai e variações repetem)

  try {
    const accessToken = await ensureValidToken(supabase, connection);

    await supabase.from('bling_sync_jobs').update({
      status: 'running', started_at: job.started_at || new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    const { data: products, error: fetchError } = await supabase.from('bling_products')
      .select('id, bling_id, nome').eq('integration_id', integrationId).is('imagens', null)
      .order('bling_id', { ascending: true }).range(offset, offset + ENRICHMENT_BATCH_SIZE - 1);

    if (fetchError) throw fetchError;

    if (!products || products.length === 0) {
      log.info(`[ENRICHMENT] Job ${jobId} completed: all products enriched`);
      await supabase.from('bling_sync_jobs').update({ status: 'completed', completed_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId);
      await supabase.from('bling_sync_logs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.sync_log_id);
      await supabase.from('integrations').update({ last_products_sync_at: new Date().toISOString(), last_sync_at: new Date().toISOString() }).eq('id', integrationId);
      return { success: true, synced: 0, completed: true };
    }

    log.info(`[ENRICHMENT] Processing ${products.length} products from offset ${offset}`);

    for (const product of products as Record<string, unknown>[]) {
      if (Date.now() - startedAt > BUDGET_MS) { log.info('[ENRICHMENT] Time budget reached, continuing next run'); break; }
      const { cancelled } = await getJobStatus(supabase, jobId as string);
      if (cancelled) { log.info(`[ENRICHMENT] Job ${jobId} cancelled`); return { success: true, synced: enriched, completed: false, error: 'CANCELLED' }; }

      try {
        const details = await fetchProductDetails(accessToken, product.bling_id as number, log);
        if (!details) {
          await supabase.from('bling_products').update({ imagens: [], updated_at: new Date().toISOString() }).eq('id', product.id);
        }
        if (details) {
          // fotos originais copiadas para o nosso Storage (o link do Bling vence em 7 dias)
          const { images, failed } = await mirrorBlingImages(supabase, job.tenant_id as string, details, known);
          if (failed) log.info(`[ENRICHMENT] ${failed} foto(s) do produto ${product.bling_id} não copiadas`);
          const variations = extractVariations(details);
          const parentId = getParentProductId(details);
          const updateData: Record<string, unknown> = {
            imagens: images, ...(images[0] ? { imagem_url: images[0].link } : {}), variacoes: variations.length > 0 ? variations : null, produto_pai_id: parentId,
            descricao_completa: details.descricao || null, descricao_curta: details.descricaoCurta || null, observacoes: details.observacoes || null,
            ncm: (details.tributacao as Record<string, unknown>)?.ncm || null, cest: (details.tributacao as Record<string, unknown>)?.cest || null,
            origem: (details.tributacao as Record<string, unknown>)?.origem ?? null, tributacao: details.tributacao || null,
            classe_fiscal: details.classeIpi || null, categoria_id: (details.categoria as Record<string, unknown>)?.id || null,
            categoria_nome: (details.categoria as Record<string, unknown>)?.descricao || null, marca: details.marca || null,
            fornecedor_id: (details.fornecedor as Record<string, unknown>)?.id || null,
            fornecedor_nome: ((details.fornecedor as Record<string, unknown>)?.contato as Record<string, unknown>)?.nome || null,
            fornecedor_codigo: (details.fornecedor as Record<string, unknown>)?.codigo || null,
            peso_liquido: details.pesoLiquido ?? null, peso_bruto: details.pesoBruto ?? null,
            largura: (details.dimensoes as Record<string, unknown>)?.largura ?? null,
            altura: (details.dimensoes as Record<string, unknown>)?.altura ?? null,
            profundidade: (details.dimensoes as Record<string, unknown>)?.profundidade ?? null,
            unidade: details.unidade || null, estoque_minimo: (details.estoque as Record<string, unknown>)?.minimo ?? null,
            estoque_depositos: (details.estoque as Record<string, unknown>)?.depositos || null, localizacao: details.localizacao || null,
            gtin_embalagem: details.gtinEmbalagem || null, ean: details.ean || null,
            condicao: details.condicao ?? null, frete_gratis: details.freteGratis === true,
            sob_encomenda: details.sobEncomenda === true, producao_propria: details.producao === 'P',
            cross_docking: details.crossdocking ?? null, garantia: details.garantia ?? null,
            volumes_por_produto: details.volumesPorProduto ?? null, campos_customizados: details.camposCustomizados || null,
            data_validade: details.dataValidade || null,
            dados_nfe: (details.spedTipoItem || details.canalVendasCodigo) ? { spedTipoItem: details.spedTipoItem || null, canalVendasCodigo: details.canalVendasCodigo || null } : null,
            updated_at: new Date().toISOString(),
          };
          const { error: updateError } = await supabase.from('bling_products').update(updateData).eq('id', product.id);
          if (!updateError) enriched++;
          else log.error(`[ENRICHMENT] Error updating product ${product.bling_id}:`, updateError);
        }
        await updateJobProgress(supabase, jobId as string, { processed_count: ((job.processed_count as number) || 0) + enriched, saved_count: ((job.saved_count as number) || 0) + enriched });
        await delay(ENRICHMENT_DELAY);
      } catch (err: unknown) {
        if ((err as Error).message === 'RATE_LIMITED') { log.info('[ENRICHMENT] Rate limited, waiting 2 seconds...'); await delay(2000); }
        else log.error(`[ENRICHMENT] Error enriching product ${product.bling_id}:`, err);
      }
    }

    const newOffset = offset;
    await supabase.from('bling_sync_jobs').update({
      status: 'pending', resume_page: newOffset,
      processed_count: ((job.processed_count as number) || 0) + enriched,
      saved_count: ((job.saved_count as number) || 0) + enriched,
      last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', jobId);
    log.info(`[ENRICHMENT] Batch done: enriched ${enriched}, next offset ${newOffset}`);
    return { success: true, synced: enriched, completed: false };

  } catch (err: unknown) {
    log.error(`[ENRICHMENT] Error processing job ${jobId}:`, err);
    const newAttempts = ((job.attempts as number) || 0) + 1;
    const maxAttempts = 5;
    if (newAttempts >= maxAttempts) {
      await supabase.from('bling_sync_jobs').update({ status: 'failed', error_message: `Failed after ${maxAttempts} attempts: ${(err as Error).message}`, attempts: newAttempts, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', jobId);
      return { success: false, synced: enriched, completed: false, error: (err as Error).message };
    }
    await supabase.from('bling_sync_jobs').update({ status: 'pending', attempts: newAttempts, error_message: (err as Error).message, updated_at: new Date().toISOString() }).eq('id', jobId);
    return { success: false, synced: enriched, completed: false, error: (err as Error).message };
  }
}
