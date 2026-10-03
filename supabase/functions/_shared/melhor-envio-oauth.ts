import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
import { PRIMARY_FRONTEND_URL, isAllowedRedirectUrl } from "./frontend-config.ts";
import { writeMelhorEnvioTokens } from "./credential-helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ME_CLIENT_ID = Deno.env.get("MELHOR_ENVIO_CLIENT_ID")!;
const ME_CLIENT_SECRET = Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET")!;
const ME_ENVIRONMENT = Deno.env.get("MELHOR_ENVIO_ENVIRONMENT") || "production";
const ME_API_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/api/v2"
  : "https://melhorenvio.com.br/api/v2";
const ME_AUTH_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/oauth/authorize"
  : "https://melhorenvio.com.br/oauth/authorize";
const ME_TOKEN_URL = ME_ENVIRONMENT === "sandbox"
  ? "https://sandbox.melhorenvio.com.br/oauth/token"
  : "https://melhorenvio.com.br/oauth/token";

export interface RedirectCallbackOpts {
  supabase: ServiceClient;
  url: URL;
  log: ReturnType<typeof createLogger>;
}

export async function handleRedirectCallback(opts: RedirectCallbackOpts): Promise<Response> {
  const { supabase, url, log } = opts;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  log.info(`[melhor-envio] ========== REDIRECT CALLBACK ==========`);
  log.info(`[melhor-envio] Code: ${code ? code.substring(0, 30) + "..." : "NULO"}`);
  log.info(`[melhor-envio] State: ${state}`);

  let tenantId: string | null = null;
  let frontendUrl = PRIMARY_FRONTEND_URL;

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
      await supabase.from("oauth_states").delete().eq("state", state);
    } else {
      tenantId = oauthState.tenant_id;
      // Revalida: o estado pode ter sido gravado antes da validação existir
      if (oauthState.frontend_url && isAllowedRedirectUrl(oauthState.frontend_url)) frontendUrl = oauthState.frontend_url;
      await supabase.from("oauth_states").delete().eq("state", state);
      log.info(`[melhor-envio] Validated state - tenant: ${tenantId}, frontend: ${frontendUrl}`);
    }
  }

  if (!code || !tenantId) {
    return new Response(null, {
      status: 302,
      headers: { "Location": `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent("Código ou tenant inválido")}` },
    });
  }

  try {
    if (!ME_CLIENT_ID || !ME_CLIENT_SECRET) throw new Error("Credenciais do Melhor Envio não configuradas");

    const redirectUri = `${SUPABASE_URL}/functions/v1/melhor-envio?action=redirect_callback`;
    log.info(`[melhor-envio] Trocando code por tokens...`);

    const tokenResponse = await fetch(ME_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: ME_CLIENT_ID,
        client_secret: ME_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });

    const tokenText = await tokenResponse.text();
    log.info(`[melhor-envio] Token response status: ${tokenResponse.status}`);

    if (!tokenResponse.ok) {
      log.error(`[melhor-envio] Token error: ${tokenText}`);
      return new Response(null, {
        status: 302,
        headers: { "Location": `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent(`Erro OAuth: ${tokenText.substring(0, 100)}`)}` },
      });
    }

    const tokens = JSON.parse(tokenText);
    if (!tokens.access_token) {
      return new Response(null, {
        status: 302,
        headers: { "Location": `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent("Tokens inválidos")}` },
      });
    }

    const userResponse = await fetch(`${ME_API_URL}/me`, {
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Accept": "application/json",
        "User-Agent": "CRM SpyPro (suporte@spypro.com.br)",
      },
    });

    let userData = null;
    if (userResponse.ok) {
      userData = await userResponse.json();
      log.info(`[melhor-envio] Usuário conectado: ${userData.firstname} ${userData.lastname}`);
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 2592000) * 1000).toISOString();

    try {
      await writeMelhorEnvioTokens(supabase, tenantId, tokens.access_token, tokens.refresh_token, {
        expires_at: expiresAt,
        user_id: userData?.id?.toString(),
        user_name: userData ? `${userData.firstname} ${userData.lastname}` : null,
        user_email: userData?.email,
        environment: ME_ENVIRONMENT,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      log.error("[melhor-envio] Erro ao salvar tokens:", e);
      return new Response(null, {
        status: 302,
        headers: { "Location": `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent("Erro ao salvar tokens")}` },
      });
    }

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("type", "melhor_envio")
      .maybeSingle();

    const integrationMeta = {
      user_id: userData?.id,
      user_name: userData ? `${userData.firstname} ${userData.lastname}` : null,
      user_email: userData?.email,
      environment: ME_ENVIRONMENT,
    };

    if (existing) {
      await supabase.from("integrations").update({
        status: "connected",
        metadata: integrationMeta,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("integrations").insert({
        tenant_id: tenantId,
        type: "melhor_envio",
        name: "Melhor Envio",
        status: "connected",
        metadata: integrationMeta,
      });
    }

    log.info(`[melhor-envio] Tokens salvos com sucesso para tenant ${tenantId}`);
    log.info(`[melhor-envio] Webhook URL para cadastro manual no painel ME: ${SUPABASE_URL}/functions/v1/melhor-envio-webhook`);

    return new Response(null, {
      status: 302,
      headers: { "Location": `${frontendUrl}/integrations?status=ok&melhor_envio=connected` },
    });
  } catch (error: unknown) {
    log.error(`[melhor-envio] Erro no redirect_callback:`, error);
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(null, {
      status: 302,
      headers: { "Location": `${frontendUrl}/integrations?status=error&reason=${encodeURIComponent(msg)}` },
    });
  }
}

export interface AuthorizeOpts {
  supabase: ServiceClient;
  tenantId: string;
  userId: string | undefined;
  url: URL;
  bodyData: Record<string, unknown>;
  corsHeaders: Record<string, string>;
  log: ReturnType<typeof createLogger>;
}

export async function handleAuthorize(opts: AuthorizeOpts): Promise<Response> {
  const { supabase, tenantId, userId, url, bodyData, corsHeaders, log } = opts;

  const requestedFrontendUrl = typeof bodyData.frontend_url === "string"
    ? bodyData.frontend_url
    : (url.searchParams.get("frontend_url") || `${url.origin}`);
  // Só origens da allowlist: evita open redirect no callback do OAuth
  const frontendUrl = isAllowedRedirectUrl(requestedFrontendUrl) ? requestedFrontendUrl : PRIMARY_FRONTEND_URL;

  const stateValue = crypto.randomUUID();

  const { error: stateError } = await supabase.from("oauth_states").insert({
    state: stateValue,
    tenant_id: tenantId,
    user_id: userId,
    provider: "melhor_envio",
    frontend_url: frontendUrl,
    redirect_path: "/integrations",
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  if (stateError) {
    log.error("[melhor-envio] Error persisting OAuth state:", stateError);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to create OAuth state" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/melhor-envio?action=redirect_callback`;
  const scopes = [
    "cart-read", "cart-write",
    "companies-read", "companies-write",
    "coupons-read", "coupons-write",
    "notifications-read", "orders-read",
    "products-read", "products-write",
    "purchases-read",
    "shipping-calculate", "shipping-cancel", "shipping-checkout",
    "shipping-companies", "shipping-generate", "shipping-preview",
    "shipping-print", "shipping-share", "shipping-tracking",
    "ecommerce-shipping", "transactions-read", "users-read", "users-write",
    "webhooks-read", "webhooks-write",
  ].join(" ");

  const authUrl = `${ME_AUTH_URL}?${new URLSearchParams({
    client_id: ME_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state: stateValue,
  }).toString()}`;

  log.info(`[melhor-envio] Auth URL gerada para tenant ${tenantId}`);

  return new Response(
    JSON.stringify({ success: true, auth_url: authUrl }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
