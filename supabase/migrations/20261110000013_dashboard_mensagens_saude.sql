-- 1) get_dashboard_stats contava mensagens com direction 'outgoing'/'incoming', mas o banco grava 'outbound'/'inbound': os cards de mensagens ficavam sempre em 0.
-- 2) get_dashboard_health: sinais de dado velho ou divergente para o painel avisar em vez de mostrar numero errado em silencio.
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  _start_this_month timestamptz := date_trunc('month', now());
  _start_last_month timestamptz := date_trunc('month', now() - interval '1 month');
  _end_last_month timestamptz := date_trunc('month', now());
  _30d_ago timestamptz := now() - interval '30 days';
  
  -- Revenue vars
  _li_revenue_this_month numeric := 0;
  _li_orders_this_month bigint := 0;
  _li_revenue_last_month numeric := 0;
  _bling_revenue_this_month numeric := 0;
  _bling_orders_this_month bigint := 0;
  _bling_revenue_last_month numeric := 0;
  _avg_ticket numeric := 0;
  _total_revenue_this_month numeric := 0;
  _total_orders_this_month bigint := 0;
  _revenue_change numeric := 0;
  
  -- Messages
  _msgs_sent bigint := 0;
  _msgs_received bigint := 0;
  
  -- RFM summary
  _rfm_summary jsonb := '[]'::jsonb;
  
  -- Sales by day
  _sales_by_day jsonb := '[]'::jsonb;
  
  -- Delivered counts
  _me_delivered_this_month bigint := 0;
  _me_delivered_30d bigint := 0;
  
  -- Effective LI statuses array
  _effective_statuses text[] := ARRAY['Pedido Entregue', 'Pedido Enviado', 'Pedido Pago'];
BEGIN
  IF NOT public.caller_has_tenant(_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- LI Revenue this month (effective statuses including Pedido Pago)
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0), COUNT(*)
  INTO _li_revenue_this_month, _li_orders_this_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND public.li_status_is_sale(status_name)
    AND created_at_remote >= _start_this_month;

  -- LI Revenue last month
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0)
  INTO _li_revenue_last_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND public.li_status_is_sale(status_name)
    AND created_at_remote >= _start_last_month
    AND created_at_remote < _end_last_month;

  -- Bling Revenue this month
  SELECT COALESCE(SUM(valor_total), 0), COUNT(*)
  INTO _bling_revenue_this_month, _bling_orders_this_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_this_month;

  -- Bling Revenue last month
  SELECT COALESCE(SUM(valor_total), 0)
  INTO _bling_revenue_last_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_last_month
    AND data_criacao < _end_last_month;

  _total_revenue_this_month := _li_revenue_this_month + _bling_revenue_this_month;
  _total_orders_this_month := _li_orders_this_month + _bling_orders_this_month;
  
  IF _total_orders_this_month > 0 THEN
    _avg_ticket := _total_revenue_this_month / _total_orders_this_month;
  END IF;

  DECLARE
    _total_last numeric := _li_revenue_last_month + _bling_revenue_last_month;
  BEGIN
    IF _total_last > 0 THEN
      _revenue_change := ROUND(((_total_revenue_this_month - _total_last) / _total_last) * 100);
    END IF;
  END;

  -- Messages last 30 days
  SELECT 
    COUNT(*) FILTER (WHERE direction = 'outbound'),
    COUNT(*) FILTER (WHERE direction = 'inbound')
  INTO _msgs_sent, _msgs_received
  FROM messages
  WHERE tenant_id = _tenant_id
    AND created_at >= _30d_ago;

  -- RFM Summary (latest snapshot)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO _rfm_summary
  FROM (
    SELECT segment_name, COUNT(*) as count
    FROM customer_rfm_snapshots
    WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      AND reference_date = (
        SELECT MAX(reference_date) FROM customer_rfm_snapshots 
        WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      )
    GROUP BY segment_name
    ORDER BY count DESC
  ) r;

  -- Sales by day (last 30 days) - combined LI + Bling
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.date), '[]'::jsonb)
  INTO _sales_by_day
  FROM (
    SELECT d::date as date, 
      COALESCE(li.revenue, 0) + COALESCE(bl.revenue, 0) as total,
      COALESCE(li.cnt, 0) + COALESCE(bl.cnt, 0) as count
    FROM generate_series(_30d_ago::date, now()::date, '1 day') d
    LEFT JOIN (
      SELECT created_at_remote::date as day, 
        SUM((totals_json->>'total')::numeric) as revenue,
        COUNT(*) as cnt
      FROM li_orders
      WHERE tenant_id = _tenant_id
        AND public.li_status_is_sale(status_name)
        AND created_at_remote >= _30d_ago
      GROUP BY day
    ) li ON li.day = d::date
    LEFT JOIN (
      SELECT data_criacao::date as day,
        SUM(valor_total) as revenue,
        COUNT(*) as cnt
      FROM bling_orders
      WHERE tenant_id = _tenant_id
        AND data_criacao >= _30d_ago
      GROUP BY day
    ) bl ON bl.day = d::date
  ) r;

  -- ME delivered counts
  SELECT COUNT(*) INTO _me_delivered_this_month
  FROM me_shipments
  WHERE tenant_id = _tenant_id AND status = 'delivered' AND delivered_at >= _start_this_month;
  
  SELECT COUNT(*) INTO _me_delivered_30d
  FROM me_shipments
  WHERE tenant_id = _tenant_id AND status = 'delivered' AND delivered_at >= _30d_ago;

  -- Top products (this month, with 30d fallback)
  DECLARE
    _top_products jsonb := '[]'::jsonb;
    _top_products_30d jsonb := '[]'::jsonb;
  BEGIN
    -- This month
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        SELECT boi.produto_nome as name, COALESCE(boi.quantidade, 0) as quantity, COALESCE(boi.valor_total, 0) as revenue
        FROM bling_order_items boi
        JOIN bling_orders bo ON bo.id = boi.order_id
        WHERE boi.tenant_id = _tenant_id
          AND bo.data_criacao >= _start_this_month
        UNION ALL
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND public.li_status_is_sale(o.status_name)
          AND o.created_at_remote >= _start_this_month
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    -- Last 30 days (fallback)
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products_30d
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        SELECT boi.produto_nome as name, COALESCE(boi.quantidade, 0) as quantity, COALESCE(boi.valor_total, 0) as revenue
        FROM bling_order_items boi
        JOIN bling_orders bo ON bo.id = boi.order_id
        WHERE boi.tenant_id = _tenant_id
          AND bo.data_criacao >= _30d_ago
        UNION ALL
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND public.li_status_is_sale(o.status_name)
          AND o.created_at_remote >= _30d_ago
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    result := jsonb_build_object(
      'total_revenue_this_month', _total_revenue_this_month,
      'total_orders_this_month', _total_orders_this_month,
      'revenue_change', _revenue_change,
      'avg_ticket', ROUND(_avg_ticket, 2),
      'msgs_sent_30d', _msgs_sent,
      'msgs_received_30d', _msgs_received,
      'rfm_summary', _rfm_summary,
      'sales_by_day', _sales_by_day,
      'top_products', _top_products,
      'top_products_30d', _top_products_30d,
      'me_delivered_this_month', _me_delivered_this_month,
      'me_delivered_30d', _me_delivered_30d
    );
  END;

  RETURN result;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.get_dashboard_health(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  d jsonb; v_rpc numeric; v_direct numeric; v_rfm date; v_unknown bigint; v_seg int;
BEGIN
  IF NOT public.caller_has_tenant(_tenant_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  d := public.get_dashboard_stats(_tenant_id);
  v_rpc := COALESCE((d->>'total_revenue_this_month')::numeric, 0);
  -- conferência direta (sem passar pelo RPC): receita do mês = LI com status de venda + Bling
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0) INTO v_direct FROM li_orders
    WHERE tenant_id = _tenant_id AND public.li_status_is_sale(status_name) AND created_at_remote >= date_trunc('month', now());
  v_direct := v_direct + COALESCE((SELECT SUM(valor_total) FROM bling_orders WHERE tenant_id = _tenant_id AND data_criacao >= date_trunc('month', now())), 0);
  SELECT MAX(reference_date) INTO v_rfm FROM customer_rfm_snapshots
    WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id);
  SELECT COUNT(*) INTO v_unknown FROM messages
    WHERE tenant_id = _tenant_id AND created_at >= now() - interval '30 days'
      AND direction NOT IN ('inbound', 'outbound', 'system', 'internal_note');
  RETURN jsonb_build_object(
    'rfm_age_days', CASE WHEN v_rfm IS NULL THEN NULL ELSE (current_date - v_rfm) END,
    'revenue_rpc', v_rpc, 'revenue_direct', v_direct,
    'revenue_mismatch', ABS(v_rpc - v_direct) > 0.01,
    'unknown_message_directions', v_unknown
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_dashboard_health(uuid) TO authenticated;
