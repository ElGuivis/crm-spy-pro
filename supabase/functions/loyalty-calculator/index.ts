import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const cid = getCorrelationId(req);
  const log = createLogger("loyalty-calculator", cid);

  try {
    await requireUserOrInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { integrationId, since } = await req.json();
    if (!integrationId) {
      return new Response(JSON.stringify({ success: false, error: "integrationId obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: program } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("integration_id", integrationId)
      .eq("is_active", true)
      .maybeSingle();

    if (!program) {
      return new Response(JSON.stringify({ success: false, error: "Programa de fidelidade não configurado ou inativo" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integration } = await supabase
      .from("integrations")
      .select("id, tenant_id, type")
      .eq("id", integrationId)
      .single();
    if (!integration) {
      return new Response(JSON.stringify({ success: false, error: "Integração não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = integration.tenant_id;
    const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // IDs de pedidos já creditados (dedup)
    const { data: credited } = await supabase
      .from("loyalty_points")
      .select("order_id")
      .eq("integration_id", integrationId)
      .eq("type", "earn")
      .not("order_id", "is", null);
    const creditedSet = new Set((credited || []).map((e) => String(e.order_id)));

    // Segmentos champion para multiplicador
    const { data: champions } = await supabase
      .from("customer_rfm_snapshots")
      .select("customer_id, customer_name")
      .eq("integration_id", integrationId)
      .eq("segment_name", "Champions");
    const championIds = new Set((champions || []).map((c) => String(c.customer_id)));

    type OrderRow = {
      orderId: string;
      customerKey: string;
      customerId: string | null;
      customerName: string | null;
      customerPhone: string | null;
      total: number;
    };

    let orders: OrderRow[] = [];

    if (integration.type === "bling") {
      const { data: rows } = await supabase
        .from("bling_orders")
        .select("bling_order_id, customer_name, customer_phone, total_value, situation")
        .eq("integration_id", integrationId)
        .in("situation", ["Em aberto", "Atendido", "Faturado"])
        .gte("created_at", sinceDate)
        .limit(1000);
      orders = (rows || []).map((o) => ({
        orderId: String(o.bling_order_id),
        customerKey: o.customer_phone || o.customer_name || "",
        customerId: null,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        total: Number(o.total_value || 0),
      }));
    } else {
      const { data: rows } = await supabase
        .from("li_orders")
        .select("loja_integrada_order_id, customer_name, customer_phone, valor_total, customer_id")
        .eq("integration_id", integrationId)
        .gte("created_at", sinceDate)
        .limit(1000);
      orders = (rows || []).map((o) => ({
        orderId: String(o.loja_integrada_order_id),
        customerKey: o.customer_phone || o.customer_name || String(o.customer_id || ""),
        customerId: o.customer_id ? String(o.customer_id) : null,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        total: Number(o.valor_total || 0),
      }));
    }

    const toInsert: Record<string, unknown>[] = [];
    for (const order of orders) {
      if (!order.customerKey || order.total <= 0) continue;
      if (creditedSet.has(order.orderId)) continue;

      // Match champion by UUID (LI) or by phone/name key (Bling fallback)
      const isChampion = championIds.has(order.customerKey) || (order.customerId ? championIds.has(order.customerId) : false);
      const multiplier = isChampion ? Number(program.champion_multiplier) : 1;
      const points = Math.floor(order.total * Number(program.points_per_brl) * multiplier);
      if (points <= 0) continue;

      toInsert.push({
        tenant_id: tenantId,
        integration_id: integrationId,
        customer_external_id: order.customerKey,
        customer_name: order.customerName,
        customer_phone: order.customerPhone,
        points,
        type: "earn",
        description: `Pedido #${order.orderId}${isChampion ? ` (+${multiplier}x Champion)` : ""}`,
        order_id: order.orderId,
      });
    }

    if (toInsert.length > 0) {
      await supabase.from("loyalty_points").insert(toInsert);
    }

    log.info(`Credited ${toInsert.length} new entries from ${orders.length} orders`);
    return new Response(
      JSON.stringify({ success: true, credited: toInsert.length, scanned: orders.length }),
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
