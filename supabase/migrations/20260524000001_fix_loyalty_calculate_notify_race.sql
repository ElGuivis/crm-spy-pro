-- Fix loyalty_calculate WhatsApp notification dead code (race condition)
--
-- Bug: v_batch_at := clock_timestamp() returns wall-clock time (advances during txn).
-- loyalty_points.created_at default is now() (transaction start time, always EARLIER).
-- Filter `lp.created_at >= v_batch_at` therefore NEVER matched rows inserted by the
-- same call, so WhatsApp notifications for loyalty_earn were never enqueued.
--
-- Fix: use now() instead of clock_timestamp(). Both the INSERTed rows and the filter
-- then share the transaction start time, and the comparison succeeds.

CREATE OR REPLACE FUNCTION public.loyalty_calculate(p_integration_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_program   RECORD;
  v_integration RECORD;
  v_since     TIMESTAMPTZ;
  v_credited  INT;
  v_scanned   INT;
  v_batch_at  TIMESTAMPTZ;
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

  v_since    := COALESCE(p_since, NOW() - INTERVAL '30 days');
  v_batch_at := NOW();  -- FIX: was clock_timestamp() (wall clock, > now()); use txn time so filter matches inserted rows

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

  -- Enfileirar notificações WhatsApp para os pontos recém-creditados
  IF v_program.notify_via_whatsapp
     AND v_program.whatsapp_integration_id IS NOT NULL
     AND v_credited > 0
  THEN
    INSERT INTO message_queue (
      tenant_id, channel, recipient, message_content,
      whatsapp_integration_id, reference_type, metadata
    )
    SELECT
      v_tenant_id,
      'whatsapp',
      lp.customer_phone,
      REPLACE(
        REPLACE(
          REPLACE(
            v_program.notification_template_earn,
            '{{cliente_primeiro_nome}}', COALESCE(split_part(lp.customer_name, ' ', 1), 'Cliente')
          ),
          '{{pontos}}', lp.points::text
        ),
        '{{total_pontos}}', (
          SELECT COALESCE(SUM(lp2.points), 0)::text
          FROM loyalty_points lp2
          WHERE lp2.integration_id = p_integration_id
            AND lp2.customer_external_id = lp.customer_external_id
        )
      ),
      v_program.whatsapp_integration_id,
      'loyalty_earn',
      jsonb_build_object('integration_id', p_integration_id, 'points_earned', lp.points)
    FROM loyalty_points lp
    WHERE lp.integration_id = p_integration_id
      AND lp.type = 'earn'
      AND lp.created_at >= v_batch_at
      AND lp.customer_phone IS NOT NULL
      AND lp.customer_phone <> '';
  END IF;

  RETURN json_build_object('success', true, 'credited', v_credited, 'scanned', v_scanned);
END;
$function$;
