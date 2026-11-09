import { supabase } from "@/integrations/supabase/client";

/** Chama uma edge function do módulo Google Ads e devolve a mensagem útil do erro (o corpo traz { error }). */
export async function invokeGoogleAds(fn: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) msg = j.error;
      else if (j?.results?.length) msg = j.results.find((r: { ok: boolean; error?: string }) => !r.ok)?.error ?? msg;
    } catch { /* mantém a mensagem padrão */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
