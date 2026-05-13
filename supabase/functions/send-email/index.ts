import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SMTPClient } from "https://deno.land/x/denomailer@1.4.0/mod.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { resolveSmtpPassword } from "../_shared/smtp-password-resolver.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

interface SendEmailRequest {
  email_integration_id: string;
  email_para: string;
  assunto: string;
  mensagem: string;
  mensagem_html?: string;
  remetente_nome?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cid = getCorrelationId(req);
  const log = createLogger("send-email", cid);

  try {
    // Auth via shared guard
    const { tenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const {
      email_integration_id,
      email_para,
      assunto,
      mensagem,
      mensagem_html,
      remetente_nome,
    }: SendEmailRequest = await req.json();

    if (!email_integration_id) {
      return new Response(
        JSON.stringify({ status: "erro", mensagem: "email_integration_id é obrigatório" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!email_para || !assunto || !mensagem) {
      return new Response(
        JSON.stringify({ status: "erro", mensagem: "Destinatário, assunto e mensagem são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await requireResource(supabaseService, "email_integrations", email_integration_id, tenantId, req);

    const { data: ei, error: integrationError } = await supabaseService
      .from("email_integrations")
      .select("id, tenant_id, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_tls, sender_email, sender_name, reply_to, name, is_active")
      .eq("id", email_integration_id)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .single();

    if (integrationError || !ei) {
      return new Response(
        JSON.stringify({ status: "erro", mensagem: "Integração de email não encontrada ou inativa" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determine security mode based on port and flags
    // Port 465 = Direct SSL/TLS (tls: true)
    // Port 587 = STARTTLS (tls: false, denomailer auto-negotiates STARTTLS)
    // Port 25 = Plain (tls: false)
    const isDirectSSL = ei.smtp_secure === true || (ei.smtp_secure === null && ei.smtp_port === 465);
    const securityMode = isDirectSSL ? "SSL" : (ei.smtp_tls ? "STARTTLS" : "PLAIN");

    log.info(`[${tenantId}] Sending to ${email_para} via ${ei.smtp_host}:${ei.smtp_port} (mode=${securityMode})`);
    log.info(`[${tenantId}] Sender: ${ei.sender_email}, smtp_user: ${ei.smtp_user}`);

    const client = new SMTPClient({
      connection: {
        hostname: ei.smtp_host,
        port: ei.smtp_port,
        tls: isDirectSSL,
        auth: {
          username: ei.smtp_user,
          password: await resolveSmtpPassword(supabaseService, ei),
        },
      },
    });

    const senderName = remetente_nome || ei.sender_name || ei.name || "Sistema";
    const fromEmail = ei.sender_email || ei.smtp_user;
    const sendOptions: Record<string, unknown> = {
      from: `${senderName} <${fromEmail}>`,
      to: email_para,
      subject: assunto,
      content: mensagem,
      html: mensagem_html || undefined,
    };

    if (ei.reply_to) {
      sendOptions.replyTo = ei.reply_to;
    }

    await client.send(sendOptions);
    await client.close();

    log.info(`[${tenantId}] ✅ Email accepted by SMTP server for ${email_para}`);

    // Return diagnostic info
    return new Response(
      JSON.stringify({
        status: "ok",
        enviado: true,
        diagnostico: {
          smtp_host: ei.smtp_host,
          smtp_port: ei.smtp_port,
          security_mode: securityMode,
          sender_email: fromEmail,
          destinatario: email_para,
          nota: "O servidor SMTP aceitou o e-mail. Se não chegar, verifique: 1) Modo Sandbox do SES (apenas destinatários verificados recebem) 2) Domínio/remetente verificado no provedor 3) Pasta de spam do destinatário 4) SPF/DKIM/DMARC do domínio",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    // Auth guard throws Response objects — pass them through
    if (error instanceof Response) return error;
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("Erro ao enviar email:", error);
    return new Response(
      JSON.stringify({
        status: "erro",
        mensagem: errMsg,
        dica: errMsg?.includes("auth")
          ? "Verifique as credenciais SMTP (usuário e senha)."
          : errMsg?.includes("connect")
          ? "Não foi possível conectar ao servidor SMTP. Verifique host, porta e modo de segurança (SSL/STARTTLS)."
          : "Erro inesperado ao enviar. Verifique os logs para mais detalhes.",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
