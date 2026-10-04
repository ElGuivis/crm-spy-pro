import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

interface Candidate {
  w_id: string; tenant_id: string;
  a_id: string; a_subject: string; a_sent: number; a_opens: number; a_clicks: number;
  b_id: string; b_subject: string; b_sent: number; b_opens: number; b_clicks: number;
}

const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

/** Decide o vencedor de cada teste A/B pronto (maior taxa de abertura; empate: cliques; empate: A) e envia o assunto vencedor para o resto da lista. */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("email-ab-winner", getCorrelationId(req));

  try {
    await requireInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data, error } = await supabase.rpc("get_ab_winner_candidates");
    if (error) throw error;
    const results: unknown[] = [];

    for (const c of (data ?? []) as Candidate[]) {
      const aRate = rate(c.a_opens, c.a_sent), bRate = rate(c.b_opens, c.b_sent);
      const bWins = bRate > aRate || (bRate === aRate && rate(c.b_clicks, c.b_sent) > rate(c.a_clicks, c.a_sent));
      const winner = bWins ? "B" : "A";
      const detail = {
        a: { subject: c.a_subject, sent: c.a_sent, opens: c.a_opens, clicks: c.a_clicks, open_rate: Math.round(aRate * 1000) / 10 },
        b: { subject: c.b_subject, sent: c.b_sent, opens: c.b_opens, clicks: c.b_clicks, open_rate: Math.round(bRate * 1000) / 10 },
      };

      // reserva a decisão antes de enviar: se duas execuções se cruzarem, só uma continua
      const { data: claimed } = await supabase.from("email_campaigns")
        .update({ subject: winner === "B" ? c.b_subject : c.a_subject, ab_winner_variant: winner, ab_winner_decided_at: new Date().toISOString(), ab_winner_detail: detail })
        .eq("id", c.w_id).is("ab_winner_decided_at", null).eq("status", "draft").select("id").maybeSingle();
      if (!claimed) continue;

      log.info(`[AB-WINNER] ${c.w_id}: vence ${winner} (A ${detail.a.open_rate}% × B ${detail.b.open_rate}%)`);
      const res = await fetch(`${supabaseUrl}/functions/v1/email-campaign-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
        body: JSON.stringify({ campaign_id: c.w_id }),
        signal: AbortSignal.timeout(30_000),
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        log.error(`[AB-WINNER] envio do resto falhou (${res.status}): ${text.slice(0, 200)}`);
        // a campanha volta a ficar editável com o assunto vencedor; o erro aparece para o usuário
        await supabase.from("email_campaigns").update({ status: "error", error_message: `O vencedor foi ${winner}, mas o envio para o resto falhou: ${text.slice(0, 160)}. Reenvie pela lista de campanhas.` }).eq("id", c.w_id);
      }
      results.push({ campaign: c.w_id, winner, ok: res.ok });
    }
    return json({ success: true, decided: results.length, results });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[AB-WINNER]", error);
    return json({ success: false, error: (error as Error)?.message ?? "erro" }, 500);
  }
});
