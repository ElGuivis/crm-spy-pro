-- Fix: disable statement_timeout inside delete_integration_cascade
-- so large integrations don't hit the 8s limit

CREATE OR REPLACE FUNCTION public.delete_integration_cascade(
  p_integration_id uuid,
  p_tenant_id      uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_li_customer_ids  uuid[];
  v_li_order_ids     uuid[];
  v_bling_order_ids  uuid[];
  v_conv_ids         uuid[];
  v_rfm_ids          uuid[];
  v_channel_ids      uuid[];
BEGIN
  -- Disable statement timeout for this operation
  SET LOCAL statement_timeout = 0;

  -- Verify tenant ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.integrations
    WHERE id = p_integration_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Integration not found or access denied';
  END IF;

  -- ── Collect IDs needed for multi-level cascades ──────────────────────────

  SELECT array_agg(id) INTO v_li_customer_ids
    FROM public.li_customers WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_li_order_ids
    FROM public.li_orders WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_bling_order_ids
    FROM public.bling_orders WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_conv_ids
    FROM public.conversations WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_rfm_ids
    FROM public.rfm_analyses WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_channel_ids
    FROM public.whatsapp_channels WHERE integration_id = p_integration_id;

  -- ── Second-level dependents ───────────────────────────────────────────────

  IF v_li_customer_ids IS NOT NULL THEN
    DELETE FROM public.li_cashback_executions  WHERE li_customer_id = ANY(v_li_customer_ids);
    DELETE FROM public.cashback_executions     WHERE li_customer_id = ANY(v_li_customer_ids);
  END IF;

  IF v_li_order_ids IS NOT NULL THEN
    DELETE FROM public.li_order_items WHERE li_order_id = ANY(v_li_order_ids);
  END IF;

  IF v_bling_order_ids IS NOT NULL THEN
    DELETE FROM public.bling_order_items WHERE bling_order_id = ANY(v_bling_order_ids);
  END IF;

  IF v_conv_ids IS NOT NULL THEN
    DELETE FROM public.messages               WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.conversation_tags      WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.conversation_notes     WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.message_reactions      WHERE conversation_id = ANY(v_conv_ids);
  END IF;

  IF v_rfm_ids IS NOT NULL THEN
    DELETE FROM public.rfm_segments WHERE rfm_analysis_id = ANY(v_rfm_ids);
  END IF;

  IF v_channel_ids IS NOT NULL THEN
    DELETE FROM public.outbound_queue  WHERE channel_id = ANY(v_channel_ids);
    DELETE FROM public.webhook_events  WHERE channel_id = ANY(v_channel_ids);
  END IF;

  -- ── Direct dependents of integrations ────────────────────────────────────

  DELETE FROM public.li_customers            WHERE integration_id = p_integration_id;
  DELETE FROM public.li_orders               WHERE integration_id = p_integration_id;
  DELETE FROM public.li_products             WHERE integration_id = p_integration_id;
  DELETE FROM public.li_sync_jobs            WHERE integration_id = p_integration_id;
  DELETE FROM public.li_sync_logs            WHERE integration_id = p_integration_id;
  DELETE FROM public.li_webhooks             WHERE integration_id = p_integration_id;
  DELETE FROM public.li_coupons              WHERE integration_id = p_integration_id;
  DELETE FROM public.li_cashback_configs     WHERE integration_id = p_integration_id;
  DELETE FROM public.li_reconciliation_jobs  WHERE integration_id = p_integration_id;

  DELETE FROM public.bling_orders            WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_products          WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_sync_jobs         WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_sync_logs         WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_stores            WHERE integration_id = p_integration_id;

  DELETE FROM public.me_sync_jobs            WHERE integration_id = p_integration_id;
  DELETE FROM public.me_sync_logs            WHERE integration_id = p_integration_id;
  DELETE FROM public.me_shipments            WHERE integration_id = p_integration_id;

  DELETE FROM public.conversations           WHERE integration_id = p_integration_id;
  DELETE FROM public.contacts                WHERE integration_id = p_integration_id;
  DELETE FROM public.whatsapp_channels       WHERE integration_id = p_integration_id;

  DELETE FROM public.rfm_analyses            WHERE integration_id = p_integration_id;
  DELETE FROM public.rfm_configs             WHERE integration_id = p_integration_id;

  DELETE FROM public.cashback_configs        WHERE integration_id = p_integration_id;
  DELETE FROM public.cashback_executions     WHERE integration_id = p_integration_id;

  DELETE FROM public.bulk_campaigns         WHERE integration_id = p_integration_id;
  DELETE FROM public.automation_rules       WHERE integration_id = p_integration_id;
  DELETE FROM public.integration_logs       WHERE integration_id = p_integration_id;
  DELETE FROM public.integration_settings   WHERE integration_id = p_integration_id;
  DELETE FROM public.webhook_configs        WHERE integration_id = p_integration_id;

  -- ── Finally, the integration itself ──────────────────────────────────────
  DELETE FROM public.integrations WHERE id = p_integration_id AND tenant_id = p_tenant_id;

END;
$$;
