-- Mesma regra de venda do dashboard (li_status_is_sale): pedido em separacao/preparacao nao some da economia do Google Ads.
CREATE OR REPLACE FUNCTION public.google_ads_crm_economics(p_account uuid, p_months integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_since timestamptz := now() - make_interval(months => LEAST(GREATEST(p_months, 3), 60));
  v_res jsonb;
  v_recon jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM google_ads_accounts WHERE id = p_account;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'conta nao encontrada'; END IF;

  WITH o AS (
    SELECT id, customer_id, created_at_remote,
      CASE WHEN public.li_status_is_sale(status_name) THEN 'valid'
           WHEN status_name = 'Pedido Cancelado' THEN 'cancelled'
           WHEN status_name LIKE 'Pagamento devolvido%' OR status_name LIKE '%chargeback%' THEN 'refunded'
           ELSE 'other' END AS kind,
      COALESCE((totals_json->>'subtotal')::numeric, 0) AS sub,
      COALESCE((totals_json->>'discount')::numeric, 0) AS disc,
      COALESCE((totals_json->>'shipping')::numeric, 0) AS ship,
      COALESCE((totals_json->>'total')::numeric, 0) AS tot,
      payment_json->>'method' AS pm
    FROM li_orders WHERE tenant_id = v_tenant AND created_at_remote >= v_since
  ),
  cogs AS (
    SELECT i.order_id, SUM(i.qty * COALESCE(p.cost_price, 0)) AS cogs, SUM(i.qty) AS units,
           SUM(i.qty) FILTER (WHERE p.cost_price IS NULL OR p.cost_price = 0) AS units_no_cost
    FROM li_order_items i
    LEFT JOIN li_products p ON p.loja_integrada_product_id = i.loja_integrada_product_id AND p.tenant_id = i.tenant_id
    WHERE i.tenant_id = v_tenant AND i.order_id IN (SELECT id FROM o WHERE kind = 'valid')
    GROUP BY 1
  ),
  v AS (SELECT o.*, c.cogs, c.units, c.units_no_cost FROM o JOIN cogs c ON c.order_id = o.id WHERE o.kind = 'valid'),
  cust AS (SELECT customer_id, COUNT(*) AS n FROM o WHERE kind = 'valid' AND customer_id IS NOT NULL GROUP BY 1)
  SELECT jsonb_build_object(
    'window_months', p_months,
    'orders_valid', (SELECT COUNT(*) FROM v),
    'orders_cancelled', (SELECT COUNT(*) FROM o WHERE kind = 'cancelled'),
    'orders_refunded', (SELECT COUNT(*) FROM o WHERE kind = 'refunded'),
    'revenue_valid', (SELECT ROUND(COALESCE(SUM(tot), 0), 2) FROM v),
    'revenue_refunded', (SELECT ROUND(COALESCE(SUM(tot), 0), 2) FROM o WHERE kind = 'refunded'),
    'avg_ticket', (SELECT ROUND(AVG(tot), 2) FROM v),
    'avg_discount', (SELECT ROUND(AVG(disc), 2) FROM v),
    'avg_shipping_charged', (SELECT ROUND(AVG(ship), 2) FROM v),
    'avg_units', (SELECT ROUND(AVG(units), 2) FROM v),
    'avg_cogs', (SELECT ROUND(AVG(cogs), 2) FROM v),
    'pct_units_without_cost', (SELECT ROUND(100.0 * SUM(units_no_cost) / NULLIF(SUM(units), 0), 1) FROM v),
    'product_margin_pct', (SELECT ROUND(100 * (1 - SUM(cogs) / NULLIF(SUM(sub - disc), 0)), 1) FROM v),
    'free_shipping_pct', (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE ship = 0) / NULLIF(COUNT(*), 0), 1) FROM v),
    'cancel_pct', (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE kind = 'cancelled') / NULLIF(COUNT(*) FILTER (WHERE kind IN ('valid','cancelled','refunded')), 0), 1) FROM o),
    'refund_pct', (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE kind = 'refunded') / NULLIF(COUNT(*) FILTER (WHERE kind IN ('valid','refunded')), 0), 1) FROM o),
    'repeat_pct', (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE n > 1) / NULLIF(COUNT(*), 0), 1) FROM cust),
    'payment_mix', COALESCE((SELECT jsonb_agg(jsonb_build_object('method', pm, 'pct', pct) ORDER BY pct DESC)
        FROM (SELECT COALESCE(pm, 'n/d') AS pm, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct FROM v GROUP BY 1) m), '[]'::jsonb)
  ) INTO v_res;

  -- Conciliacao mensal dos ultimos 12 meses: gasto/conversoes/valor do Google x pedidos validos do CRM.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'month', m.month, 'google_cost', ROUND(COALESCE(g.cost, 0), 2), 'google_conversions', ROUND(COALESCE(g.conv, 0), 1),
      'google_value', ROUND(COALESCE(g.val, 0), 2), 'crm_orders', m.orders, 'crm_revenue', ROUND(m.revenue, 2)
    ) ORDER BY m.month), '[]'::jsonb) INTO v_recon
  FROM (
    SELECT date_trunc('month', created_at_remote)::date AS month, COUNT(*) AS orders, SUM((totals_json->>'total')::numeric) AS revenue
    FROM li_orders
    WHERE tenant_id = v_tenant AND created_at_remote >= date_trunc('month', now()) - interval '11 months'
      AND public.li_status_is_sale(status_name)
    GROUP BY 1
  ) m
  LEFT JOIN (
    SELECT month, SUM(cost_micros) / 1e6 AS cost, SUM(conversions) AS conv, SUM(conversions_value) AS val
    FROM google_ads_account_monthly WHERE account_id = p_account GROUP BY 1
  ) g ON g.month = m.month;

  RETURN jsonb_build_object('metrics', v_res, 'reconciliation', v_recon);
END;
$function$

;
