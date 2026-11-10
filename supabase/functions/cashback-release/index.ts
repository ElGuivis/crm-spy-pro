// Cron (15 min): (1) libera créditos de cashback cuja carência venceu (li-cashback, modo credit_id) e
// (2) desativa cupons de cashback NÃO usados cujo pedido foi cancelado/devolvido depois da liberação (se a configuração pedir).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { deactivateLiCoupon } from "../_shared/li-coupons.ts";
import { isReversedStatus } from "../_shared/cashback-rules.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const BATCH = 10;
const DEADLINE_MS = 80_000;
const STUCK_MINUTES = 10;
const SWEEP_DAYS = 90;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("cashback-release", getCorrelationId(req));
  const started = Date.now();
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    requireInternalAuth(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // créditos que ficaram "liberando" (queda do runtime no meio) voltam para a fila
    await supabase.from("cashback_credits").update({ status: "pending" })
      .eq("status", "releasing").lt("updated_at", new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString());

    // 1) liberar créditos vencidos
    const { data: due } = await supabase.from("cashback_credits").select("id")
      .eq("status", "pending").lte("release_at", new Date().toISOString()).order("release_at").limit(BATCH);
    let released = 0, failed = 0;
    for (const c of (due ?? []) as { id: string }[]) {
      if (Date.now() - started > DEADLINE_MS) break;
      const res = await fetch(`${supabaseUrl}/functions/v1/li-cashback`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ credit_id: c.id }),
      }).catch(() => null);
      const body = res ? await res.json().catch(() => ({})) as { success?: boolean } : {};
      if (body.success) released++; else if (!res || !res.ok) failed++;
    }

    // 2) cupons liberados e não usados cujo pedido foi cancelado/devolvido
    let deactivated = 0;
    const since = new Date(Date.now() - SWEEP_DAYS * 86_400_000).toISOString();
    const { data: open } = await supabase.from("cashback_credits")
      .select("id, tenant_id, integration_id, order_number, coupon_id, config:cashback_configs(cancel_on_refund), coupon:generated_coupons!inner(id, li_coupon_id, used_at, li_ativo, coupon_code)")
      .eq("status", "released").is("coupon.used_at", null).gte("released_at", since).limit(200);
    type Open = { id: string; tenant_id: string; integration_id: string | null; order_number: string; config: { cancel_on_refund: boolean | null } | null; coupon: { id: string; li_coupon_id: number | null; li_ativo: boolean | null; coupon_code: string } };
    const candidates = ((open ?? []) as unknown as Open[]).filter((o) => o.config?.cancel_on_refund !== false && o.coupon?.li_ativo !== false && o.coupon?.li_coupon_id);
    if (candidates.length > 0) {
      const { data: orders } = await supabase.from("li_orders").select("tenant_id, order_number, status_name").in("order_number", candidates.map((c) => c.order_number));
      const status = new Map(((orders ?? []) as { tenant_id: string; order_number: string; status_name: string | null }[]).map((o) => [`${o.tenant_id}:${o.order_number}`, o.status_name]));
      const auths = new Map<string, string | null>();
      for (const c of candidates) {
        if (Date.now() - started > DEADLINE_MS) break;
        const st = status.get(`${c.tenant_id}:${c.order_number}`);
        if (!isReversedStatus(st)) continue;
        if (!auths.has(c.integration_id ?? "")) {
          const { data: integ } = await supabase.from("integrations").select("api_key").eq("id", c.integration_id ?? "").maybeSingle();
          auths.set(c.integration_id ?? "", integ?.api_key ? liAuthHeader(integ.api_key) : null);
        }
        const auth = auths.get(c.integration_id ?? "");
        if (!auth) continue;
        const r = await deactivateLiCoupon(auth, c.coupon.li_coupon_id!);
        if (!r.ok) { log.error(`[RELEASE] não desativou ${c.coupon.coupon_code}: ${r.status} ${r.error}`); continue; }
        await supabase.from("generated_coupons").update({ li_ativo: false }).eq("id", c.coupon.id);
        await supabase.from("cashback_reminders").update({ status: "skipped", error_message: "Cupom desativado (pedido cancelado/devolvido)" }).eq("coupon_id", c.coupon.id).eq("status", "pending");
        await supabase.from("cashback_credits").update({ status: "cancelled", skip_reason: `Pedido com status "${st}" depois da liberação: cupom desativado` }).eq("id", c.id);
        deactivated++;
      }
    }

    log.info(`[RELEASE] liberados=${released} falhas=${failed} desativados=${deactivated}`);
    return json({ success: true, released, failed, deactivated });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    log.error("[RELEASE]", message);
    return json({ success: false, error: message }, 500);
  }
});
