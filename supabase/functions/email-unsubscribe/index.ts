import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

function htmlResponse(status: number, title: string, description: string) {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${title}</title></head><body style="margin:0;font-family:Arial,sans-serif;background:#ffffff;color:#111;"><main style="max-width:560px;margin:60px auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;"><h1 style="font-size:22px;margin:0 0 12px;">${title}</h1><p style="font-size:15px;line-height:1.6;margin:0;">${description}</p></main></body></html>`,
    { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } }
  );
}

serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("email-unsubscribe", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);
    let token = url.searchParams.get("token") || "";

    if (!token && req.method !== "GET") {
      const body = await req.json().catch(() => ({}));
      token = String(body?.token || "");
    }

    token = token.trim();
    if (!token) {
      return htmlResponse(400, "Link inválido", "Não foi possível identificar o descadastro. Solicite um novo link.");
    }

    const { data: unsubscribeToken, error: tokenError } = await supabase
      .from("email_unsubscribe_tokens")
      .select("id,tenant_id,campaign_id,recipient_email,recipient_name,used_at")
      .eq("id", token)
      .maybeSingle();

    if (tokenError || !unsubscribeToken) {
      return htmlResponse(404, "Link não encontrado", "Este link de descadastro não existe ou já expirou.");
    }

    const nowIso = new Date().toISOString();
    const normalizedEmail = (unsubscribeToken.recipient_email || "").trim().toLowerCase();

    const { data: existingSuppression } = await supabase
      .from("email_suppression_list")
      .select("id")
      .eq("tenant_id", unsubscribeToken.tenant_id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existingSuppression?.id) {
      await supabase
        .from("email_suppression_list")
        .update({
          reason: "unsubscribed",
          source: "unsubscribe_link",
          campaign_id: unsubscribeToken.campaign_id,
          updated_at: nowIso,
        })
        .eq("id", existingSuppression.id);
    } else {
      await supabase.from("email_suppression_list").insert({
        tenant_id: unsubscribeToken.tenant_id,
        email: normalizedEmail,
        reason: "unsubscribed",
        source: "unsubscribe_link",
        campaign_id: unsubscribeToken.campaign_id,
        metadata: {
          recipient_name: unsubscribeToken.recipient_name,
          token_id: unsubscribeToken.id,
        },
      });
    }

    const firstUnsubscribe = !unsubscribeToken.used_at;

    await supabase
      .from("email_unsubscribe_tokens")
      .update({ used_at: unsubscribeToken.used_at || nowIso })
      .eq("id", unsubscribeToken.id);

    await supabase.from("email_campaign_logs").insert({
      tenant_id: unsubscribeToken.tenant_id,
      campaign_id: unsubscribeToken.campaign_id,
      recipient_email: normalizedEmail,
      recipient_name: unsubscribeToken.recipient_name,
      event_type: "unsubscribe",
      status: "info",
      event_data: {
        source: "unsubscribe_link",
        first_unsubscribe: firstUnsubscribe,
      },
      is_test: false,
    });

    await supabase.from("email_events").insert({
      tenant_id: unsubscribeToken.tenant_id,
      campaign_id: unsubscribeToken.campaign_id,
      event_type: "unsubscribe",
      recipient_email: normalizedEmail,
      metadata: {
        source: "unsubscribe_link",
      },
      user_agent: req.headers.get("user-agent"),
      ip_address: req.headers.get("x-forwarded-for"),
    });

    if (firstUnsubscribe && unsubscribeToken.campaign_id) {
      // Atomic increment — single UPDATE avoids race conditions
      await supabase.rpc("increment_campaign_unsubscribed", {
        _campaign_id: unsubscribeToken.campaign_id,
        _tenant_id: unsubscribeToken.tenant_id,
      });
    }

    return htmlResponse(200, "Descadastro confirmado", "Você foi removido da lista desta campanha e não receberá novos envios deste endereço enquanto permanecer na lista de supressão.");
  } catch (error: unknown) {
    log.error("[EMAIL-UNSUBSCRIBE]", error);
    return htmlResponse(500, "Erro ao processar descadastro", "Não conseguimos concluir agora. Tente novamente em instantes.");
  }
});
