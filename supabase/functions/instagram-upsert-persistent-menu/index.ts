import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptTokenAES as decryptToken } from "../_shared/ig-crypto.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-upsert-persistent-menu", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { channel_id, menu_items } = await req.json();
    if (!channel_id || !menu_items) throw new Error("Missing required fields");

    // Validate channel belongs to tenant (IDOR protection via requireResource)
    const channel = await requireResource<{
      id: string; tenant_id: string; access_token_encrypted: string; ig_user_id: string;
    }>(
      supabase, "instagram_channels", channel_id, tenantId, req,
      "id, tenant_id, access_token_encrypted, ig_user_id"
    );

    const encryptionKey = Deno.env.get("IG_TOKEN_ENCRYPTION_KEY") || Deno.env.get("INSTAGRAM_APP_SECRET")!;
    const accessToken = await decryptToken(channel.access_token_encrypted, encryptionKey);

    // Format for Instagram API
    const formatted = menu_items
      .filter((m: Record<string, unknown>) => m.is_active && m.label)
      .map((m: Record<string, unknown>) => ({
        type: "postback",
        title: m.label,
        payload: m.action_payload || `MENU_${m.sort_order}`,
      }));

    // Set persistent menu via Messenger Profile API
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
          persistent_menu: [
            {
              locale: "default",
              call_to_actions: formatted,
            },
          ],
        }),
      }
    );

    const result = await resp.json();

    // Save to DB
    await supabase
      .from("instagram_persistent_menu_items")
      .delete()
      .eq("channel_id", channel_id);

    if (menu_items.length > 0) {
      await supabase.from("instagram_persistent_menu_items").insert(
        menu_items.map((m: Record<string, unknown>, i: number) => ({
          tenant_id: channel.tenant_id,
          channel_id,
          label: m.label,
          action_type: m.action_type || "postback",
          action_payload: m.action_payload || `MENU_${i}`,
          flow_id: m.flow_id || null,
          sort_order: i,
          is_active: m.is_active ?? true,
        }))
      );
    }

    return new Response(JSON.stringify({ ok: true, api_result: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[upsert-persistent-menu] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
