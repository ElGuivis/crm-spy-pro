import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { sendEmail, getEmailConfig } from "../_shared/email-sender.ts";
import { injectPreheader, htmlToText, listUnsubscribeHeaders } from "../_shared/email-prepare.ts";
import { injectTracking } from "../_shared/email-tracking.ts";
import { replaceVariables } from "../_shared/email-variable-replacer.ts";
import { buildCartVars, type CartItem } from "../_shared/abandonment-render.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("email-campaign-send-test", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth via shared guard
    const { tenantId } = await requireUserAuth(req);

    // Parse request

    // Parse request
    const { campaign_id, test_emails } = await req.json();

    if (!campaign_id || !test_emails || !Array.isArray(test_emails)) {
      throw new Error("Invalid request parameters");
    }

    // Validate campaign belongs to tenant (IDOR protection)
    await requireResource(supabase, "email_campaigns", campaign_id, tenantId, req);

    // Limit test emails
    if (test_emails.length > 5) {
      throw new Error("Máximo de 5 e-mails de teste por vez");
    }

    // Get campaign
    const { data: campaign, error: campError } = await supabase
      .from("email_campaigns")
      .select("id, tenant_id, internal_name, subject, content_html, content_json, preheader, email_integration_id")
      .eq("id", campaign_id)
      .eq("tenant_id", tenantId)
      .single();

    if (campError || !campaign) {
      throw new Error("Campaign not found");
    }

    // Get email integration — campanha DEVE ter email_integration_id configurado
    if (!campaign.email_integration_id) {
      throw new Error(
        "Esta campanha não tem integração de e-mail configurada. Edite a campanha em Email Marketing e selecione uma integração SMTP no campo 'Integração SMTP' antes de enviar."
      );
    }

    const { data: emailIntegration } = await supabase
      .from("email_integrations")
      .select("id, tenant_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_tls, sender_email, sender_name, reply_to, name, is_active")
      .eq("id", campaign.email_integration_id)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    if (!emailIntegration) {
      throw new Error(
        "Integração de e-mail da campanha não encontrada ou inativa. Verifique a configuração SMTP em Email Marketing."
      );
    }

    // Get email config
    const { config: emailConfig, error: configError } = await getEmailConfig(
      supabase,
      emailIntegration.id
    );

    if (configError || !emailConfig) {
      throw new Error(configError || "Invalid email configuration");
    }

    // Generate HTML
    if (!campaign.content_html) {
      throw new Error("Esta campanha não tem conteúdo salvo. Abra a campanha no editor, confira o e-mail e salve antes de testar.");
    }
    const htmlContent = injectPreheader(campaign.content_html, campaign.preheader);

    // Sample data for test with a real-looking unsubscribe URL
    const sampleData = {
      first_name: "João",
      last_name: "Silva",
      email: "teste@example.com",
      phone: "(11) 99999-9999",
      company: "Empresa Teste",
      coupon_code: "TESTE10",
      coupon_value: "10%",
      coupon_expires: "31/12/2026",
      unsubscribe_url: "",
    };

    // E-mails de recuperação usam o carrinho da pessoa: no teste mostra um carrinho de exemplo com produtos reais da loja
    let cartSample = {};
    if (/\{\{\s*(cart_|product_)/.test(htmlContent)) {
      const { data: li } = await supabase.from("integrations").select("id, metadata").eq("tenant_id", tenantId).eq("type", "loja_integrada").limit(1).maybeSingle();
      const storeUrl = (li?.metadata as { store_url?: string } | null)?.store_url || "https://www.sualoja.com.br";
      const { data: prods } = li ? await supabase.from("li_products").select("loja_integrada_product_id, name, price, promotional_price, image_url, raw_json")
        .eq("integration_id", li.id).eq("active", true).not("image_url", "is", null).is("raw_json->>pai", null).order("updated_at_local", { ascending: false }).limit(2) : { data: [] };
      const items: CartItem[] = (prods ?? []).map((p, i) => ({
        product_id: Number(p.loja_integrada_product_id), quantity: i === 0 ? 1 : 2, name: String(p.name), variant: null,
        price: Number(p.promotional_price || p.price) || null, image: String(p.image_url).replace(/\/\d+x\d+\//, "/380x380/"),
        url: ((p.raw_json as Record<string, unknown> | null)?.url as string | undefined) ?? null,
      }));
      cartSample = buildCartVars(items.length ? items : [{ product_id: null, quantity: 1, name: "Produto de exemplo", variant: "Tamanho: M", price: 129.9, image: null, url: null }], 0, storeUrl);
    }

    const finalSubject = replaceVariables(campaign.subject, { ...sampleData, ...cartSample });

    // Send to each test email
    const results = [];
    for (const email of test_emails) {
      const trimmedEmail = String(email).trim().toLowerCase();
      if (!trimmedEmail) continue;

      log.info(`[TEST] Sending to ${trimmedEmail}`);

      // Token de TESTE por destinatário: o e-mail leva o mesmo rastreio do envio real (pixel e links), mas aberturas e cliques
      // viram test_open/test_click (não entram nas métricas) e o link de descadastro não descadastra ninguém de verdade.
      const testKey = `teste:${trimmedEmail}`;
      await supabase.from("email_unsubscribe_tokens").upsert(
        { tenant_id: tenantId, campaign_id: campaign.id, recipient_email: testKey, recipient_name: "Teste", is_test: true },
        { onConflict: "campaign_id,recipient_email", ignoreDuplicates: true },
      );
      const { data: tokenRow } = await supabase.from("email_unsubscribe_tokens").select("id").eq("campaign_id", campaign.id).eq("recipient_email", testKey).eq("is_test", true).maybeSingle();
      const unsubscribeUrl = tokenRow ? `${supabaseUrl}/functions/v1/email-unsubscribe?token=${tokenRow.id}` : "#";
      const personalized = replaceVariables(htmlContent, { ...sampleData, ...cartSample, unsubscribe_url: unsubscribeUrl });
      const finalHtml = tokenRow ? injectTracking(personalized, supabaseUrl, tokenRow.id, campaign.internal_name) : personalized;

      const result = await sendEmail(emailConfig, {
        to: trimmedEmail,
        subject: `[TESTE] ${finalSubject}`,
        text: htmlToText(personalized) || finalSubject,
        html: finalHtml,
        headers: listUnsubscribeHeaders(unsubscribeUrl),
      });

      results.push({
        email: trimmedEmail,
        success: result.success,
        error: result.error,
      });

      // Log in database
      await supabase.from("email_campaign_logs").insert({
        tenant_id: tenantId,
        campaign_id: campaign.id,
        recipient_email: trimmedEmail,
        recipient_name: "Teste",
        status: result.success ? "sent" : "failed",
        error_message: result.error,
        sent_at: result.success ? new Date().toISOString() : null,
        event_type: "test_send",
        event_data: { provider: "smtp" },
        is_test: true,
      });
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        sent: successCount,
        total: test_emails.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("[TEST-SEND-ERROR]", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
