import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { sendEmail, getEmailConfig } from "../_shared/email-sender.ts";
import { generateEmailHtml } from "../_shared/email-html-generator.ts";
import { replaceVariables } from "../_shared/email-variable-replacer.ts";
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
      .select("id, tenant_id, subject, content_html, content_json, preheader, email_integration_id")
      .eq("id", campaign_id)
      .eq("tenant_id", tenantId)
      .single();

    if (campError || !campaign) {
      throw new Error("Campaign not found");
    }

    // Get email integration - prefer campaign's specific integration, fallback to most recent active
    let emailIntegration = null;
    if (campaign.email_integration_id) {
      const { data } = await supabase
        .from("email_integrations")
        .select("id, tenant_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_tls, sender_email, sender_name, reply_to, name, is_active")
        .eq("id", campaign.email_integration_id)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
      emailIntegration = data;
    }

    if (!emailIntegration) {
      const { data, error: intError } = await supabase
        .from("email_integrations")
        .select("id, tenant_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_tls, sender_email, sender_name, reply_to, name, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (intError || !data) {
        throw new Error("Nenhuma integração de e-mail ativa. Configure o SMTP primeiro.");
      }
      emailIntegration = data;
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
    const htmlContent = campaign.content_html || generateEmailHtml(campaign.content_json, campaign.preheader || undefined);

    // Sample data for test with a real-looking unsubscribe URL
    const sampleData = {
      first_name: "João",
      last_name: "Silva",
      email: "teste@example.com",
      phone: "(11) 99999-9999",
      company: "Empresa Teste",
      coupon_code: "TESTE10",
      unsubscribe_url: `${supabaseUrl}/functions/v1/email-unsubscribe?token=test-preview`,
    };

    const finalHtml = replaceVariables(htmlContent, sampleData);
    const finalSubject = replaceVariables(campaign.subject, sampleData);

    // Send to each test email
    const results = [];
    for (const email of test_emails) {
      const trimmedEmail = String(email).trim().toLowerCase();
      if (!trimmedEmail) continue;

      log.info(`[TEST] Sending to ${trimmedEmail}`);

      const result = await sendEmail(emailConfig, {
        to: trimmedEmail,
        subject: `[TESTE] ${finalSubject}`,
        text: "Versão de teste",
        html: finalHtml,
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
