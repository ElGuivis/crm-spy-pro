/**
 * Email sender utility using SMTP
 * Sends emails directly without n8n intermediary
 */

import { SMTPClient } from "https://deno.land/x/denomailer@1.4.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("email-sender", "shared");


export interface EmailSendResult {
  success: boolean;
  error?: string;
  attempts?: number;
}

export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  smtpTls: boolean;
  senderName: string;
  senderEmail?: string;
  replyTo?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send email via SMTP
 * Includes retry logic with exponential backoff
 */
export async function sendEmail(
  config: EmailConfig,
  message: EmailMessage,
  maxRetries: number = 3
): Promise<EmailSendResult> {
  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[EMAIL-SENDER] Attempt ${attempt}/${maxRetries} - Sending to ${message.to}`);
      log.info(`[EMAIL-SENDER] Config: host=${config.smtpHost}, port=${config.smtpPort}, secure=${config.smtpSecure}, tls=${config.smtpTls}`);

      // Direct SSL for port 465, STARTTLS auto-negotiated for port 587
      const isDirectSSL = config.smtpSecure === true || (config.smtpPort === 465);
      const securityMode = isDirectSSL ? "SSL" : (config.smtpTls ? "STARTTLS" : "PLAIN");
      log.info(`[EMAIL-SENDER] Security mode: ${securityMode} (port=${config.smtpPort})`);

      const client = new SMTPClient({
        connection: {
          hostname: config.smtpHost,
          port: config.smtpPort,
          tls: isDirectSSL,
          auth: {
            username: config.smtpUser,
            password: config.smtpPass,
          },
        },
      });

      const fromAddress = config.senderEmail 
        ? `${config.senderName} <${config.senderEmail}>`
        : `${config.senderName} <${config.smtpUser}>`;

      const sendOptions: Record<string, string | undefined> = {
        from: fromAddress,
        to: message.to,
        subject: message.subject,
        content: message.text,
        html: message.html || undefined,
      };

      if (config.replyTo) {
        sendOptions.replyTo = config.replyTo;
      }

      await client.send(sendOptions);
      await client.close();

      log.info(`[EMAIL-SENDER] ✅ Email sent successfully to ${message.to}`);
      
      return {
        success: true,
        attempts: attempt
      };

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      log.error(`[EMAIL-SENDER] Attempt ${attempt} failed:`, lastError);
      
      // Don't retry on authentication errors
      if (lastError.includes('authentication') || lastError.includes('auth')) {
        return {
          success: false,
          error: lastError,
          attempts: attempt
        };
      }
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      log.info(`[EMAIL-SENDER] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: maxRetries
  };
}

/**
 * Get email integration config for a tenant
 */
export async function getEmailConfig(
  supabase: ReturnType<typeof createClient>,
  emailIntegrationId: string
): Promise<{ config: EmailConfig | null; error?: string }> {
  const { data: emailData, error } = await supabase
    .from('email_integrations')
    .select('smtp_host, smtp_port, smtp_user, smtp_password_encrypted, smtp_secure, smtp_tls, sender_name, sender_email, reply_to, name')
    .eq('id', emailIntegrationId)
    .maybeSingle();

  if (error || !emailData) {
    return { config: null, error: 'Email integration not found' };
  }

  // Resolve SMTP password from encrypted column only
  let smtpPass: string | null = null;
  if (emailData.smtp_password_encrypted) {
    try {
      const { data: decrypted } = await supabase.rpc('decrypt_secret', { _ciphertext: emailData.smtp_password_encrypted });
      if (decrypted) smtpPass = decrypted;
    } catch (e) {
      log.error('[email-sender] Failed to decrypt SMTP password');
    }
  }

  if (!emailData.smtp_host || !emailData.smtp_user || !smtpPass) {
    return { config: null, error: 'Incomplete SMTP configuration' };
  }

  return {
    config: {
      smtpHost: emailData.smtp_host,
      smtpPort: emailData.smtp_port || 587,
      smtpUser: emailData.smtp_user,
      smtpPass,
      smtpSecure: emailData.smtp_secure ?? (emailData.smtp_port === 465),
      smtpTls: emailData.smtp_tls ?? (emailData.smtp_port !== 465),
      senderName: emailData.sender_name || emailData.name || 'Notificação',
      senderEmail: emailData.sender_email,
      replyTo: emailData.reply_to || undefined,
    }
  };
}
