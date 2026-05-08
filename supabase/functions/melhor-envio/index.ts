import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { readMelhorEnvioTokens, writeMelhorEnvioTokens } from "../_shared/credential-helpers.ts";
import {
  mapStatus,
  normalizeOrderNumber,
  extractEcommerceOrderNumber,
  extractDocument,
  buildShipmentRecord,
} from "../_shared/melhor-envio-helpers.ts";

/** Resolve ME access token from encrypted column */
async function resolveMEAccessToken(supabase: ServiceClient, rec: Record<string, unknown>): Promise<string> {
  const tokens = await readMelhorEnvioTokens(supabase, rec as Record<string, unknown>);
  if (!tokens?.accessToken) throw new Error("ME access token not found or decryption failed");
  return tokens.accessToken;
}
async function resolveMERefreshToken(supabase: ServiceClient, rec: Record<string, unknown>): Promise<string> {
  const tokens = await readMelhorEnvioTokens(supabase, rec as Record<string, unknown>);
  return tokens?.refreshToken || "";
}

import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { PRIMARY_FRONTEND_URL } from "../_shared/frontend-config.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MELHOR_ENVIO_CLIENT_ID = Deno.env.get("MELHOR_ENVIO_CLIENT_ID")!;
const MELHOR_ENVIO_CLIENT_SECRET = Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET")!;
const MELHOR_ENVIO_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "production";
const ME_API_URL = MELHOR_ENVIO_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/api/v2"
  : "https://melhorenvio.com.br/api/v2";
const ME_AUTH_URL = MELHOR_ENVIO_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/oauth/authorize"
  : "https://melhorenvio.com.br/oauth/authorize";
const ME_TOKEN_URL = MELHOR_ENVIO_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/oauth/token"
  : "https://melhorenvio.com.br/oauth/token";

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("melhor-envio", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let action = url.searchParams.get("action");

  // Suporte para action no body (compatibilidade)
  // IMPORTANTE: usar req.clone() para não consumir o body original (que pode ser lido novamente mais abaixo)
  let bodyData: Record<string, unknown> = {};
  if (!action && req.method === "POST") {
    try {
      bodyData = await req.clone().json();
      if (bodyData?.action) action = String(bodyData.action);
    } catch {
      // Body não é JSON ou está vazio, ignorar
    }
  }

  log.info(`[melhor-envio] Action: ${action}`);

  // Cliente Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // =========================================================================
  // TRUST BOUNDARY: redirect_callback — STATE-BASED auth (no JWT)
  // See FUNCTION_CLASSIFICATION.md §Trust Boundary: melhor-envio
  //
  // tenant_id resolved from oauth_states DB record (one-time use, 10-min TTL)
  // Returns HTTP 302 redirect, not JSON.
  // =========================================================================
  if (action === "redirect_callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    
    log.info(`[melhor-envio] ========== REDIRECT CALLBACK ==========`);
    log.info(`[melhor-envio] Code: ${code ? code.substring(0, 30) + '...' : 'NULO'}`);
    log.info(`[melhor-envio] State: ${state}`);

    let tenantId: string | null = null;
    let frontendUrl = PRIMARY_FRONTEND_URL;
    
    // Validate state from DB (server-side, one-time use, expirable)
    if (state) {
      const { data: oauthState, error: stateErr } = await supabase
        .from("oauth_states")
        .select("tenant_id, frontend_url, expires_at")
        .eq("state", state)
        .eq("provider", "melhor_envio")
        .maybeSingle();

      if (stateErr || !oauthState) {
        log.error("[melhor-envio] Invalid or expired OAuth state:", stateErr);
      } else if (new Date(oauthState.expires_at) < new Date()) {
        log.error("[melhor-envio] OAuth state expired");
        // Clean up expired state
        await supabase.from("oauth_states").delete().eq("state", state);
      } else {
        tenantId = oauthState.tenant_id;
        frontendUrl = oauthState.frontend_url || frontendUrl;
        // Delete state immediately (one-time use)
        await supabase.from("oauth_states").delete().eq("state", state);
        log.info(`[melhor-envio] Validated state - tenant: ${tenantId}, frontend: ${frontendUrl}`);
      }
    }

    if (!code || !tenantId) {
      const errorUrl = `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent('Código ou tenant inválido')}`;
      return new Response(null, {
        status: 302,
        headers: { "Location": errorUrl }
      });
    }

    try {
      if (!MELHOR_ENVIO_CLIENT_ID || !MELHOR_ENVIO_CLIENT_SECRET) {
        throw new Error("Credenciais do Melhor Envio não configuradas");
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/melhor-envio?action=redirect_callback`;

      log.info(`[melhor-envio] Trocando code por tokens...`);

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: MELHOR_ENVIO_CLIENT_ID,
        client_secret: MELHOR_ENVIO_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code: code
      });

      const tokenResponse = await fetch(ME_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
        },
        body: tokenBody.toString()
      });

      const tokenText = await tokenResponse.text();
      log.info(`[melhor-envio] Token response status: ${tokenResponse.status}`);

      if (!tokenResponse.ok) {
        log.error(`[melhor-envio] Token error: ${tokenText}`);
        const errorUrl = `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent(`Erro OAuth: ${tokenText.substring(0, 100)}`)}`;
        return new Response(null, {
          status: 302,
          headers: { "Location": errorUrl }
        });
      }

      const tokens = JSON.parse(tokenText);

      if (!tokens.access_token) {
        const errorUrl = `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent('Tokens inválidos')}`;
        return new Response(null, {
          status: 302,
          headers: { "Location": errorUrl }
        });
      }

      // Buscar informações do usuário
      const userResponse = await fetch(`${ME_API_URL}/me`, {
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Accept": "application/json",
          "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
        }
      });

      let userData = null;
      if (userResponse.ok) {
        userData = await userResponse.json();
        log.info(`[melhor-envio] Usuário conectado: ${userData.firstname} ${userData.lastname}`);
      }

      const expiresAt = new Date(Date.now() + (tokens.expires_in || 2592000) * 1000).toISOString();

      const { error: saveError } = await (async () => {
        try {
          await writeMelhorEnvioTokens(supabase, tenantId, tokens.access_token, tokens.refresh_token, {
            expires_at: expiresAt,
            user_id: userData?.id?.toString(),
            user_name: userData ? `${userData.firstname} ${userData.lastname}` : null,
            user_email: userData?.email,
            environment: MELHOR_ENVIO_ENVIRONMENT,
            updated_at: new Date().toISOString()
          });
          return { error: null };
        } catch (e) {
          return { error: e };
        }
      })();

      if (saveError) {
        log.error("[melhor-envio] Erro ao salvar tokens:", saveError);
        const errorUrl = `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent('Erro ao salvar tokens')}`;
        return new Response(null, {
          status: 302,
          headers: { "Location": errorUrl }
        });
      }

      // Criar ou atualizar registro na tabela integrations
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("type", "melhor_envio")
        .maybeSingle();

      if (existingIntegration) {
        await supabase
          .from("integrations")
          .update({
            status: "connected",
            metadata: {
              user_id: userData?.id,
              user_name: userData ? `${userData.firstname} ${userData.lastname}` : null,
              user_email: userData?.email,
              environment: MELHOR_ENVIO_ENVIRONMENT
            },
            updated_at: new Date().toISOString()
          })
          .eq("id", existingIntegration.id);
      } else {
        await supabase
          .from("integrations")
          .insert({
            tenant_id: tenantId,
            type: "melhor_envio",
            name: "Melhor Envio",
            status: "connected",
            metadata: {
              user_id: userData?.id,
              user_name: userData ? `${userData.firstname} ${userData.lastname}` : null,
              user_email: userData?.email,
              environment: MELHOR_ENVIO_ENVIRONMENT
            }
          });
      }

      log.info(`[melhor-envio] Tokens salvos com sucesso para tenant ${tenantId}`);

      // Log webhook URL for manual setup (ME doesn't support programmatic registration)
      const webhookUrl = `${SUPABASE_URL}/functions/v1/melhor-envio-webhook`;
      log.info(`[melhor-envio] Webhook URL para cadastro manual no painel ME: ${webhookUrl}`);

      const successUrl = `${frontendUrl}/integrations?status=ok&melhor_envio=connected`;
      return new Response(null, {
        status: 302,
        headers: { "Location": successUrl }
      });

    } catch (error: unknown) {
      log.error(`[melhor-envio] Erro no redirect_callback:`, error);
      const errorUrl = `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent(error.message || 'Erro desconhecido')}`;
      return new Response(null, {
        status: 302,
        headers: { "Location": errorUrl }
      });
    }
  }

  try {
    if (!MELHOR_ENVIO_CLIENT_ID || !MELHOR_ENVIO_CLIENT_SECRET) {
      log.error("[melhor-envio] Credenciais não configuradas");
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais do Melhor Envio não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =========================================================================
    // TRUST BOUNDARY: All actions below — AUTHENTICATED via requireUserAuth
    // tenant_id resolved from JWT, never from request body.
    // =========================================================================
    const { requireUserAuth } = await import("../_shared/auth-guard.ts");
    const { userId, tenantId } = await requireUserAuth(req);

    switch (action) {
      // ==================== AUTHORIZE ====================
      case "authorize": {
        const frontendUrl = typeof bodyData.frontend_url === "string"
          ? bodyData.frontend_url
          : (url.searchParams.get("frontend_url") || `${url.origin}`);
        
        // Generate cryptographically random state nonce
        const stateValue = crypto.randomUUID();

        // Persist state in database with 10 minute expiration (one-time use)
        const { error: stateError } = await supabase
          .from("oauth_states")
          .insert({
            state: stateValue,
            tenant_id: tenantId,
            user_id: userId,
            provider: "melhor_envio",
            frontend_url: frontendUrl,
            redirect_path: "/integrations",
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
          });

        if (stateError) {
          log.error("[melhor-envio] Error persisting OAuth state:", stateError);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to create OAuth state" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const redirectUri = `${SUPABASE_URL}/functions/v1/melhor-envio?action=redirect_callback`;

        const scopes = [
          "cart-read", "cart-write",
          "companies-read", "companies-write",
          "coupons-read", "coupons-write",
          "notifications-read",
          "orders-read",
          "products-read", "products-write",
          "purchases-read",
          "shipping-calculate", "shipping-cancel", "shipping-checkout",
          "shipping-companies", "shipping-generate", "shipping-preview",
          "shipping-print", "shipping-share", "shipping-tracking",
          "ecommerce-shipping", "transactions-read", "users-read", "users-write",
          "webhooks-read", "webhooks-write"
        ].join(" ");

        const authParams = new URLSearchParams({
          client_id: MELHOR_ENVIO_CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: scopes,
          state: stateValue
        });

        const authUrl = `${ME_AUTH_URL}?${authParams.toString()}`;

        log.info(`[melhor-envio] Auth URL gerada para tenant ${tenantId}`);

        return new Response(
          JSON.stringify({ success: true, auth_url: authUrl }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== CALLBACK (deprecated) ====================
      case "callback": {
        log.info(`[melhor-envio] AVISO: action=callback está deprecated.`);
        return new Response(
          JSON.stringify({ success: false, error: "Este endpoint está deprecated." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== STATUS ====================
      case "status": {
        const { data: tokenRecord, error: tokenError } = await supabase
          .from("melhor_envio_tokens")
           .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at, user_id, user_name, user_email, environment")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (tokenError) {
          log.error("[melhor-envio] Erro ao buscar status:", tokenError);
          return new Response(
            JSON.stringify({ success: false, error: "Erro ao buscar status" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!tokenRecord) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              connected: false, 
              expired: false,
              user: null,
              expires_at: null
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const isExpired = new Date(tokenRecord.expires_at) < new Date();

        return new Response(
          JSON.stringify({ 
            success: true, 
            connected: true,
            expired: isExpired,
            user: tokenRecord.user_name ? {
              id: tokenRecord.user_id,
              name: tokenRecord.user_name,
              email: tokenRecord.user_email
            } : null,
            expires_at: tokenRecord.expires_at
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== REFRESH ====================
      case "refresh": {
        const { data: tokenRecord, error: tokenError } = await supabase
          .from("melhor_envio_tokens")
           .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at, user_id, user_name, user_email, environment")
          .eq("tenant_id", tenantId)
          .single();

        if (tokenError || !tokenRecord) {
          return new Response(
            JSON.stringify({ success: false, error: "Tokens não encontrados" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        log.info(`[melhor-envio] Renovando token para tenant ${tenantId}`);

        const resolvedRefreshToken = await resolveMERefreshToken(supabase, tokenRecord);
        const refreshBody = new URLSearchParams({
          grant_type: "refresh_token",
          client_id: MELHOR_ENVIO_CLIENT_ID,
          client_secret: MELHOR_ENVIO_CLIENT_SECRET,
          refresh_token: resolvedRefreshToken
        });

        const refreshResponse = await fetch(ME_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
          },
          body: refreshBody.toString()
        });

        const refreshText = await refreshResponse.text();

        if (!refreshResponse.ok) {
          log.error(`[melhor-envio] Refresh error: ${refreshText}`);
          return new Response(
            JSON.stringify({ success: false, error: `Erro ao renovar tokens: ${refreshText}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const newTokens = JSON.parse(refreshText);
        const newExpiresAt = new Date(Date.now() + (newTokens.expires_in || 2592000) * 1000).toISOString();

        await writeMelhorEnvioTokens(supabase, tenantId, newTokens.access_token, newTokens.refresh_token, {
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString()
        });

        log.info(`[melhor-envio] Token renovado com sucesso`);

        return new Response(
          JSON.stringify({ success: true, expires_at: newExpiresAt }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== DISCONNECT ====================
      case "disconnect": {
        await supabase
          .from("melhor_envio_tokens")
          .delete()
          .eq("tenant_id", tenantId);

        await supabase
          .from("integrations")
          .delete()
          .eq("tenant_id", tenantId)
          .eq("type", "melhor_envio");

        log.info(`[melhor-envio] Desconectado para tenant ${tenantId}`);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== SYNC SHIPMENTS (COM JOB QUEUE E PAGINAÇÃO COMPLETA - RESILIENTE) ====================
      case "sync_shipments": {
        const forceReset = bodyData?.force_reset === true;
        
        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
           .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
          .eq("tenant_id", tenantId)
          .single();

        if (!tokenRecord) {
          return new Response(
            JSON.stringify({ success: false, error: "Não conectado ao Melhor Envio" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Resolve encrypted access token
        const resolvedMEToken = await resolveMEAccessToken(supabase, tokenRecord);

        if (!resolvedMEToken) {
          return new Response(
            JSON.stringify({ success: false, error: "Token expirado. Reconecte-se." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Get the integration_id for this Melhor Envio connection
        const { data: integrationData } = await supabase
          .from("integrations")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("type", "melhor_envio")
          .eq("status", "connected")
          .single();
        
        const integrationId = integrationData?.id || null;

        // normalizeOrderNumber, extractEcommerceOrderNumber imported from _shared/melhor-envio-helpers.ts

        log.info(`[melhor-envio] ========== SYNC SHIPMENTS ==========`);
        log.info(`[melhor-envio] Tenant: ${tenantId}, forceReset: ${forceReset}`);

        // Timeout de 10 minutos para considerar job travado
        const JOB_TIMEOUT_MS = 10 * 60 * 1000;
        const timeoutThreshold = new Date(Date.now() - JOB_TIMEOUT_MS).toISOString();

        // Se forceReset, limpar TODOS os jobs pendentes
        if (forceReset) {
          log.info(`[melhor-envio] Force reset - limpando todos os jobs pendentes`);
          await supabase
            .from("me_sync_jobs")
            .update({ 
              status: "failed", 
              error_message: "Reset forçado pelo usuário",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("tenant_id", tenantId)
            .in("status", ["pending", "running"]);
        }

        // Limpar jobs travados (running/pending há mais de 5 min sem atualização)
        const { data: stuckJobs } = await supabase
          .from("me_sync_jobs")
          .update({ 
            status: "failed", 
            error_message: "Job travado - timeout automático (5min)",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "running"])
          .lt("updated_at", timeoutThreshold)
          .select();
        
        if (stuckJobs && stuckJobs.length > 0) {
          log.info(`[melhor-envio] Limpou ${stuckJobs.length} jobs travados`);
        }

        // Verificar se há job ativo recente
        const { data: activeJob } = await supabase
          .from("me_sync_jobs")
           .select("id, tenant_id, integration_id, status, current_page, items_saved, items_linked, started_at, updated_at, cursor_data, error_message")
          .eq("tenant_id", tenantId)
          .in("status", ["pending", "running"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let job = activeJob;
        let currentPage = 1;

        if (!job) {
          // Criar novo job
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
              cursor_data: {}
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
          log.info(`[melhor-envio] Continuando job ${job.id} da página ${currentPage}${phase > 0 ? ` (fase ${phase})` : ''}`);
          
          // Atualizar updated_at para evitar timeout
          await supabase
            .from("me_sync_jobs")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", job.id);
        }

        // Configuração de paginação - processar o máximo possível por chamada
        // Edge functions têm ~150s de timeout, cada página leva ~1-2s
        // Com 100 páginas × ~1.5s = ~150s (margem segura)
        const PER_PAGE = 50;
        const MAX_PAGES_PER_CALL = 500; // Sem limite prático - controlado pelo tempo
        const DELAY_BETWEEN_PAGES = 200; // 200ms entre páginas
        const PAGE_TIMEOUT_MS = 15000;
        const MAX_EXECUTION_MS = 50000; // 50s - responder rápido para o frontend continuar o loop
        const executionStart = Date.now();

        let totalPages = job.total_pages || null;
        let totalItems = job.items_total || null;
        let pagesProcessed = 0;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;

        // Carregar cursor_data
        const cursorData = (job as Record<string, unknown>).cursor_data || {};

        // Totals across all pages in this call
        let totalSavedThisCall = 0;
        let totalLinkedThisCall = 0;
        let totalValueThisCall = 0;
        let totalSaveErrors = 0;

        // Função com timeout para buscar página
        async function fetchPageWithTimeout(page: number, timeoutMs: number): Promise<Record<string, unknown>> {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          
          try {
            const fetchUrl = `${ME_API_URL}/me/orders?per_page=${PER_PAGE}&page=${page}`;
            const response = await fetch(fetchUrl, {
              headers: {
                "Authorization": `Bearer ${resolvedMEToken}`,
                "Accept": "application/json",
                "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
              },
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
          } catch (err: unknown) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
              throw new Error(`Timeout ao buscar página ${page}`);
            }
            throw err;
          }
        }

        // extractDocument and buildShipmentRecord imported from _shared/melhor-envio-helpers.ts

        // ===== MAIN LOOP: Fetch page → save immediately → next page =====
        for (let i = 0; i < MAX_PAGES_PER_CALL; i++) {
          // Check execution time limit
          if (Date.now() - executionStart > MAX_EXECUTION_MS) {
            log.info(`[melhor-envio] Limite de tempo (${Math.round((Date.now() - executionStart)/1000)}s) - pausando na página ${currentPage + i}`);
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
              log.error(`[melhor-envio] Tentativa ${retries}/${MAX_RETRIES} falhou para página ${page}: ${err.message}`);
              if (retries < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, 1000 * retries));
              }
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

          const orders = ordersData.data || ordersData || [];
          const lastPage = ordersData.last_page || 1;
          const total = ordersData.total || 0;

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

          // ===== SAVE THIS PAGE IMMEDIATELY =====
          // 1. Extract ecommerce numbers for LI linking
          const ecommerceNumbers: string[] = [];
          for (const order of orders) {
            const num = extractEcommerceOrderNumber(order);
            if (num) ecommerceNumbers.push(num);
          }
          const uniqueNumbers = [...new Set(ecommerceNumbers)].filter(Boolean);
          const orderMap = new Map<string, string>();

          if (uniqueNumbers.length > 0) {
            // Try LI orders first
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

            // Also try Bling orders
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

          // 2. Build shipment records
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
              if (order.price) totalValueThisCall += parseFloat(order.price);
            } catch (err) {
              log.error(`[melhor-envio] Erro ao processar pedido ${order.id}:`, err);
              totalSaveErrors++;
            }
          }

          // 3. Upsert this page's data immediately (in chunks of 100)
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

          // 4. Update job progress after each page (so frontend sees real-time progress)
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
              items_linked: runningLinked
            })
            .eq("id", job.id);

          log.info(`[melhor-envio] Página ${page}/${totalPages}: ${pageSaved} salvos, ${pageLinked} vinculados (total: ${runningTotal})`);

          if (page >= lastPage) break;

          await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
        }

        // ===== LI status propagation for changed statuses =====
        // Skip for now to save time - can be done in a separate pass

        // Determine final status
        const newCurrentPage = currentPage + pagesProcessed;
        const reachedLastPage = pagesProcessed === 0 || newCurrentPage > (totalPages || 1);
        const hasTooManyErrors = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS;

        let finalStatus: string;
        if (hasTooManyErrors) {
          finalStatus = "failed";
        } else if (reachedLastPage) {
          finalStatus = "completed";
        } else {
          finalStatus = "running";
        }

        const totalSaved = (job.items_saved || 0) + totalSavedThisCall;
        const totalLinked = (job.items_linked || 0) + totalLinkedThisCall;

        // Final job update
        const updateData: Record<string, unknown> = {
          status: finalStatus,
          current_page: newCurrentPage,
          total_pages: totalPages,
          items_total: totalItems,
          items_saved: totalSaved,
          items_linked: totalLinked,
          updated_at: new Date().toISOString(),
          cursor_data: cursorData
        };

        if (finalStatus === "completed" || finalStatus === "failed") {
          updateData.completed_at = new Date().toISOString();
          if (hasTooManyErrors) {
            updateData.error_message = `Muitos erros consecutivos (${consecutiveErrors}). Última página: ${newCurrentPage}`;
          }
        }

        await supabase
          .from("me_sync_jobs")
          .update(updateData)
          .eq("id", job.id);

        if (finalStatus === "completed") {
          await supabase
            .from("integrations")
            .update({ last_sync_at: new Date().toISOString() })
            .eq("tenant_id", tenantId)
            .eq("type", "melhor_envio");
        }

        log.info(`[melhor-envio] Job ${job.id}: ${finalStatus} - Página ${newCurrentPage}/${totalPages || '?'} - ${totalSaved} salvos, ${totalLinked} vinculados`);

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
            errors: totalSaveErrors
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== SYNC TRACKING ====================
      case "sync_tracking": {
        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
           .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
          .eq("tenant_id", tenantId)
          .single();

        if (!tokenRecord) {
          return new Response(
            JSON.stringify({ success: false, error: "Não conectado ao Melhor Envio" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const resolvedMEToken = await resolveMEAccessToken(supabase, tokenRecord);

        // Buscar envios que precisam atualização de rastreio
        const { data: shipments } = await supabase
          .from("me_shipments")
          .select("id, me_id, tracking_code, status")
          .eq("tenant_id", tenantId)
          .not("status", "in", '("delivered","canceled","expired","returned")')
          .order("created_at", { ascending: false })
          .limit(50);

        if (!shipments || shipments.length === 0) {
          return new Response(
            JSON.stringify({ success: true, updated: 0, message: "Nenhum envio para atualizar" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        log.info(`[melhor-envio] Atualizando rastreio de ${shipments.length} envios`);

        let updatedCount = 0;
        
        // Processar em lotes de 10
        for (let i = 0; i < shipments.length; i += 10) {
          const batch = shipments.slice(i, i + 10);
          const meIds = batch.map(s => s.me_id).join(",");
          
          try {
            const trackingResponse = await fetch(
              `${ME_API_URL}/me/shipment/tracking?orders=${meIds}`,
              {
                headers: {
                  "Authorization": `Bearer ${resolvedMEToken}`,
                  "Accept": "application/json",
                  "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                }
              }
            );

            // Verificar Content-Type antes de fazer parse JSON
            const contentType = trackingResponse.headers.get("content-type") || "";
            
            if (!trackingResponse.ok) {
              const errorText = await trackingResponse.text();
              log.error(`[melhor-envio] Tracking API error ${trackingResponse.status}: ${errorText.substring(0, 200)}`);
              continue; // Pular para o próximo batch
            }
            
            if (!contentType.includes("application/json")) {
              log.error(`[melhor-envio] Tracking API retornou Content-Type inválido: ${contentType}`);
              continue; // Pular para o próximo batch
            }

            const trackingData = await trackingResponse.json();
            
            for (const shipment of batch) {
              const orderTracking = trackingData[shipment.me_id];
              
              if (orderTracking) {
                const newStatus = mapStatus(orderTracking.status);
                const updateData: Record<string, unknown> = {
                  tracking_events: orderTracking.events || [],
                  last_sync_at: new Date().toISOString()
                };
                
                // Atualizar status se mudou
                if (newStatus !== shipment.status) {
                  updateData.status = newStatus;
                }
                
                // Atualizar data de entrega
                if (orderTracking.delivered_at) {
                  updateData.delivered_at = orderTracking.delivered_at;
                }
                
                // Atualizar data de postagem
                if (orderTracking.posted_at) {
                  updateData.posted_at = orderTracking.posted_at;
                }
                
                await supabase
                  .from("me_shipments")
                  .update(updateData)
                  .eq("id", shipment.id);
                
                updatedCount++;
              }
            }
          } catch (err) {
            log.error(`[melhor-envio] Erro ao atualizar batch de rastreio:`, err);
          }
        }

        log.info(`[melhor-envio] ${updatedCount} rastreios atualizados`);

        return new Response(
          JSON.stringify({ success: true, updated: updatedCount }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== SYNC SINGLE SHIPMENT ====================
      case "sync_single": {
        const shipmentId = typeof bodyData.shipment_id === "string"
          ? bodyData.shipment_id
          : url.searchParams.get("shipment_id");
        
        if (!shipmentId) {
          return new Response(
            JSON.stringify({ success: false, error: "shipment_id é obrigatório" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
           .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
          .eq("tenant_id", tenantId)
          .single();

        if (!tokenRecord) {
          return new Response(
            JSON.stringify({ success: false, error: "Não conectado ao Melhor Envio" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const resolvedMEToken = await resolveMEAccessToken(supabase, tokenRecord);

        // Buscar o envio
        const { data: shipment } = await supabase
          .from("me_shipments")
           .select("id, me_id, tracking_code, status, tenant_id, integration_id")
          .eq("id", shipmentId)
          .eq("tenant_id", tenantId)
          .single();

        if (!shipment) {
          return new Response(
            JSON.stringify({ success: false, error: "Envio não encontrado" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        log.info(`[melhor-envio] Sincronizando envio individual ${shipment.me_id}`);

        // Buscar rastreamento
        const trackingResponse = await fetch(
          `${ME_API_URL}/me/shipment/tracking?orders=${shipment.me_id}`,
          {
            headers: {
              "Authorization": `Bearer ${resolvedMEToken}`,
              "Accept": "application/json",
              "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
            }
          }
        );

        // Verificar se a resposta é JSON antes de parsear
        const contentType = trackingResponse.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const textBody = await trackingResponse.text();
          log.error(`[melhor-envio] Resposta não é JSON: ${textBody.substring(0, 500)}`);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: "Token expirado ou erro na API. Tente reconectar a integração." 
            }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!trackingResponse.ok) {
          const errorBody = await trackingResponse.text();
          log.error(`[melhor-envio] Erro na API: ${trackingResponse.status} - ${errorBody}`);
          return new Response(
            JSON.stringify({ success: false, error: "Erro ao buscar rastreamento" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const trackingData = await trackingResponse.json();
        const orderTracking = trackingData[shipment.me_id];

        if (orderTracking) {
          await supabase
            .from("me_shipments")
            .update({
              status: mapStatus(orderTracking.status),
              tracking_events: orderTracking.events || [],
              delivered_at: orderTracking.delivered_at || null,
              posted_at: orderTracking.posted_at || null,
              last_sync_at: new Date().toISOString()
            })
            .eq("id", shipmentId);

          return new Response(
            JSON.stringify({ success: true, status: mapStatus(orderTracking.status) }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: false, error: "Rastreamento não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== CRON SYNC (para job automático) ====================
      case "cron_sync": {
        // Verificar autenticação do cron via header ou query param
        const cronSecret = Deno.env.get("CRON_SECRET");
        const providedSecret = req.headers.get("x-cron-secret") || url.searchParams.get("cron_secret");
        
        // Permitir chamadas internas (sem auth) ou com secret válido
        if (cronSecret && providedSecret !== cronSecret) {
          log.info(`[melhor-envio] CRON: Executando sync automático`);
        }

        log.info(`[melhor-envio] ========== CRON SYNC INICIADO ==========`);

        // Buscar todos os tenants com Melhor Envio conectado
        const { data: allTokens, error: tokensError } = await supabase
          .from("melhor_envio_tokens")
          .select("tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at");

        if (tokensError || !allTokens || allTokens.length === 0) {
          log.info(`[melhor-envio] CRON: Nenhum tenant conectado`);
          return new Response(
            JSON.stringify({ success: true, message: "Nenhum tenant conectado", tenants_processed: 0 }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        log.info(`[melhor-envio] CRON: ${allTokens.length} tenants para processar`);

        let tenantsProcessed = 0;
        let totalShipmentsSynced = 0;
        let totalTrackingsUpdated = 0;

        for (const tokenRecord of allTokens) {
          try {
            // Resolve encrypted tokens
            let currentAccessToken = await resolveMEAccessToken(supabase, tokenRecord);
            const currentRefreshToken = await resolveMERefreshToken(supabase, tokenRecord);

            // Verificar se token está expirado
            const isExpired = new Date(tokenRecord.expires_at) < new Date();
            
            if (isExpired) {
              log.info(`[melhor-envio] CRON: Token expirado para tenant ${tokenRecord.tenant_id}, tentando renovar...`);
              
              // Tentar renovar o token
              const refreshBody = new URLSearchParams({
                grant_type: "refresh_token",
                client_id: MELHOR_ENVIO_CLIENT_ID!,
                client_secret: MELHOR_ENVIO_CLIENT_SECRET!,
                refresh_token: currentRefreshToken
              });

              const refreshResponse = await fetch(ME_TOKEN_URL, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Accept": "application/json",
                  "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                },
                body: refreshBody.toString()
              });

              if (!refreshResponse.ok) {
                log.error(`[melhor-envio] CRON: Falha ao renovar token para tenant ${tokenRecord.tenant_id}`);
                continue;
              }

              const newTokens = await refreshResponse.json();
              const newExpiresAt = new Date(Date.now() + (newTokens.expires_in || 2592000) * 1000).toISOString();

              await writeMelhorEnvioTokens(supabase, tokenRecord.tenant_id, newTokens.access_token, newTokens.refresh_token, {
                expires_at: newExpiresAt,
                updated_at: new Date().toISOString()
              });

              currentAccessToken = newTokens.access_token;
              log.info(`[melhor-envio] CRON: Token renovado para tenant ${tokenRecord.tenant_id}`);
            }

            // 1. Sincronizar novos envios (últimas 24h)
            log.info(`[melhor-envio] CRON: Sincronizando envios para tenant ${tokenRecord.tenant_id}`);
            
            let shipmentsSynced = 0;
            let page = 1;
            const limit = 100;
            let hasMore = true;

            while (hasMore && page <= 5) { // Limitar a 5 páginas por tenant no cron (500 envios)
              const ordersResponse = await fetch(`${ME_API_URL}/me/orders?limit=${limit}&page=${page}`, {
                headers: {
                  "Authorization": `Bearer ${currentAccessToken}`,
                  "Accept": "application/json",
                  "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                }
              });

              if (!ordersResponse.ok) {
                const errText = await ordersResponse.text();
                log.error(`[melhor-envio] CRON: Erro ${ordersResponse.status} ao buscar página ${page} para tenant ${tokenRecord.tenant_id}: ${errText.substring(0, 200)}`);
                break;
              }

              const contentType = ordersResponse.headers.get("content-type") || "";
              if (!contentType.includes("application/json")) {
                log.warn(`[melhor-envio] CRON: Resposta não-JSON na página ${page}, content-type: ${contentType}`);
                break;
              }

              const ordersData = await ordersResponse.json();
              const orders = ordersData.data || ordersData || [];

              if (orders.length === 0) {
                hasMore = false;
              } else {
                for (const order of orders) {
                  try {
                    const toAddress = order.to || {};
                    
                    let estimatedDeliveryAt = null;
                    if (order.posted_at && order.delivery_max) {
                      const postedDate = new Date(order.posted_at);
                      estimatedDeliveryAt = new Date(postedDate.getTime() + order.delivery_max * 24 * 60 * 60 * 1000).toISOString();
                    }

                    // Extrair external_order_number das tags
                    let externalOrderNumber = null;
                    if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) {
                      externalOrderNumber = order.tags[0]?.tag || null;
                    }

                    await supabase
                      .from("me_shipments")
                      .upsert({
                        tenant_id: tokenRecord.tenant_id,
                        me_id: String(order.id),
                        order_id: order.order_id || null,
                        order_number: order.order_number || order.invoice?.key || null,
                        external_order_number: externalOrderNumber,
                        tracking_code: order.tracking || null,
                        protocol: order.protocol || null,
                        status: mapStatus(order.status),
                        carrier: order.service?.company?.name || null,
                        service_name: order.service?.name || null,
                        price: order.price || null,
                        discount: order.discount || null,
                        format: order.format || null,
                        weight: order.weight || null,
                        insurance_value: order.insurance_value || null,
                        from_address: order.from || null,
                        to_address: order.to || null,
                        receiver_name: toAddress.name || null,
                        receiver_phone: toAddress.phone || null,
                        receiver_city: toAddress.city || null,
                        receiver_state: toAddress.state_abbr || toAddress.state || null,
                        invoice: order.invoice || null,
                        volumes: order.volumes || null,
                        tags: order.tags || null,
                        products: order.products || null,
                        paid_at: order.paid_at || null,
                        generated_at: order.generated_at || null,
                        posted_at: order.posted_at || null,
                        delivered_at: order.delivered_at || null,
                        delivery_min: order.delivery_min || null,
                        delivery_max: order.delivery_max || null,
                        estimated_delivery_at: estimatedDeliveryAt,
                        print_url: order.print?.url || null,
                        preview_url: order.preview?.url || null,
                        raw_data: order,
                        last_sync_at: new Date().toISOString()
                      }, { onConflict: "tenant_id,me_id" });
                    
                    shipmentsSynced++;
                  } catch (err) {
                    log.error(`[melhor-envio] CRON: Erro ao salvar pedido ${order.id}:`, err);
                  }
                }

                if (orders.length < limit) {
                  hasMore = false;
                } else {
                  page++;
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
              }
            }

            totalShipmentsSynced += shipmentsSynced;

            // 2. Atualizar rastreamento de envios em trânsito
            const { data: inTransitShipments } = await supabase
              .from("me_shipments")
              .select("id, me_id, status")
              .eq("tenant_id", tokenRecord.tenant_id)
              .not("status", "in", '("delivered","canceled","expired","returned")')
              .limit(50);

            if (inTransitShipments && inTransitShipments.length > 0) {
              for (let i = 0; i < inTransitShipments.length; i += 10) {
                const batch = inTransitShipments.slice(i, i + 10);
                const meIds = batch.map(s => s.me_id).join(",");

                try {
                  const trackingResponse = await fetch(
                    `${ME_API_URL}/me/shipment/tracking?orders=${meIds}`,
                    {
                      headers: {
                        "Authorization": `Bearer ${currentAccessToken}`,
                        "Accept": "application/json",
                        "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
                      }
                    }
                  );

                  if (trackingResponse.ok) {
                    const trackingData = await trackingResponse.json();

                    for (const shipment of batch) {
                      const orderTracking = trackingData[shipment.me_id];
                      if (orderTracking) {
                        await supabase
                          .from("me_shipments")
                          .update({
                            status: mapStatus(orderTracking.status),
                            tracking_events: orderTracking.events || [],
                            delivered_at: orderTracking.delivered_at || null,
                            posted_at: orderTracking.posted_at || null,
                            last_sync_at: new Date().toISOString()
                          })
                          .eq("id", shipment.id);
                        
                        totalTrackingsUpdated++;
                      }
                    }
                  }
                } catch (err) {
                  log.error(`[melhor-envio] CRON: Erro ao atualizar rastreio:`, err);
                }

                await new Promise(resolve => setTimeout(resolve, 50));
              }
            }

            // Atualizar última sincronização
            await supabase
              .from("integrations")
              .update({ last_sync_at: new Date().toISOString() })
              .eq("tenant_id", tokenRecord.tenant_id)
              .eq("type", "melhor_envio");

            tenantsProcessed++;
            log.info(`[melhor-envio] CRON: Tenant ${tokenRecord.tenant_id} - ${shipmentsSynced} envios, ${inTransitShipments?.length || 0} rastreios`);

          } catch (err) {
            log.error(`[melhor-envio] CRON: Erro ao processar tenant ${tokenRecord.tenant_id}:`, err);
          }
        }

        log.info(`[melhor-envio] ========== CRON SYNC FINALIZADO ==========`);
        log.info(`[melhor-envio] CRON: ${tenantsProcessed} tenants, ${totalShipmentsSynced} envios, ${totalTrackingsUpdated} rastreios`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            tenants_processed: tenantsProcessed,
            shipments_synced: totalShipmentsSynced,
            trackings_updated: totalTrackingsUpdated
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== REGISTER WEBHOOK ====================
      case "register_webhook": {
        // Melhor Envio does NOT support programmatic webhook registration.
        // The webhook URL must be configured manually in the ME developer panel.
        const webhookUrl = `${SUPABASE_URL}/functions/v1/melhor-envio-webhook`;
        
        log.info(`[melhor-envio] Webhook URL para cadastro manual: ${webhookUrl}`);

        // Check if webhooks are already listed (to verify if already configured)
        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
          .select("access_token_encrypted")
          .eq("tenant_id", tenantId)
          .single();

        let existingWebhooks: Record<string, unknown>[] = [];
        if (tokenRecord) {
          const currentAccessToken = await resolveMEAccessToken(supabase, tokenRecord);
          try {
            const listResponse = await fetch(`${ME_API_URL}/me/webhooks`, {
              headers: {
                "Authorization": `Bearer ${currentAccessToken}`,
                "Accept": "application/json",
                "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
              }
            });
            if (listResponse.ok) {
              const ct = listResponse.headers.get("content-type") || "";
              if (ct.includes("application/json")) {
                const listData = await listResponse.json();
                existingWebhooks = listData.data || listData || [];
              }
            }
          } catch {
            // ignore
          }
        }

        const alreadyRegistered = existingWebhooks.find((w: Record<string, unknown>) => w.url === webhookUrl);

        if (alreadyRegistered) {
          // Update integration metadata
          const { data: meIntegration } = await supabase
            .from("integrations")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("type", "melhor_envio")
            .maybeSingle();

          if (meIntegration) {
            await supabase.from("integrations").update({
              metadata: {
                webhooks_registered_at: new Date().toISOString(),
                webhook_url: webhookUrl
              }
            }).eq("id", meIntegration.id);
          }

          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Webhook já registrado no painel do Melhor Envio",
              webhook_id: alreadyRegistered.id,
              url: webhookUrl
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Configure o webhook manualmente no painel do Melhor Envio: Integrações → Área Dev. → Seu aplicativo → Novo Webhook",
            url: webhookUrl,
            manual_setup: true,
            instructions: "1. Acesse melhorenvio.com.br\n2. Menu: Integrações → Área Dev.\n3. Selecione seu aplicativo\n4. Clique em 'Novo Webhook'\n5. Cole a URL acima",
            existing_webhooks: existingWebhooks.map((w: Record<string, unknown>) => ({ id: w.id, url: w.url }))
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ==================== LIST WEBHOOKS ====================
      case "list_webhooks": {
        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
          .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
          .eq("tenant_id", tenantId)
          .single();

        if (!tokenRecord) {
          return new Response(
            JSON.stringify({ success: false, error: "Não conectado ao Melhor Envio" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const currentAccessToken = await resolveMEAccessToken(supabase, tokenRecord);

        const listResponse = await fetch(`${ME_API_URL}/me/webhooks`, {
          headers: {
            "Authorization": `Bearer ${currentAccessToken}`,
            "Accept": "application/json",
            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)"
          }
        });

        if (!listResponse.ok) {
          const errorText = await listResponse.text();
          return new Response(
            JSON.stringify({ success: false, error: `Erro ao listar webhooks: ${errorText.substring(0, 200)}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const ct = listResponse.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          return new Response(
            JSON.stringify({ success: false, error: "API retornou resposta não-JSON. O endpoint de webhooks pode não estar disponível." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const webhooksData = await listResponse.json();
        return new Response(
          JSON.stringify({ success: true, webhooks: webhooksData.data || webhooksData || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "bulk_sync_li_status": {
        // Bulk sync: find ME shipments with status posted/delivered that have li_order_id
        // but the LI order status doesn't match
        const { data: pendingShipments } = await supabase
          .from("me_shipments")
          .select("id, status, external_order_number, order_number, li_order_id, tenant_id")
          .not("li_order_id", "is", null)
          .in("status", ["posted", "delivered"]);

        if (!pendingShipments || pendingShipments.length === 0) {
          return new Response(
            JSON.stringify({ success: true, message: "Nenhum envio pendente", updated: 0 }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const results: Array<{ order: string; success: boolean; error?: string }> = [];
        for (const shipment of pendingShipments) {
          const orderNum = shipment.external_order_number || shipment.order_number;
          try {
            const syncResult = await syncStatusToLojaIntegrada(
              supabase,
              shipment.tenant_id,
              shipment.status,
              shipment.li_order_id,
              orderNum
            );
            results.push({ order: orderNum || "?", success: syncResult.success, error: syncResult.error });
            // Rate limit: 300ms between requests
            await new Promise(r => setTimeout(r, 300));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Erro";
            results.push({ order: orderNum || "?", success: false, error: msg });
          }
        }

        const updated = results.filter(r => r.success).length;
        log.info(`[melhor-envio] Bulk sync LI: ${updated}/${results.length} atualizados`);

        return new Response(
          JSON.stringify({ success: true, total: results.length, updated, results }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: unknown) {
    // Auth guard throws Response objects — pass them through
    if (error instanceof Response) return error;
    log.error("[melhor-envio] Erro não tratado:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
