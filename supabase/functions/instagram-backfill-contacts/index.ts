import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { resolveInstagramAccessToken } from "../_shared/ig-token-resolver.ts";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

async function fetchProfile(igsid: string, accessToken: string): Promise<{ name?: string; username?: string; profile_pic?: string } | null> {
  // Try Instagram Graph API first (works for IGSID lookups), then Facebook
  const hosts = ["graph.instagram.com", "graph.facebook.com"];
  
  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v21.0/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(accessToken)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.name || data.username) return data;
      } else {
        const body = await res.text();
        log.info(`[profile] ${host} returned ${res.status} for ${igsid}: ${body.substring(0, 100)}`);
      }
    } catch (e: unknown) {
      log.info(`[profile] ${host} error for ${igsid}: ${e.message}`);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-backfill-contacts", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    requireInternalAuth(req);
    const { channel_id } = await req.json();
    if (!channel_id) throw new Error("Missing channel_id");

    const { data: channel } = await supabase
      .from("instagram_channels")
      .select("id, access_token_encrypted, ig_user_id")
      .eq("id", channel_id)
      .single();

    if (!channel) throw new Error("Channel not found");

    const { accessToken } = await resolveInstagramAccessToken(channel.access_token_encrypted);

    const { data: contacts } = await supabase
      .from("instagram_contacts")
      .select("id, igsid")
      .eq("channel_id", channel_id)
      .is("display_name", null)
      .limit(50);

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ ok: true, updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    for (const contact of contacts) {
      const profile = await fetchProfile(contact.igsid, accessToken);
      if (profile) {
        await supabase.from("instagram_contacts").update({
          display_name: profile.name || profile.username,
          instagram_username: profile.username || null,
          profile_pic_url: profile.profile_pic || null,
          updated_at: new Date().toISOString(),
        }).eq("id", contact.id);
        updated++;
        log.info(`[backfill] ✅ Updated ${contact.igsid}: ${profile.name || profile.username}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    return new Response(JSON.stringify({ ok: true, updated, total: contacts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[backfill] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
