import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import type { Logger } from "../_shared/correlation.ts";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function verifyBlingSignature(rawBody: string, signature: string | null, secret: string, log: Logger): Promise<boolean> {
  if (!signature) { log.info('[Bling Webhook] Assinatura ausente'); return false; }
  const cleanSignature = signature.replace(/^sha256=/, '').toLowerCase();
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    const isValid = timingSafeEqual(cleanSignature, expectedSignature);
    if (!isValid) {
      log.info('[Bling Webhook] Assinatura inválida');
      log.info('[Bling Webhook] Esperado:', expectedSignature.substring(0, 16) + '...');
      log.info('[Bling Webhook] Recebido:', cleanSignature.substring(0, 16) + '...');
    }
    return isValid;
  } catch (error) { log.error('[Bling Webhook] Erro ao verificar assinatura:', error); return false; }
}

export function generateEventKey(payload: Record<string, unknown>): string {
  const companyId = payload.companyId || 'unknown';
  const resource = payload.resource || 'unknown';
  const action = payload.action || 'unknown';
  const occurredAt = payload.occurredAt || new Date().toISOString();
  const dataId = (payload.data as Record<string, unknown>)?.id || payload.id || 'unknown';
  return `${companyId}:${resource}:${action}:${occurredAt}:${dataId}`;
}

export async function getValidAccessToken(supabase: ServiceClient, tenantId: string, log: Logger): Promise<string | null> {
  try {
    const { data: connection, error } = await supabase
      .from('bling_connections')
      .select('id, access_token_encrypted, token_expires_at, refresh_token_encrypted')
      .eq('tenant_id', tenantId).eq('status', 'connected').maybeSingle();
    if (error || !connection) { log.info('[Bling Webhook] Conexão Bling não encontrada para tenant:', tenantId); return null; }
    const { readBlingTokens } = await import("../_shared/credential-helpers.ts");
    const tokens = await readBlingTokens(supabase, connection);
    if (!tokens) { log.info('[Bling Webhook] Nenhum token válido encontrado'); return null; }
    const expiresAt = new Date(connection.token_expires_at);
    if (expiresAt.getTime() - 5 * 60 * 1000 > Date.now()) return tokens.accessToken;
    log.info('[Bling Webhook] Token Bling pode estar expirado, tentando usar mesmo assim');
    return tokens.accessToken;
  } catch (err) { log.error('[Bling Webhook] Erro ao buscar token:', err); return null; }
}

export async function findIntegrationId(supabase: ServiceClient, tenantId: string): Promise<string | null> {
  const { data: integration } = await supabase
    .from('integrations').select('id').eq('tenant_id', tenantId).eq('type', 'bling').eq('is_active', true).maybeSingle();
  return integration?.id || null;
}
