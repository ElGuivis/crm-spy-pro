import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { syncStatusToLojaIntegrada } from "../_shared/li-status-sync.ts";
import { readMelhorEnvioTokens, writeMelhorEnvioTokens } from "../_shared/credential-helpers.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { handleRedirectCallback, handleAuthorize } from "../_shared/melhor-envio-oauth.ts";
import { handleSyncShipments } from "../_shared/melhor-envio-sync-shipments.ts";
import { handleSyncTracking, handleSyncSingle } from "../_shared/melhor-envio-tracking.ts";
import { handleCronSync } from "../_shared/melhor-envio-cron.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ME_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "production";
const ME_CLIENT_ID = Deno.env.get("MELHOR_ENVIO_CLIENT_ID")!;
const ME_CLIENT_SECRET = Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET")!;
const ME_TOKEN_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/oauth/token"
  : "https://melhorenvio.com.br/oauth/token";

serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("melhor-envio", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  let action = url.searchParams.get("action");

  let bodyData: Record<string, unknown> = {};
  if (!action && req.method === "POST") {
    try {
      bodyData = await req.clone().json();
      if (bodyData?.action) action = String(bodyData.action);
    } catch {
      // body empty or not JSON
    }
  }

  log.info(`[melhor-envio] Action: ${action}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // STATE-BASED: redirect_callback has no JWT — auth via oauth_states DB record
  if (action === "redirect_callback") {
    return handleRedirectCallback({ supabase, url, log });
  }

  try {
    if (!ME_CLIENT_ID || !ME_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais do Melhor Envio não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { requireUserAuth, requireUserOrInternalAuth } = await import("../_shared/auth-guard.ts");
    let userId: string | undefined;
    let tenantId: string;

    if (action === "sync_shipments") {
      const auth = await requireUserOrInternalAuth(req);
      if (auth.isInternal) {
        const bodyTenant = typeof bodyData.tenantId === "string" ? bodyData.tenantId : null;
        if (!bodyTenant) {
          return new Response(
            JSON.stringify({ error: "tenantId required for internal call" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        tenantId = bodyTenant;
      } else {
        userId = auth.userId;
        tenantId = auth.tenantId!;
      }
    } else {
      const auth = await requireUserAuth(req);
      userId = auth.userId;
      tenantId = auth.tenantId;
    }

    switch (action) {
      case "authorize":
        return handleAuthorize({ supabase, tenantId, userId, url, bodyData, corsHeaders, log });

      case "callback":
        return new Response(
          JSON.stringify({ success: false, error: "Este endpoint está deprecated." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );

      case "status": {
        const { data: rec, error: tokenError } = await supabase
          .from("melhor_envio_tokens")
          .select("id, user_id, user_name, user_email, expires_at")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (tokenError) {
          return new Response(
            JSON.stringify({ success: false, error: "Erro ao buscar status" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (!rec) {
          return new Response(
            JSON.stringify({ success: true, connected: false, expired: false, user: null, expires_at: null }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            connected: true,
            expired: new Date(rec.expires_at) < new Date(),
            user: rec.user_name ? { id: rec.user_id, name: rec.user_name, email: rec.user_email } : null,
            expires_at: rec.expires_at,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "refresh": {
        const { data: rec, error: tokenError } = await supabase
          .from("melhor_envio_tokens")
          .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, expires_at")
          .eq("tenant_id", tenantId)
          .single();

        if (tokenError || !rec) {
          return new Response(
            JSON.stringify({ success: false, error: "Tokens não encontrados" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const resolvedTokens = await readMelhorEnvioTokens(supabase, rec);
        const refreshToken = resolvedTokens?.refreshToken || "";

        log.info(`[melhor-envio] Renovando token para tenant ${tenantId}`);

        const refreshResponse = await fetch(ME_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: ME_CLIENT_ID,
            client_secret: ME_CLIENT_SECRET,
            refresh_token: refreshToken,
          }).toString(),
        });

        const refreshText = await refreshResponse.text();
        if (!refreshResponse.ok) {
          return new Response(
            JSON.stringify({ success: false, error: `Erro ao renovar tokens: ${refreshText}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const newTokens = JSON.parse(refreshText);
        const newExpiresAt = new Date(Date.now() + (newTokens.expires_in || 2592000) * 1000).toISOString();
        await writeMelhorEnvioTokens(supabase, tenantId, newTokens.access_token, newTokens.refresh_token, {
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        });

        log.info(`[melhor-envio] Token renovado com sucesso`);
        return new Response(
          JSON.stringify({ success: true, expires_at: newExpiresAt }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "disconnect": {
        await supabase.from("melhor_envio_tokens").delete().eq("tenant_id", tenantId);
        await supabase.from("integrations").delete().eq("tenant_id", tenantId).eq("type", "melhor_envio");
        log.info(`[melhor-envio] Desconectado para tenant ${tenantId}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "sync_shipments":
        return handleSyncShipments({ supabase, tenantId, bodyData, corsHeaders, log });

      case "sync_tracking":
        return handleSyncTracking({ supabase, tenantId, corsHeaders, log });

      case "sync_single":
        return handleSyncSingle({ supabase, tenantId, bodyData, url, corsHeaders, log });

      case "cron_sync":
        return handleCronSync({ supabase, corsHeaders, log });

      case "register_webhook": {
        const webhookUrl = `${SUPABASE_URL}/functions/v1/melhor-envio-webhook`;
        log.info(`[melhor-envio] Webhook URL para cadastro manual: ${webhookUrl}`);

        const { data: tokenRecord } = await supabase
          .from("melhor_envio_tokens")
          .select("access_token_encrypted")
          .eq("tenant_id", tenantId)
          .single();

        let existingWebhooks: Record<string, unknown>[] = [];
        if (tokenRecord) {
          const resolvedTokens = await readMelhorEnvioTokens(supabase, tokenRecord);
          const currentToken = resolvedTokens?.accessToken || "";
          try {
            const listResponse = await fetch(`${Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") === "sandbox" ? "https://sandbox.melhorenvio.com.br/api/v2" : "https://melhorenvio.com.br/api/v2"}/me/webhooks`, {
              headers: {
                "Authorization": `Bearer ${currentToken}`,
                "Accept": "application/json",
                "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
              },
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

        const alreadyRegistered = existingWebhooks.find(w => w.url === webhookUrl);
        if (alreadyRegistered) {
          const { data: meIntegration } = await supabase
            .from("integrations")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("type", "melhor_envio")
            .maybeSingle();
          if (meIntegration) {
            await supabase.from("integrations").update({
              metadata: { webhooks_registered_at: new Date().toISOString(), webhook_url: webhookUrl },
            }).eq("id", meIntegration.id);
          }
          return new Response(
            JSON.stringify({ success: true, message: "Webhook já registrado no painel do Melhor Envio", webhook_id: alreadyRegistered.id, url: webhookUrl }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Configure o webhook manualmente no painel do Melhor Envio: Integrações → Área Dev. → Seu aplicativo → Novo Webhook",
            url: webhookUrl,
            manual_setup: true,
            instructions: "1. Acesse melhorenvio.com.br\n2. Menu: Integrações → Área Dev.\n3. Selecione seu aplicativo\n4. Clique em 'Novo Webhook'\n5. Cole a URL acima",
            existing_webhooks: existingWebhooks.map(w => ({ id: w.id, url: w.url })),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "list_webhooks": {
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

        const resolvedTokens = await readMelhorEnvioTokens(supabase, tokenRecord);
        const currentToken = resolvedTokens?.accessToken || "";
        const apiUrl = ME_ENVIRONMENT === "sandbox"
          ? "https://sandbox.melhorenvio.com.br/api/v2"
          : "https://melhorenvio.com.br/api/v2";

        const listResponse = await fetch(`${apiUrl}/me/webhooks`, {
          headers: {
            "Authorization": `Bearer ${currentToken}`,
            "Accept": "application/json",
            "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
          },
        });

        if (!listResponse.ok) {
          const errorText = await listResponse.text();
          return new Response(
            JSON.stringify({ success: false, error: `Erro ao listar webhooks: ${errorText.substring(0, 200)}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const ct = listResponse.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          return new Response(
            JSON.stringify({ success: false, error: "API retornou resposta não-JSON." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        const webhooksData = await listResponse.json();
        return new Response(
          JSON.stringify({ success: true, webhooks: webhooksData.data || webhooksData || [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      case "bulk_sync_li_status": {
        const { data: pendingShipments } = await supabase
          .from("me_shipments")
          .select("id, status, external_order_number, order_number, li_order_id, tenant_id")
          .not("li_order_id", "is", null)
          .in("status", ["posted", "delivered"]);

        if (!pendingShipments || pendingShipments.length === 0) {
          return new Response(
            JSON.stringify({ success: true, message: "Nenhum envio pendente", updated: 0 }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
              orderNum,
            );
            results.push({ order: orderNum || "?", success: syncResult.success, error: syncResult.error });
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
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[melhor-envio] Erro não tratado:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
