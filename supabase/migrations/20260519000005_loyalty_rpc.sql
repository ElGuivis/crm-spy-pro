-- ============================================================
-- Loyalty RPC functions (replaces edge functions)
-- loyalty_calculate: credits points from orders
-- loyalty_redeem: redeems points → generates coupon
-- ============================================================

CREATE OR REPLACE FUNCTION public.loyalty_calculate(
  p_integration_id UUID,
  p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_program RECORD;
  v_integration RECORD;
  v_since TIMESTAMPTZ;
  v_credited INT;
  v_scanned INT;
BEGIN
  v_tenant_id := get_user_tenant_id(auth.uid());
  IF v_tenant_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_program
  FROM loyalty_programs
  WHERE integration_id = p_integration_id
    AND tenant_id = v_tenant_id
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Programa de fidelidade não configurado');
  END IF;

  SELECT id, type INTO v_integration
  FROM integrations
  WHERE id = p_integration_id AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Integração não encontrada');
  END IF;

  v_since := COALESCE(p_since, NOW() - INTERVAL '30 days');

  IF v_integration.type = 'bling' THEN
    INSERT INTO loyalty_points (
      tenant_id, integration_id, customer_external_id,
      customer_name, customer_phone, points, type, description, order_id
    )
    SELECT
      v_tenant_id,
      p_integration_id,
      COALESCE(bo.customer_phone, bo.customer_name, ''),
      bo.customer_name,
      bo.customer_phone,
      GREATEST(1, FLOOR(
        bo.total_value::NUMERIC * v_program.points_per_brl *
        CASE WHEN EXISTS (
          SELECT 1 FROM customer_rfm_snapshots rr
          WHERE rr.integration_id = p_integration_id
            AND rr.segment_name = 'Champions'
            AND rr.customer_id::TEXT = COALESCE(bo.customer_phone, bo.customer_name, '')
        ) THEN v_program.champion_multiplier ELSE 1 END
      ))::INT,
      'earn',
      'Pedido #' || bo.bling_order_id::TEXT,
      bo.bling_order_id::TEXT
    FROM bling_orders bo
    WHERE bo.integration_id = p_integration_id
      AND bo.situation IN ('Em aberto', 'Atendido', 'Faturado')
      AND bo.created_at >= v_since
      AND COALESCE(bo.customer_phone, bo.customer_name, '') <> ''
      AND bo.total_value > 0
      AND NOT EXISTS (
        SELECT 1 FROM loyalty_points lp
        WHERE lp.integration_id = p_integration_id
          AND lp.type = 'earn'
          AND lp.order_id = bo.bling_order_id::TEXT
      )
    LIMIT 1000;

    GET DIAGNOSTICS v_credited = ROW_COUNT;

    SELECT COUNT(*) INTO v_scanned
    FROM bling_orders
    WHERE integration_id = p_integration_id
      AND situation IN ('Em aberto', 'Atendido', 'Faturado')
      AND created_at >= v_since;

  ELSE
    -- loja_integrada or nuvem_shop
    INSERT INTO loyalty_points (
      tenant_id, integration_id, customer_external_id,
      customer_name, customer_phone, points, type, description, order_id
    )
    SELECT
      v_tenant_id,
      p_integration_id,
      COALESCE(lo.customer_phone, lo.customer_name, lo.customer_id::TEXT, ''),
      lo.customer_name,
      lo.customer_phone,
      GREATEST(1, FLOOR(
        lo.valor_total::NUMERIC * v_program.points_per_brl *
        CASE WHEN EXISTS (
          SELECT 1 FROM customer_rfm_snapshots rr
          WHERE rr.integration_id = p_integration_id
            AND rr.segment_name = 'Champions'
            AND (rr.customer_id = lo.customer_id
              OR rr.customer_id::TEXT = COALESCE(lo.customer_phone, lo.customer_name, ''))
        ) THEN v_program.champion_multiplier ELSE 1 END
      ))::INT,
      'earn',
      'Pedido #' || lo.loja_integrada_order_id::TEXT,
      lo.loja_integrada_order_id::TEXT
    FROM li_orders lo
    WHERE lo.integration_id = p_integration_id
      AND lo.created_at >= v_since
      AND COALESCE(lo.customer_phone, lo.customer_name, lo.customer_id::TEXT, '') <> ''
      AND lo.valor_total > 0
      AND NOT EXISTS (
        SELECT 1 FROM loyalty_points lp
        WHERE lp.integration_id = p_integration_id
          AND lp.type = 'earn'
          AND lp.order_id = lo.loja_integrada_order_id::TEXT
      )
    LIMIT 1000;

    GET DIAGNOSTICS v_credited = ROW_COUNT;

    SELECT COUNT(*) INTO v_scanned
    FROM li_orders
    WHERE integration_id = p_integration_id
      AND created_at >= v_since;
  END IF;

  RETURN json_build_object('success', true, 'credited', v_credited, 'scanned', v_scanned);
END;
$$;

-- ============================================================

CREATE OR REPLACE FUNCTION public.loyalty_redeem(
  p_integration_id UUID,
  p_customer_external_id TEXT,
  p_points_to_redeem INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_program RECORD;
  v_balance INT;
  v_coupon_value NUMERIC;
  v_coupon_code TEXT;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i INT;
BEGIN
  v_tenant_id := get_user_tenant_id(auth.uid());
  IF v_tenant_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  IF p_points_to_redeem <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'pointsToRedeem deve ser positivo');
  END IF;

  SELECT * INTO v_program
  FROM loyalty_programs
  WHERE integration_id = p_integration_id
    AND tenant_id = v_tenant_id
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Programa de fidelidade não configurado');
  END IF;

  IF p_points_to_redeem < v_program.min_points_redeem THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Mínimo para resgate: ' || v_program.min_points_redeem || ' pontos'
    );
  END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM loyalty_points
  WHERE integration_id = p_integration_id
    AND tenant_id = v_tenant_id
    AND customer_external_id = p_customer_external_id;

  IF v_balance < p_points_to_redeem THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Saldo insuficiente (' || v_balance || ' pontos disponíveis)'
    );
  END IF;

  SELECT customer_name, customer_phone INTO v_customer_name, v_customer_phone
  FROM loyalty_points
  WHERE integration_id = p_integration_id
    AND customer_external_id = p_customer_external_id
    AND customer_name IS NOT NULL
  LIMIT 1;

  -- Generate coupon code: PONTOS + 6 random chars
  v_coupon_code := 'PONTOS';
  FOR v_i IN 1..6 LOOP
    v_coupon_code := v_coupon_code ||
      substr(v_chars, (floor(random() * length(v_chars)))::INT + 1, 1);
  END LOOP;

  v_coupon_value := ROUND(p_points_to_redeem * v_program.points_to_brl, 2);

  INSERT INTO generated_coupons (
    tenant_id, integration_id, coupon_code, discount_percentage,
    coupon_value, customer_name, customer_phone, source, coupon_type,
    coupon_description, expires_at, li_quantidade_usada, li_quantidade_uso_maximo
  ) VALUES (
    v_tenant_id, p_integration_id, v_coupon_code, 0,
    v_coupon_value, v_customer_name, v_customer_phone, 'loyalty', 'valor_absoluto',
    'Resgate de ' || p_points_to_redeem || ' pontos',
    NOW() + INTERVAL '90 days', 0, 1
  );

  INSERT INTO loyalty_points (
    tenant_id, integration_id, customer_external_id,
    customer_name, customer_phone, points, type, description, coupon_code
  ) VALUES (
    v_tenant_id, p_integration_id, p_customer_external_id,
    v_customer_name, v_customer_phone, -p_points_to_redeem,
    'redeem', 'Resgate de cupom ' || v_coupon_code, v_coupon_code
  );

  RETURN json_build_object(
    'success', true,
    'couponCode', v_coupon_code,
    'couponValue', v_coupon_value,
    'newBalance', v_balance - p_points_to_redeem
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.loyalty_calculate(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_redeem(UUID, TEXT, INT) TO authenticated;
