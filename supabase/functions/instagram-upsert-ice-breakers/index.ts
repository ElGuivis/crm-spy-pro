import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES as decryptToken } from "../_shared/ig-crypto.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-upsert-ice-breakers", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id, ice_breakers } = await req.json();
    if (!channel_id || !ice_breakers) throw new Error("Missing required fields");

    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const channel = await requireResource<{ id: string; tenant_id: string; access_token_encrypted: string; ig_user_id: string }>(
      supabase, "instagram_channels", channel_id, tenantId, req,
      "id, tenant_id, access_token_encrypted, ig_user_id"
    );
    const accessToken = await decryptToken(channel.access_token_encrypted, encryptionKey);

    // Format for Instagram API
    const formatted = ice_breakers
      .filter((ib: Record<string, unknown>) => ib.is_active && ib.text)
      .slice(0, 4)
      .map((ib: Record<string, unknown>) => ({
        question: ib.text,
        payload: `ICE_BREAKER_${ib.id || ib.sort_order}`,
      }));

    const resp = await fetch(
      `https://graph.instagram.com/v21.0/me/messenger_profile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          platform: "instagram",
          ice_breakers: formatted,
        }),
      }
    );

    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error?.message || "Failed to set ice breakers");

    // Save to DB
    for (const ib of ice_breakers) {
      if (ib.id) {
        await supabase.from("instagram_ice_breakers")
          .update({ text: ib.text, sort_order: ib.sort_order, is_active: ib.is_active })
          .eq("id", ib.id);
      } else {
        await supabase.from("instagram_ice_breakers").insert({
          tenant_id: tenantId,
          channel_id,
          text: ib.text,
          sort_order: ib.sort_order,
          is_active: ib.is_active ?? true,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[upsert-ice-breakers] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
