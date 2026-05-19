import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "PONTOS";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cid = getCorrelationId(req);
  const log = createLogger("loyalty-redeem", cid);

  try {
    const { tenantId } = await requireUserAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { integrationId, customerExternalId, pointsToRedeem } = await req.json();

    if (!integrationId || !customerExternalId || !pointsToRedeem) {
      return new Response(JSON.stringify({ success: false, error: "integrationId, customerExternalId e pointsToRedeem são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (pointsToRedeem <= 0) {
      return new Response(JSON.stringify({ success: false, error: "pointsToRedeem deve ser positivo" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("integration_id", integrationId)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();

    if (!program) {
      return new Response(JSON.stringify({ success: false, error: "Programa de fidelidade não configurado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pointsToRedeem < program.min_points_redeem) {
      return new Response(JSON.stringify({ success: false, error: `Mínimo para resgate: ${program.min_points_redeem} pontos` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calcula saldo atual
    const { data: rows } = await supabase
      .from("loyalty_points")
      .select("points")
      .eq("integration_id", integrationId)
      .eq("tenant_id", tenantId)
      .eq("customer_external_id", customerExternalId);
    const balance = (rows || []).reduce((s, r) => s + r.points, 0);

    if (balance < pointsToRedeem) {
      return new Response(JSON.stringify({ success: false, error: `Saldo insuficiente (${balance} pontos disponíveis)` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca info do cliente para preencher o cupom
    const { data: customerRow } = await supabase
      .from("loyalty_points")
      .select("customer_name, customer_phone")
      .eq("integration_id", integrationId)
      .eq("customer_external_id", customerExternalId)
      .not("customer_name", "is", null)
      .limit(1)
      .maybeSingle();

    const couponValue = Math.round(pointsToRedeem * Number(program.points_to_brl) * 100) / 100;
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const couponCode = generateCouponCode();

    // Insere cupom em generated_coupons
    await supabase.from("generated_coupons").insert({
      tenant_id: tenantId,
      integration_id: integrationId,
      coupon_code: couponCode,
      discount_percentage: 0,
      coupon_value: couponValue,
      customer_name: customerRow?.customer_name || null,
      customer_phone: customerRow?.customer_phone || null,
      source: "loyalty",
      coupon_type: "valor_absoluto",
      coupon_description: `Resgate de ${pointsToRedeem} pontos`,
      expires_at: expiresAt,
      li_quantidade_usada: 0,
      li_quantidade_uso_maximo: 1,
    });

    // Debita pontos
    await supabase.from("loyalty_points").insert({
      tenant_id: tenantId,
      integration_id: integrationId,
      customer_external_id: customerExternalId,
      customer_name: customerRow?.customer_name || null,
      customer_phone: customerRow?.customer_phone || null,
      points: -pointsToRedeem,
      type: "redeem",
      description: `Resgate de cupom ${couponCode}`,
      coupon_code: couponCode,
    });

    log.info(`Redeemed ${pointsToRedeem} points → ${couponCode} (R$${couponValue})`);
    return new Response(
      JSON.stringify({ success: true, couponCode, couponValue, newBalance: balance - pointsToRedeem }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
