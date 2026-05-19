import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

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

  if (tokenId) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: token } = await supabase
        .from("email_unsubscribe_tokens")
        .select("id, tenant_id, campaign_id, recipient_email")
        .eq("id", tokenId)
        .maybeSingle();

      if (token) {
        await Promise.all([
          supabase.from("email_events").insert({
            tenant_id: token.tenant_id,
            campaign_id: token.campaign_id,
            recipient_email: token.recipient_email,
            event_type: "click",
            link_url: redirectUrl.href,
            ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip"),
            user_agent: req.headers.get("user-agent"),
            metadata: { source: "link_tracking" },
          }),
          supabase
            .from("email_unsubscribe_tokens")
            .update({ last_clicked_at: new Date().toISOString() })
            .eq("id", tokenId),
        ]);
      }
    } catch {
      // Silent fail — always redirect
    }
  }

  return Response.redirect(redirectUrl.href, 302);
});
