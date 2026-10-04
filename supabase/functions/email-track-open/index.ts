import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { classifyOpen, firstIp } from "../_shared/email-bot-filter.ts";

// 1x1 transparent GIF
const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

const GIF_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

serve(async (req) => {
  const tokenId = new URL(req.url).searchParams.get("t");

  if (tokenId) {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: token } = await supabase
        .from("email_unsubscribe_tokens")
        .select("id, tenant_id, campaign_id, recipient_email, is_test")
        .eq("id", tokenId)
        .maybeSingle();

      if (token) {
        const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
        const userAgent = req.headers.get("user-agent");
        const bot = classifyOpen(userAgent, forwarded);
        // robô e teste não contam como abertura de cliente: tipo próprio, fora das métricas
        const eventType = token.is_test ? "test_open" : bot ? "bot_open" : "open";

        await Promise.all([
          supabase.from("email_events").insert({
            tenant_id: token.tenant_id,
            campaign_id: token.campaign_id,
            recipient_email: token.recipient_email,
            event_type: eventType,
            ip_address: firstIp(forwarded) || null,
            user_agent: userAgent,
            metadata: { source: "tracking_pixel", ...(bot ? { bot_reason: bot } : {}) },
          }),
          eventType === "open"
            ? supabase.from("email_unsubscribe_tokens").update({ last_opened_at: new Date().toISOString() }).eq("id", tokenId)
            : Promise.resolve(),
        ]);
      }
    } catch {
      // Silent fail — always return pixel
    }
  }

  return new Response(TRANSPARENT_GIF, { headers: GIF_HEADERS });
});
