import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { LI_API_BASE, liCouponToRow, UNLIMITED_USES, type LiCoupon } from "../_shared/li-coupons.ts";

// campos que a API não aceita de volta no PUT
const READ_ONLY = ["id", "resource_uri", "data_criacao", "data_modificacao", "quantidade_usada"];

/** Ativa/desativa um cupom da loja e ajusta validade ou limite de usos. Lê o cupom atual, muda só o pedido e devolve inteiro. */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("li-coupon-update", getCorrelationId(req));

  try {
    const { tenantId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json() as { integrationId?: string; couponId?: string; ativo?: boolean; validade?: string | null; quantidade?: number | null };
    if (!b.integrationId || !b.couponId) return json({ success: false, error: "integrationId e couponId são obrigatórios" }, 400);

    await requireResource(supabase, "integrations", b.integrationId, tenantId, req);
    const { data: integration } = await supabase.from("integrations").select("id, api_key, tenant_id").eq("id", b.integrationId).eq("tenant_id", tenantId).single();
    const { data: local } = await supabase.from("generated_coupons").select("id, li_coupon_id, coupon_code, source, used_at").eq("id", b.couponId).eq("tenant_id", tenantId).eq("integration_id", b.integrationId).single();
    if (!integration || !local?.li_coupon_id) return json({ success: false, error: "Cupom não encontrado na loja" }, 404);

    const auth = liAuthHeader(integration.api_key);
    const url = `${LI_API_BASE}/cupom/${local.li_coupon_id}`;
    const cur = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
    if (!cur.ok) return json({ success: false, error: `Não consegui ler o cupom na loja (${cur.status})` }, 502);
    const coupon = await cur.json() as Record<string, unknown>;

    const next: Record<string, unknown> = { ...coupon };
    for (const k of READ_ONLY) delete next[k];
    if (typeof b.ativo === "boolean") next.ativo = b.ativo;
    if (b.validade !== undefined) next.validade = b.validade ? `${b.validade}T23:59:59` : null;
    if (b.quantidade !== undefined) next.quantidade = b.quantidade ?? UNLIMITED_USES;

    const put = await fetch(url, { method: "PUT", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(next), signal: AbortSignal.timeout(20_000) });
    if (!put.ok) {
      const text = await put.text();
      log.error(`[COUPON-UPDATE] LI recusou: ${put.status} ${text.slice(0, 300)}`);
      return json({ success: false, error: `A loja recusou a alteração (${put.status}): ${text.slice(0, 200)}` }, 400);
    }

    // relê o resultado para refletir exatamente o que a loja guardou
    const after = await fetch(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
    const fresh = (after.ok ? await after.json() : { ...coupon, ...next }) as LiCoupon;
    const row = liCouponToRow(fresh, { tenantId: integration.tenant_id, integrationId: b.integrationId }, { source: local.source as string | null, used_at: local.used_at as string | null });
    await supabase.from("generated_coupons").update(row).eq("id", local.id);
    log.info(`[COUPON-UPDATE] ${local.coupon_code}: ativo=${fresh.ativo}`);
    return json({ success: true, ativo: fresh.ativo, validade: fresh.validade, quantidade: fresh.quantidade });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    log.error("[COUPON-UPDATE]", message);
    return json({ success: false, error: message }, 500);
  }
});
