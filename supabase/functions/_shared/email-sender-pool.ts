/**
 * Envio em volume: uma conexão SMTP por "trabalhador", reaproveitada entre os e-mails (antes: conexão + TLS +
 * login a cada e-mail), com limite de envios por segundo e tentativa de novo só quando vale a pena.
 */
import { SMTPClient } from "https://deno.land/x/denomailer@1.4.0/mod.ts";
import { buildSafeMailOptions } from "./mime-safe.ts";
import type { EmailConfig, EmailMessage } from "./email-sender.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Distribui as saídas no tempo: no máximo `perSecond` envios por segundo somando todos os trabalhadores. */
export class RateLimiter {
  private next = 0;
  constructor(private perSecond: number) {}
  async wait(): Promise<void> {
    if (!this.perSecond || this.perSecond <= 0) return;
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + 1000 / this.perSecond;
    if (at > now) await sleep(at - now);
  }
}

/** 530/535 e "authentication": a senha ou o usuário SMTP estão errados — insistir só gasta a cota e a reputação. */
export const isAuthError = (msg: string) => /^\s*53[05]\b|authenticat/i.test(msg);
/** 5xx (exceto autenticação): o servidor recusou este destinatário; tentar de novo não adianta. */
export const isPermanentError = (msg: string) => /^\s*5\d\d\b/.test(msg) && !isAuthError(msg);

export interface PoolSendResult {
  success: boolean;
  error?: string;
  attempts: number;
  auth?: boolean;
  permanent?: boolean;
}

export class SmtpSession {
  private client: SMTPClient | null = null;
  constructor(private config: EmailConfig) {}

  private open(): SMTPClient {
    const isDirectSSL = this.config.smtpSecure === true || this.config.smtpPort === 465;
    return new SMTPClient({
      connection: {
        hostname: this.config.smtpHost,
        port: this.config.smtpPort,
        tls: isDirectSSL,
        auth: { username: this.config.smtpUser, password: this.config.smtpPass },
      },
    });
  }

  private async drop() {
    try { await this.client?.close(); } catch { /* conexão já caiu */ }
    this.client = null;
  }

  async send(sender: { email: string; name: string }, message: EmailMessage, maxAttempts = 3): Promise<PoolSendResult> {
    let lastError = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.client ??= this.open();
        const options = buildSafeMailOptions({
          from: `${sender.name} <${sender.email}>`,
          to: message.to, subject: message.subject, text: message.text, html: message.html,
          replyTo: this.config.replyTo, headers: message.headers,
        });
        await this.client.send(options as never);
        return { success: true, attempts: attempt };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Erro desconhecido no envio";
        await this.drop(); // a próxima tentativa abre uma conexão limpa
        if (isAuthError(lastError)) return { success: false, error: lastError, attempts: attempt, auth: true };
        if (isPermanentError(lastError)) return { success: false, error: lastError, attempts: attempt, permanent: true };
        if (attempt < maxAttempts) await sleep(attempt * 800);
      }
    }
    return { success: false, error: lastError, attempts: maxAttempts };
  }

  async close() { await this.drop(); }
}
