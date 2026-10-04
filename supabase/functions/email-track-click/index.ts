import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { classifyClick, firstIp } from "../_shared/email-bot-filter.ts";

serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const tokenId = params.get("t");
  const rawUrl = params.get("url");

  if (!rawUrl) return new Response("Missing url parameter", { status: 400 });

  // Validate redirect URL — only allow http/https
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(decodeURIComponent(rawUrl));
    if (!["http:", "https:"].includes(redirectUrl.protocol)) {
      return new Response("Invalid redirect URL", { status: 400 });
    }
  } catch {
    return new Response("Invalid redirect URL", { status: 400 });
  }

  // Require a valid campaign token — prevents open redirect abuse
  if (!tokenId) return new Response("Missing tracking token", { status: 400 });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: token } = await supabase
      .from("email_unsubscribe_tokens")
      .select("id, tenant_id, campaign_id, recipient_email, is_test, created_at")
      .eq("id", tokenId)
      .maybeSingle();

    if (!token) return new Response("Invalid tracking token", { status: 403 });

    const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
    const userAgent = req.headers.get("user-agent");
    // teste não tem pressa mínima (a pessoa abre o próprio teste em segundos); robô e teste ficam fora das métricas
    const bot = token.is_test ? null : classifyClick(userAgent, token.created_at);
    const eventType = token.is_test ? "test_click" : bot ? "bot_click" : "click";

    await Promise.all([
      supabase.from("email_events").insert({
        tenant_id: token.tenant_id,
        campaign_id: token.campaign_id,
        recipient_email: token.recipient_email,
        event_type: eventType,
        link_url: redirectUrl.href,
        ip_address: firstIp(forwarded) || null,
        user_agent: userAgent,
        metadata: { source: "link_tracking", ...(bot ? { bot_reason: bot } : {}) },
      }),
      eventType === "click"
        ? supabase.from("email_unsubscribe_tokens").update({ last_clicked_at: new Date().toISOString() }).eq("id", tokenId)
        : Promise.resolve(),
    ]);
  } catch {
    return new Response("Invalid tracking token", { status: 403 });
  }

  return Response.redirect(redirectUrl.href, 302);
});
