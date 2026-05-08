import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';
const PAGE_SIZE = 100;
const RATE_LIMIT_DELAY = 400;
const MAX_PAGES_PER_RUN = 3;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const ENRICHMENT_BATCH_SIZE = 20;
const ENRICHMENT_DELAY = 400;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface BlingConnection {
  id: string;
  tenant_id: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string;
}

async function ensureValidToken(supabase: ServiceClient, connection: BlingConnection): Promise<string> {
  return ensureBlingToken(supabase, connection, '[PRODUCTS-JOB]');
}

// Fetch data from Bling API with pagination
async function fetchBlingProducts(
  accessToken: string,
  page: number = 1
): Promise<{ data: Record<string, unknown>[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    pagina: String(page),
    limite: String(PAGE_SIZE),
  });
  
  const url = `${BLING_API_BASE}/produtos?${params}`;
  log.info(`[PRODUCTS-JOB] Fetching page ${page}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    throw new Error(`Bling API error: ${response.status}`);
  }
  
  const result = await response.json();
  const data = result.data || [];
  const hasMore = data.length === PAGE_SIZE;
  
  return { data, hasMore };
}

// Fetch single product details (for enrichment)
async function fetchProductDetails(accessToken: string, productId: number): Promise<Record<string, unknown> | null> {
  const url = `${BLING_API_BASE}/produtos/${productId}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }
    log.error(`[ENRICHMENT] Error fetching product ${productId}: ${response.status}`);
    return null;
  }
  
  const result = await response.json();
  return result.data || null;
}

// Extract images from product detail response
function extractImages(productDetail: Record<string, unknown>): Array<{ link: string; linkMiniatura?: string; ordem?: number }> {
  const images: Array<{ link: string; linkMiniatura?: string; ordem?: number }> = [];
  
  // Extract from midia.imagens.internas
  const internas = productDetail?.midia?.imagens?.internas;
  if (Array.isArray(internas)) {
    internas.forEach((img: Record<string, unknown>, index: number) => {
      if (img.link) {
        images.push({
          link: img.link,
          linkMiniatura: img.linkMiniatura,
          ordem: img.ordem ?? index
        });
      }
    });
  }
  
  // Extract from midia.imagens.externas
  const externas = productDetail?.midia?.imagens?.externas;
  if (Array.isArray(externas)) {
    externas.forEach((img: Record<string, unknown>, index: number) => {
      if (img.link) {
        images.push({
          link: img.link,
          ordem: (internas?.length || 0) + index
        });
      }
    });
  }
  
  // Fallback to imagemURL if no images found
  if (images.length === 0 && productDetail?.imagemURL) {
    images.push({ link: productDetail.imagemURL, ordem: 0 });
  }
  
  return images;
}

// Extract variations with their details
function extractVariations(productDetail: Record<string, unknown>): Record<string, unknown>[] {
  const variacoes = productDetail?.variacoes;
  if (!Array.isArray(variacoes) || variacoes.length === 0) return [];
  
  return variacoes.map((v: Record<string, unknown>) => ({
    id: v.id,
    nome: v.nome,
    codigo: v.codigo,
    preco: v.preco,
    gtin: v.gtin,
    estoque: v.estoque,
    produtoPaiId: v.variacao?.produtoPai?.id,
    midia: v.midia,
  }));
}

// Get produto_pai_id if this product is a variation
function getParentProductId(productDetail: Record<string, unknown>): number | null {
  const produtoPai = productDetail?.variacao?.produtoPai;
  if (produtoPai && produtoPai.id) {
    return produtoPai.id;
  }
  return null;
}

// Update job heartbeat and progress
async function updateJobProgress(
  supabase: ServiceClient,
  jobId: string,
  updates: {
    current_page?: number;
    resume_page?: number;
    processed_count?: number;
    saved_count?: number;
    total_count?: number;
  }
) {
  await supabase
    .from('bling_sync_jobs')
    .update({
      ...updates,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

// Check if job is cancelled or locked by another instance
async function getJobStatus(supabase: ServiceClient, jobId: string): Promise<{ cancelled: boolean; locked: boolean }> {
  const { data } = await supabase
    .from('bling_sync_jobs')
    .select('status, locked_at, locked_by')
    .eq('id', jobId)
    .single();
  
  if (!data) return { cancelled: true, locked: false };
  
  const cancelled = data.status === 'cancelled';
  const lockedByOther = data.locked_by && data.locked_by !== Deno.env.get('DENO_DEPLOYMENT_ID');
  const lockExpired = data.locked_at && new Date(data.locked_at).getTime() < Date.now() - LOCK_TIMEOUT_MS;
  
  return { cancelled, locked: lockedByOther && !lockExpired };
}

// Acquire lock on job using a two-step approach for reliability
async function acquireLock(supabase: ServiceClient, jobId: string): Promise<boolean> {
  const lockId = Deno.env.get('DENO_DEPLOYMENT_ID') || `lock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const lockExpireThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  
  // First, check current lock status
  const { data: currentJob } = await supabase
    .from('bling_sync_jobs')
    .select('locked_at, locked_by')
    .eq('id', jobId)
    .single();
  
  if (!currentJob) return false;
  
  // Check if lock is held and not expired
  if (currentJob.locked_at) {
    const lockedAt = new Date(currentJob.locked_at);
    if (lockedAt > lockExpireThreshold) {
      log.info(`[PRODUCTS-JOB] Job ${jobId} locked by ${currentJob.locked_by} at ${currentJob.locked_at}`);
      return false;
    }
  }
  
  // Try to acquire lock
  const { data, error } = await supabase
    .from('bling_sync_jobs')
    .update({
      locked_at: now.toISOString(),
      locked_by: lockId,
      last_heartbeat_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', jobId)
    .select()
    .single();
  
  if (error || !data) {
    log.error(`[PRODUCTS-JOB] Error acquiring lock:`, error);
    return false;
  }
  
  // Verify we got the lock (race condition check)
  if (data.locked_by !== lockId) {
    log.info(`[PRODUCTS-JOB] Lost lock race for job ${jobId}`);
    return false;
  }
  
  log.info(`[PRODUCTS-JOB] Acquired lock for job ${jobId}`);
  return true;
}

// Release lock on job
async function releaseLock(supabase: ServiceClient, jobId: string) {
  await supabase
    .from('bling_sync_jobs')
    .update({
      locked_at: null,
      locked_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

// Process a batch of pages for a single product listing job
async function processProductJob(
  supabase: ServiceClient,
  job: Record<string, unknown>,
  connection: BlingConnection
): Promise<{ success: boolean; synced: number; completed: boolean; error?: string }> {
  const jobId = job.id;
  const integrationId = job.integration_id;
  const tenantId = job.tenant_id;
  
  let synced = 0;
  let currentPage = job.resume_page || 1;
  const maxPagesThisRun = job.max_pages_per_run || MAX_PAGES_PER_RUN;
  let pagesProcessed = 0;
  let hasMore = true;
  let estimatedTotal = job.total_count || 0;
  
  try {
    // Ensure valid token
    const accessToken = await ensureValidToken(supabase, connection);
    
    // Update job to running
    await supabase
      .from('bling_sync_jobs')
      .update({
        status: 'running',
        started_at: job.started_at || new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    while (hasMore && pagesProcessed < maxPagesThisRun) {
      // Check if cancelled
      const { cancelled } = await getJobStatus(supabase, jobId);
      if (cancelled) {
        log.info(`[PRODUCTS-JOB] Job ${jobId} cancelled, stopping`);
        return { success: true, synced, completed: false, error: 'CANCELLED' };
      }
      
      try {
        // Fetch products page
        const { data: products, hasMore: morePages } = await fetchBlingProducts(accessToken, currentPage);
        hasMore = morePages;
        
        log.info(`[PRODUCTS-JOB] Page ${currentPage}: ${products.length} products, hasMore=${hasMore}`);
        
        if (products.length === 0) {
          break;
        }
        
        // Update estimated total if needed
        if (hasMore && currentPage * PAGE_SIZE >= estimatedTotal) {
          estimatedTotal = (currentPage + 5) * PAGE_SIZE;
          await updateJobProgress(supabase, jobId, { total_count: estimatedTotal });
        }
        
        // Upsert products (batch for efficiency)
        const productsToUpsert = products.map((product: Record<string, unknown>) => ({
          bling_id: product.id,
          nome: product.nome || 'Sem nome',
          codigo: product.codigo,
          preco: product.preco,
          preco_custo: product.precoCusto,
          estoque_atual: product.estoque?.saldoVirtualTotal ?? product.estoque?.saldoFisicoTotal ?? product.estoqueAtual ?? 0,
          estoque_minimo: product.estoque?.minimo ?? null,
          tipo: product.tipo,
          situacao: product.situacao,
          formato: product.formato,
          gtin: product.gtin,
          gtin_embalagem: product.gtinEmbalagem || null,
          ean: product.ean || null,
          unidade: product.unidade || null,
          imagem_url: product.imagemURL || null,
          // Campos adicionais da listagem
          condicao: product.condicao ?? null,
          frete_gratis: product.freteGratis === true,
          sob_encomenda: product.sobEncomenda === true,
          raw_data: product,
          tenant_id: tenantId,
          integration_id: integrationId,
          synced_at: new Date().toISOString(),
        }));
        
        const { error: upsertError } = await supabase
          .from('bling_products')
          .upsert(productsToUpsert, {
            onConflict: 'bling_id,integration_id',
            ignoreDuplicates: false,
          });
        
        if (upsertError) {
          log.error(`[PRODUCTS-JOB] Upsert error on page ${currentPage}:`, upsertError);
        } else {
          synced += products.length;
        }
        
        // Update progress
        await updateJobProgress(supabase, jobId, {
          current_page: currentPage,
          resume_page: currentPage + 1,
          processed_count: (job.processed_count || 0) + products.length,
          saved_count: (job.saved_count || 0) + products.length,
        });
        
        currentPage++;
        pagesProcessed++;
        
        // Rate limit delay
        if (hasMore && pagesProcessed < maxPagesThisRun) {
          await delay(RATE_LIMIT_DELAY);
        }
        
      } catch (err: unknown) {
        if (err.message === 'RATE_LIMITED') {
          log.info('[PRODUCTS-JOB] Rate limited, waiting 2 seconds...');
          await delay(2000);
          continue;
        }
        throw err;
      }
    }
    
    // Check if we've completed all pages
    if (!hasMore) {
      log.info(`[PRODUCTS-JOB] Job ${jobId} completed: ${synced} products synced`);
      
      // Final update with actual totals
      await supabase
        .from('bling_sync_jobs')
        .update({
          status: 'completed',
          total_count: (job.saved_count || 0) + synced,
          processed_count: (job.processed_count || 0) + synced,
          saved_count: (job.saved_count || 0) + synced,
          completed_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      
      // Create enrichment job automatically
      await createEnrichmentJob(supabase, job.sync_log_id, integrationId, tenantId);
      
      return { success: true, synced, completed: true };
    }
    
    // Not done yet, mark as pending for next run
    log.info(`[PRODUCTS-JOB] Job ${jobId} paused at page ${currentPage}, will resume`);
    
    await supabase
      .from('bling_sync_jobs')
      .update({
        status: 'pending',
        resume_page: currentPage,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    return { success: true, synced, completed: false };
    
  } catch (err: unknown) {
    log.error(`[PRODUCTS-JOB] Error processing job ${jobId}:`, err);
    
    const newAttempts = (job.attempts || 0) + 1;
    const maxAttempts = 5;
    
    if (newAttempts >= maxAttempts) {
      await supabase
        .from('bling_sync_jobs')
        .update({
          status: 'failed',
          error_message: `Failed after ${maxAttempts} attempts: ${err.message}`,
          attempts: newAttempts,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      
      await supabase
        .from('bling_sync_logs')
        .update({
          status: 'failed',
          error_message: err.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.sync_log_id);
        
      return { success: false, synced, completed: false, error: err.message };
    }
    
    await supabase
      .from('bling_sync_jobs')
      .update({
        status: 'pending',
        attempts: newAttempts,
        error_message: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    return { success: false, synced, completed: false, error: err.message };
  }
}

// Create enrichment job after products listing completes
async function createEnrichmentJob(
  supabase: ServiceClient,
  syncLogId: string,
  integrationId: string,
  tenantId: string
): Promise<void> {
  // Count products that need enrichment (no images or no detailed data)
  const { count } = await supabase
    .from('bling_products')
    .select('*', { count: 'exact', head: true })
    .eq('integration_id', integrationId)
    .is('imagens', null);
  
  if (!count || count === 0) {
    log.info('[ENRICHMENT] No products need enrichment');
    return;
  }
  
  log.info(`[ENRICHMENT] Creating enrichment job for ${count} products`);
  
  const { error } = await supabase
    .from('bling_sync_jobs')
    .insert({
      sync_log_id: syncLogId,
      integration_id: integrationId,
      tenant_id: tenantId,
      job_type: 'product_enrichment',
      status: 'pending',
      total_count: count,
      processed_count: 0,
      saved_count: 0,
      resume_page: 0,
      started_at: new Date().toISOString(),
    });
  
  if (error) {
    log.error('[ENRICHMENT] Error creating enrichment job:', error);
  }
}

// Process product enrichment job - fetches details for each product
async function processEnrichmentJob(
  supabase: ServiceClient,
  job: Record<string, unknown>,
  connection: BlingConnection
): Promise<{ success: boolean; synced: number; completed: boolean; error?: string }> {
  const jobId = job.id;
  const integrationId = job.integration_id;
  
  let enriched = 0;
  const offset = job.resume_page || 0;
  
  try {
    const accessToken = await ensureValidToken(supabase, connection);
    
    // Update job to running
    await supabase
      .from('bling_sync_jobs')
      .update({
        status: 'running',
        started_at: job.started_at || new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    // Fetch products that need enrichment
    const { data: products, error: fetchError } = await supabase
      .from('bling_products')
      .select('id, bling_id, nome')
      .eq('integration_id', integrationId)
      .is('imagens', null)
      .order('bling_id', { ascending: true })
      .range(offset, offset + ENRICHMENT_BATCH_SIZE - 1);
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!products || products.length === 0) {
      // All done!
      log.info(`[ENRICHMENT] Job ${jobId} completed: all products enriched`);
      
      await supabase
        .from('bling_sync_jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      
      // Update sync log as completed
      await supabase
        .from('bling_sync_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.sync_log_id);
      
      // Update integration metadata
      await supabase
        .from('integrations')
        .update({
          last_products_sync_at: new Date().toISOString(),
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', integrationId);
      
      return { success: true, synced: 0, completed: true };
    }
    
    log.info(`[ENRICHMENT] Processing ${products.length} products from offset ${offset}`);
    
    for (const product of products) {
      // Check if cancelled
      const { cancelled } = await getJobStatus(supabase, jobId);
      if (cancelled) {
        log.info(`[ENRICHMENT] Job ${jobId} cancelled`);
        return { success: true, synced: enriched, completed: false, error: 'CANCELLED' };
      }
      
      try {
        // Fetch product details
        const details = await fetchProductDetails(accessToken, product.bling_id);
        
        if (details) {
          // Extract data
          const images = extractImages(details);
          const variations = extractVariations(details);
          const parentId = getParentProductId(details);
          
          // Prepare update data with ALL available fields
          const updateData: Record<string, unknown> = {
            imagens: images.length > 0 ? images : null,
            variacoes: variations.length > 0 ? variations : null,
            produto_pai_id: parentId,
            // Descrições
            descricao_completa: details.descricao || null,
            descricao_curta: details.descricaoCurta || null,
            observacoes: details.observacoes || null,
            // Tributação
            ncm: details.tributacao?.ncm || null,
            cest: details.tributacao?.cest || null,
            origem: details.tributacao?.origem ?? null,
            tributacao: details.tributacao || null,
            classe_fiscal: details.classeIpi || null,
            // Categoria
            categoria_id: details.categoria?.id || null,
            categoria_nome: details.categoria?.descricao || null,
            // Marca
            marca: details.marca || null,
            // Fornecedor
            fornecedor_id: details.fornecedor?.id || null,
            fornecedor_nome: details.fornecedor?.contato?.nome || null,
            fornecedor_codigo: details.fornecedor?.codigo || null,
            // Dimensões e peso
            peso_liquido: details.pesoLiquido ?? null,
            peso_bruto: details.pesoBruto ?? null,
            largura: details.dimensoes?.largura ?? null,
            altura: details.dimensoes?.altura ?? null,
            profundidade: details.dimensoes?.profundidade ?? null,
            // Unidade e estoque
            unidade: details.unidade || null,
            estoque_minimo: details.estoque?.minimo ?? null,
            estoque_depositos: details.estoque?.depositos || null,
            localizacao: details.localizacao || null,
            // Códigos adicionais
            gtin_embalagem: details.gtinEmbalagem || null,
            ean: details.ean || null,
            // Flags e condições
            condicao: details.condicao ?? null,
            frete_gratis: details.freteGratis === true,
            sob_encomenda: details.sobEncomenda === true,
            producao_propria: details.producao === 'P',
            // Valores numéricos
            cross_docking: details.crossdocking ?? null,
            garantia: details.garantia ?? null,
            volumes_por_produto: details.volumesPorProduto ?? null,
            // Campos especiais
            campos_customizados: details.camposCustomizados || null,
            data_validade: details.dataValidade || null,
            // Dados para NF-e
            dados_nfe: (details.spedTipoItem || details.canalVendasCodigo) ? {
              spedTipoItem: details.spedTipoItem || null,
              canalVendasCodigo: details.canalVendasCodigo || null,
            } : null,
            updated_at: new Date().toISOString(),
          };
          
          // Update product
          const { error: updateError } = await supabase
            .from('bling_products')
            .update(updateData)
            .eq('id', product.id);
          
          if (!updateError) {
            enriched++;
          } else {
            log.error(`[ENRICHMENT] Error updating product ${product.bling_id}:`, updateError);
          }
        }
        
        // Update heartbeat
        await updateJobProgress(supabase, jobId, {
          processed_count: (job.processed_count || 0) + enriched,
          saved_count: (job.saved_count || 0) + enriched,
        });
        
        // Rate limit delay
        await delay(ENRICHMENT_DELAY);
        
      } catch (err: unknown) {
        if (err.message === 'RATE_LIMITED') {
          log.info('[ENRICHMENT] Rate limited, waiting 2 seconds...');
          await delay(2000);
          // Don't increment enriched, will retry
        } else {
          log.error(`[ENRICHMENT] Error enriching product ${product.bling_id}:`, err);
        }
      }
    }
    
    // Update resume position
    const newOffset = offset + products.length;
    
    await supabase
      .from('bling_sync_jobs')
      .update({
        status: 'pending',
        resume_page: newOffset,
        processed_count: (job.processed_count || 0) + enriched,
        saved_count: (job.saved_count || 0) + enriched,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    log.info(`[ENRICHMENT] Batch done: enriched ${enriched}, next offset ${newOffset}`);
    
    return { success: true, synced: enriched, completed: false };
    
  } catch (err: unknown) {
    log.error(`[ENRICHMENT] Error processing job ${jobId}:`, err);
    
    const newAttempts = (job.attempts || 0) + 1;
    const maxAttempts = 5;
    
    if (newAttempts >= maxAttempts) {
      await supabase
        .from('bling_sync_jobs')
        .update({
          status: 'failed',
          error_message: `Failed after ${maxAttempts} attempts: ${err.message}`,
          attempts: newAttempts,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
        
      return { success: false, synced: enriched, completed: false, error: err.message };
    }
    
    await supabase
      .from('bling_sync_jobs')
      .update({
        status: 'pending',
        attempts: newAttempts,
        error_message: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    return { success: false, synced: enriched, completed: false, error: err.message };
  }
}

Deno.serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("bling-products-job-processor", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireUserOrInternalAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const results: Record<string, unknown>[] = [];
    
    // Parse optional body
    let requestBody: Record<string, unknown> = {};
    try {
      const bodyText = await req.text();
      if (bodyText) requestBody = JSON.parse(bodyText);
    } catch { /* ignore */ }
    
    const specificJobId = requestBody.jobId;
    
    // Find pending/running jobs (products OR product_enrichment)
    let jobsQuery = supabase
      .from('bling_sync_jobs')
      .select('*, bling_sync_logs!inner(integration_id)')
      .in('job_type', ['products', 'product_enrichment'])
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: true })
      .limit(5);
    
    if (specificJobId) {
      jobsQuery = supabase
        .from('bling_sync_jobs')
        .select('*, bling_sync_logs!inner(integration_id)')
        .eq('id', specificJobId)
        .in('status', ['pending', 'running'])
        .limit(1);
    }
    
    const { data: jobs, error: jobsError } = await jobsQuery;
    
    if (jobsError) {
      log.error('[PRODUCTS-JOB] Error fetching jobs:', jobsError);
      throw jobsError;
    }
    
    if (!jobs || jobs.length === 0) {
      log.info('[PRODUCTS-JOB] No pending jobs found');
      return new Response(JSON.stringify({ success: true, message: 'No pending jobs', results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    log.info(`[PRODUCTS-JOB] Found ${jobs.length} jobs to process`);
    
    // Process each job (one at a time to respect rate limits)
    for (const job of jobs) {
      try {
        // Try to acquire lock
        const lockAcquired = await acquireLock(supabase, job.id);
        if (!lockAcquired) {
          log.info(`[PRODUCTS-JOB] Could not acquire lock for job ${job.id}, skipping`);
          results.push({ jobId: job.id, skipped: true, reason: 'locked' });
          continue;
        }
        
        // Get Bling connection
        const { data: connection, error: connError } = await supabase
          .from('bling_connections')
          .select('id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status')
          .eq('tenant_id', job.tenant_id)
          .eq('status', 'connected')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (connError || !connection) {
          log.info(`[PRODUCTS-JOB] No connection for job ${job.id}`);
          await releaseLock(supabase, job.id);
          results.push({ jobId: job.id, error: 'No Bling connection' });
          continue;
        }
        
        // Process based on job type
        let result;
        if (job.job_type === 'product_enrichment') {
          result = await processEnrichmentJob(supabase, job, connection);
        } else {
          result = await processProductJob(supabase, job, connection);
        }
        
        results.push({ jobId: job.id, jobType: job.job_type, ...result });
        
        // Release lock
        await releaseLock(supabase, job.id);
        
      } catch (err: unknown) {
        log.error(`[PRODUCTS-JOB] Error with job ${job.id}:`, err);
        await releaseLock(supabase, job.id);
        results.push({ jobId: job.id, error: err.message });
      }
    }
    
    const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0);
    const completedJobs = results.filter(r => r.completed).length;
    
    return new Response(JSON.stringify({
      success: true,
      message: `Processed ${results.length} jobs, synced ${totalSynced} products, ${completedJobs} completed`,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[PRODUCTS-JOB] Error:', errorMessage);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
