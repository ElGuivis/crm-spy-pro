import { firstIp } from "./email-bot-filter.ts";

/** Só o que este módulo usa do cliente (evita conflito de genéricos entre versões do supabase-js). */
type Supabase = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** IP de quem chamou (primeiro do x-forwarded-for / cf-connecting-ip); "unknown" se não houver. */
export function clientIp(req: Request): string {
  return firstIp(req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip")) || "unknown";
}

/**
 * Limite de taxa por chave em janela fixa (check_rate_limit). `true` = pode seguir.
 * Falha ABERTA: se o banco não responder, o endpoint continua funcionando (descadastro e links nunca podem quebrar por causa disto).
 * increment=false só consulta, sem contar.
 */
export async function withinRateLimit(supabase: Supabase, bucket: string, max: number, windowSeconds: number, increment = true): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds, p_increment: increment });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
