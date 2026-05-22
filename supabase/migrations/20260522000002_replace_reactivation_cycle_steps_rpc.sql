-- Atomic replace of reactivation_cycle_steps for a given config.
-- Mesma motivacao do fix #7 (replace_order_notification_rules):
-- DELETE + INSERT separados nao sao atomicos. Se INSERT falhar, todos
-- os steps existentes sao perdidos. Esta RPC roda em uma unica
-- transacao.

CREATE OR REPLACE FUNCTION public.replace_reactivation_cycle_steps(
  p_config_id uuid,
  p_tenant_id uuid,
  p_steps jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  s jsonb;
  idx int := 1;
BEGIN
  IF p_config_id IS NULL THEN
    RAISE EXCEPTION 'p_config_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
    RAISE EXCEPTION 'p_steps must be a JSON array';
  END IF;

  DELETE FROM public.reactivation_cycle_steps WHERE config_id = p_config_id;

  IF jsonb_array_length(p_steps) > 0 THEN
    FOR s IN SELECT jsonb_array_elements(p_steps) LOOP
      INSERT INTO public.reactivation_cycle_steps (
        config_id, tenant_id, step_number, delay_days, message_template,
        is_active, use_custom_coupon, coupon_discount_percent, coupon_duration_days
      )
      VALUES (
        p_config_id,
        p_tenant_id,
        idx,
        COALESCE((s->>'delay_days')::integer, 7),
        COALESCE(s->>'message_template', ''),
        COALESCE((s->>'is_active')::boolean, true),
        COALESCE((s->>'use_custom_coupon')::boolean, false),
        NULLIF(s->>'coupon_discount_percent', '')::integer,
        NULLIF(s->>'coupon_duration_days', '')::integer
      );
      idx := idx + 1;
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_reactivation_cycle_steps(uuid, uuid, jsonb) TO authenticated;
