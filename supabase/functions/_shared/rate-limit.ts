import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { firstIp } from "./email-bot-filter.ts";

type Supabase = ReturnType<typeof createClient>;

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
