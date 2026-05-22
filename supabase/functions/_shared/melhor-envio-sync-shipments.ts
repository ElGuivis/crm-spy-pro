import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
import { readMelhorEnvioTokens } from "./credential-helpers.ts";
import { extractEcommerceOrderNumber, buildShipmentRecord } from "./melhor-envio-helpers.ts";

const ME_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "production";
const ME_API_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/api/v2"
  : "https://melhorenvio.com.br/api/v2";

export interface SyncShipmentsOpts {
  supabase: ServiceClient;
  tenantId: string;
  bodyData: Record<string, unknown>;
  corsHeaders: Record<string, string>;
  log: ReturnType<typeof createLogger>;
}

export async function handleSyncShipments(opts: SyncShipmentsOpts): Promise<Response> {
  const { supabase, tenantId, bodyData, corsHeaders, log } = opts;
  const forceReset = bodyData?.force_reset === true;

  const { data: tokenRecord } = await supabase
    .from("melhor_envio_tokens")
    .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
    .eq("tenant_id", tenantId)
    .single();

  if (!tokenRecord) {
    return new Response(
      JSON.stringify({ success: false, error: "Não conectado ao Melhor Envio" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const tokens = await readMelhorEnvioTokens(supabase, tokenRecord);
  if (!tokens?.accessToken) {
    return new Response(
      JSON.stringify({ success: false, error: "Token expirado. Reconecte-se." }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const meToken = tokens.accessToken;

  const { data: integrationData } = await supabase
    .from("integrations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", "melhor_envio")
    .eq("status", "connected")
    .single();
  const integrationId = integrationData?.id || null;

  log.info(`[melhor-envio] ========== SYNC SHIPMENTS ==========`);
  log.info(`[melhor-envio] Tenant: ${tenantId}, forceReset: ${forceReset}`);

  const JOB_TIMEOUT_MS = 10 * 60 * 1000;
  const timeoutThreshold = new Date(Date.now() - JOB_TIMEOUT_MS).toISOString();

  if (forceReset) {
    log.info(`[melhor-envio] Force reset - limpando todos os jobs pendentes`);
    await supabase
      .from("me_sync_jobs")
      .update({
        status: "failed",
        error_message: "Reset forçado pelo usuário",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "running"]);
  }

  const { data: stuckJobs } = await supabase
    .from("me_sync_jobs")
    .update({
      status: "failed",
      error_message: "Job travado - timeout automático (5min)",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "running"])
    .lt("updated_at", timeoutThreshold)
    .select();

  if (stuckJobs && stuckJobs.length > 0) {
    log.info(`[melhor-envio] Limpou ${stuckJobs.length} jobs travados`);
  }

  const { data: activeJob } = await supabase
    .from("me_sync_jobs")
    .select("id, tenant_id, integration_id, status, current_page, items_saved, items_linked, items_total, total_pages, started_at, updated_at, cursor_data, error_message")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let job = activeJob;
  let currentPage = 1;

  if (!job) {
    const { data: newJob, error: jobError } = await supabase
      .from("me_sync_jobs")
      .insert({
        tenant_id: tenantId,
        integration_id: integrationId,
        status: "running",
        current_page: 1,
        items_saved: 0,
        items_linked: 0,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        cursor_data: {},
      })
      .select()
      .single();

    if (jobError) {
      log.error(`[melhor-envio] Erro ao criar job:`, jobError);
      throw new Error("Erro ao criar job de sincronização");
    }
    job = newJob;
    log.info(`[melhor-envio] Novo job criado: ${job.id}`);
  } else {
    currentPage = (job.current_page || 1);
    const phase = (job as Record<string, unknown>).cursor_data?.phase || 0;
    log.info(`[melhor-envio] Continuando job ${job.id} da página ${currentPage}${phase > 0 ? ` (fase ${phase})` : ""}`);
    await supabase
      .from("me_sync_jobs")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", job.id);
  }

  const PER_PAGE = 50;
  const MAX_PAGES_PER_CALL = 500;
  const DELAY_BETWEEN_PAGES = 200;
  const PAGE_TIMEOUT_MS = 15000;
  const MAX_EXECUTION_MS = 50000;
  const executionStart = Date.now();

  let totalPages = job.total_pages || null;
  let totalItems = job.items_total || null;
  let pagesProcessed = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  const cursorData = (job as Record<string, unknown>).cursor_data || {};
  let totalSavedThisCall = 0;
  let totalLinkedThisCall = 0;
  let totalSaveErrors = 0;

  async function fetchPageWithTimeout(page: number, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${ME_API_URL}/me/orders?per_page=${PER_PAGE}&page=${page}`, {
        headers: {
          "Authorization": `Bearer ${meToken}`,
          "Accept": "application/json",
          "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if ((err as Error).name === "AbortError") throw new Error(`Timeout ao buscar página ${page}`);
      throw err;
    }
  }

  for (let i = 0; i < MAX_PAGES_PER_CALL; i++) {
    if (Date.now() - executionStart > MAX_EXECUTION_MS) {
      log.info(`[melhor-envio] Limite de tempo (${Math.round((Date.now() - executionStart) / 1000)}s) - pausando na página ${currentPage + i}`);
      break;
    }

    const page = currentPage + i;
    let ordersResponse: Response | null = null;
    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries < MAX_RETRIES) {
      try {
        ordersResponse = await fetchPageWithTimeout(page, PAGE_TIMEOUT_MS);
        break;
      } catch (err: unknown) {
        retries++;
        log.error(`[melhor-envio] Tentativa ${retries}/${MAX_RETRIES} falhou para página ${page}: ${(err as Error).message}`);
        if (retries < MAX_RETRIES) await new Promise(r => setTimeout(r, 1000 * retries));
      }
    }

    if (!ordersResponse) {
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log.error(`[melhor-envio] ${MAX_CONSECUTIVE_ERRORS} erros consecutivos - pausando sync`);
        break;
      }
      continue;
    }

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      log.error(`[melhor-envio] Erro página ${page}: ${ordersResponse.status} - ${errorText.substring(0, 200)}`);
      if (ordersResponse.status === 429) {
        log.info(`[melhor-envio] Rate limit - aguardando 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        i--;
        continue;
      }
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
      continue;
    }

    consecutiveErrors = 0;

    let ordersData: Record<string, unknown>;
    try {
      ordersData = await ordersResponse.json();
    } catch {
      log.error(`[melhor-envio] Erro JSON página ${page}`);
      continue;
    }

    const orders = (ordersData.data || ordersData || []) as Record<string, unknown>[];
    const lastPage = (ordersData.last_page as number) || 1;
    const total = (ordersData.total as number) || 0;

    if (page === 1 || !totalPages) {
      totalPages = lastPage;
      totalItems = total;
      log.info(`[melhor-envio] Total: ${totalItems} envios em ${totalPages} páginas`);
    }

    if (orders.length === 0) {
      log.info(`[melhor-envio] Página ${page}: vazia, finalizando`);
      pagesProcessed++;
      break;
    }

    const ecommerceNumbers: string[] = [];
    for (const order of orders) {
      const num = extractEcommerceOrderNumber(order);
      if (num) ecommerceNumbers.push(num);
    }
    const uniqueNumbers = [...new Set(ecommerceNumbers)].filter(Boolean);
    const orderMap = new Map<string, string>();

    if (uniqueNumbers.length > 0) {
      const { data: liOrders } = await supabase
        .from("li_orders")
        .select("id, order_number")
        .eq("tenant_id", tenantId)
        .in("order_number", uniqueNumbers);
      if (liOrders) {
        for (const o of liOrders) {
          if (o.order_number && o.id) orderMap.set(String(o.order_number), String(o.id));
        }
      }

      const { data: blingOrders } = await supabase
        .from("bling_orders")
        .select("id, numero")
        .eq("tenant_id", tenantId)
        .in("numero", uniqueNumbers);
      if (blingOrders) {
        for (const o of blingOrders) {
          if (o.numero && o.id && !orderMap.has(String(o.numero))) {
            orderMap.set(String(o.numero), `bling:${String(o.id)}`);
          }
        }
      }
    }

    const shipmentBatch: Record<string, unknown>[] = [];
    let pageSaved = 0;
    let pageLinked = 0;

    for (const order of orders) {
      try {
        const externalNum = extractEcommerceOrderNumber(order);
        const matchedId = externalNum && orderMap.has(externalNum) ? orderMap.get(externalNum)! : null;

        let liOrderId: string | null = null;
        let blingOrderId: string | null = null;

        if (matchedId) {
          if (matchedId.startsWith("bling:")) {
            blingOrderId = matchedId.slice(6);
          } else {
            liOrderId = matchedId;
          }
          pageLinked++;
        }

        shipmentBatch.push(buildShipmentRecord(order, liOrderId, tenantId, integrationId, blingOrderId));
      } catch (err) {
        log.error(`[melhor-envio] Erro ao processar pedido ${order.id}:`, err);
        totalSaveErrors++;
      }
    }

    const BATCH_SIZE = 100;
    for (let b = 0; b < shipmentBatch.length; b += BATCH_SIZE) {
      const chunk = shipmentBatch.slice(b, b + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("me_shipments")
        .upsert(chunk, { onConflict: "tenant_id,me_id" });

      if (upsertError) {
        log.error(`[melhor-envio] Erro upsert página ${page}:`, upsertError.message);
        totalSaveErrors += chunk.length;
      } else {
        pageSaved += chunk.length;
      }
    }

    totalSavedThisCall += pageSaved;
    totalLinkedThisCall += pageLinked;
    pagesProcessed++;

    const runningTotal = (job.items_saved || 0) + totalSavedThisCall;
    const runningLinked = (job.items_linked || 0) + totalLinkedThisCall;
    await supabase
      .from("me_sync_jobs")
      .update({
        updated_at: new Date().toISOString(),
        current_page: currentPage + pagesProcessed,
        total_pages: totalPages,
        items_total: totalItems,
        items_saved: runningTotal,
        items_linked: runningLinked,
      })
      .eq("id", job.id);

    log.info(`[melhor-envio] Página ${page}/${totalPages}: ${pageSaved} salvos, ${pageLinked} vinculados (total: ${runningTotal})`);

    if (page >= lastPage) break;

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
  }

  const newCurrentPage = currentPage + pagesProcessed;
  const reachedLastPage = pagesProcessed === 0 || newCurrentPage > (totalPages || 1);
  const hasTooManyErrors = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;

  let finalStatus: string;
  if (hasTooManyErrors) finalStatus = "failed";
  else if (reachedLastPage) finalStatus = "completed";
  else finalStatus = "running";

  const totalSaved = (job.items_saved || 0) + totalSavedThisCall;
  const totalLinked = (job.items_linked || 0) + totalLinkedThisCall;

  const updateData: Record<string, unknown> = {
    status: finalStatus,
    current_page: newCurrentPage,
    total_pages: totalPages,
    items_total: totalItems,
    items_saved: totalSaved,
    items_linked: totalLinked,
    updated_at: new Date().toISOString(),
    cursor_data: cursorData,
  };

  if (finalStatus === "completed" || finalStatus === "failed") {
    updateData.completed_at = new Date().toISOString();
    if (hasTooManyErrors) {
      updateData.error_message = `Muitos erros consecutivos (${consecutiveErrors}). Última página: ${newCurrentPage}`;
    }
  }

  await supabase.from("me_sync_jobs").update(updateData).eq("id", job.id);

  if (finalStatus === "completed") {
    await supabase
      .from("integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("type", "melhor_envio");
  }

  log.info(`[melhor-envio] Job ${job.id}: ${finalStatus} - Página ${newCurrentPage}/${totalPages || "?"} - ${totalSaved} salvos, ${totalLinked} vinculados`);

  return new Response(
    JSON.stringify({
      success: true,
      status: finalStatus,
      job_id: job.id,
      current_page: newCurrentPage,
      total_pages: totalPages,
      items_saved: totalSaved,
      items_total: totalItems,
      items_linked: totalLinked,
      synced_this_call: totalSavedThisCall,
      errors: totalSaveErrors,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
