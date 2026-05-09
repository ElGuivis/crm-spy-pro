-- Complete rewrite of delete_integration_cascade
-- Tables derived from FK analysis of types.ts

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
  v_rfm_audience_ids uuid[];
  v_channel_ids      uuid[];
BEGIN
  SET LOCAL statement_timeout = 0;

  IF NOT EXISTS (
    SELECT 1 FROM public.integrations
    WHERE id = p_integration_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Integration not found or access denied';
  END IF;

  -- Self-referential FK: another integration may point to this one as store_integration_id
  UPDATE public.integrations
    SET store_integration_id = NULL
    WHERE store_integration_id = p_integration_id;

  -- Collect IDs for multi-level cascades
  SELECT array_agg(id) INTO v_li_customer_ids
    FROM public.li_customers WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_li_order_ids
    FROM public.li_orders WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_bling_order_ids
    FROM public.bling_orders WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_conv_ids
    FROM public.conversations WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_rfm_audience_ids
    FROM public.rfm_audiences WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_channel_ids
    FROM public.whatsapp_channels WHERE integration_id = p_integration_id;

  -- NULL out secondary FK references on config tables
  -- (preserve the config row; only clear the pointer to the deleted integration)
  UPDATE public.abandoned_cart_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.birthday_configs
    SET email_integration_id = NULL
    WHERE email_integration_id = p_integration_id;

  UPDATE public.birthday_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.cashback_configs
    SET email_integration_id = NULL
    WHERE email_integration_id = p_integration_id;

  UPDATE public.cashback_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.order_notification_configs
    SET email_integration_id = NULL
    WHERE email_integration_id = p_integration_id;

  UPDATE public.order_notification_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.reactivation_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  -- Second-level dependents
  IF v_li_customer_ids IS NOT NULL THEN
    DELETE FROM public.li_cashback_executions WHERE li_customer_id = ANY(v_li_customer_ids);
    DELETE FROM public.cashback_executions     WHERE li_customer_id = ANY(v_li_customer_ids);
  END IF;

  IF v_li_order_ids IS NOT NULL THEN
    DELETE FROM public.li_order_items WHERE li_order_id = ANY(v_li_order_ids);
  END IF;

  IF v_bling_order_ids IS NOT NULL THEN
    DELETE FROM public.bling_order_items WHERE bling_order_id = ANY(v_bling_order_ids);
  END IF;

  IF v_conv_ids IS NOT NULL THEN
    DELETE FROM public.messages           WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.conversation_tags  WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.conversation_notes WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.message_reactions  WHERE conversation_id = ANY(v_conv_ids);
  END IF;

  IF v_rfm_audience_ids IS NOT NULL THEN
    DELETE FROM public.rfm_audience_members WHERE audience_id = ANY(v_rfm_audience_ids);
  END IF;

  IF v_channel_ids IS NOT NULL THEN
    DELETE FROM public.outbound_queue WHERE channel_id = ANY(v_channel_ids);
    DELETE FROM public.webhook_events  WHERE channel_id = ANY(v_channel_ids);
  END IF;

  -- Direct deletes — children before parents

  -- LI
  DELETE FROM public.li_orders           WHERE integration_id = p_integration_id;
  DELETE FROM public.li_customers        WHERE integration_id = p_integration_id;
  DELETE FROM public.li_products         WHERE integration_id = p_integration_id;
  DELETE FROM public.li_sync_state       WHERE integration_id = p_integration_id;
  DELETE FROM public.li_webhook_events   WHERE integration_id = p_integration_id;

  -- Bling
  DELETE FROM public.bling_orders        WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_customers     WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_products      WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_code_mappings WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_situacoes     WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_sync_jobs     WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_sync_logs     WHERE integration_id = p_integration_id;

  -- Melhor Envio
  DELETE FROM public.me_auto_sync_configs WHERE integration_id = p_integration_id;
  DELETE FROM public.me_shipments         WHERE integration_id = p_integration_id;
  DELETE FROM public.me_sync_jobs         WHERE integration_id = p_integration_id;

  -- Conversations / channels
  DELETE FROM public.conversations   WHERE integration_id = p_integration_id;
  DELETE FROM public.whatsapp_channels WHERE integration_id = p_integration_id;
  DELETE FROM public.inboxes         WHERE integration_id = p_integration_id;
  DELETE FROM public.leads           WHERE integration_id = p_integration_id;

  -- RFM
  DELETE FROM public.rfm_audiences                  WHERE integration_id = p_integration_id;
  DELETE FROM public.rfm_alerts                     WHERE integration_id = p_integration_id;
  DELETE FROM public.customer_rfm_snapshots         WHERE integration_id = p_integration_id;
  DELETE FROM public.customer_rfm_category_snapshots WHERE integration_id = p_integration_id;

  -- Cashback / coupons
  DELETE FROM public.cashback_configs    WHERE integration_id = p_integration_id;
  DELETE FROM public.generated_coupons   WHERE integration_id = p_integration_id;

  -- Campaigns / email
  DELETE FROM public.bulk_campaigns          WHERE whatsapp_integration_id = p_integration_id;
  DELETE FROM public.email_campaigns         WHERE email_integration_id = p_integration_id;
  DELETE FROM public.email_integration_senders WHERE integration_id = p_integration_id;

  -- Configs
  DELETE FROM public.abandoned_cart_configs    WHERE integration_id = p_integration_id;
  DELETE FROM public.abandoned_carts           WHERE integration_id = p_integration_id;
  DELETE FROM public.ai_agents                 WHERE store_integration_id = p_integration_id;
  DELETE FROM public.birthday_configs          WHERE integration_id = p_integration_id;
  DELETE FROM public.order_notification_configs WHERE integration_id = p_integration_id;
  DELETE FROM public.reactivation_configs      WHERE integration_id = p_integration_id;

  -- Finally the integration itself
  DELETE FROM public.integrations
    WHERE id = p_integration_id AND tenant_id = p_tenant_id;

END;
$$;
