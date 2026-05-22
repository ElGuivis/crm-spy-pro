-- Atomic replace of order_notification_status_rules for a given config.
-- Antes: o hook fazia DELETE seguido de INSERT em duas chamadas separadas.
-- Se o INSERT falhasse (rede, RLS), o usuario perdia todas as regras existentes.
-- Esta RPC roda em uma unica transacao (atomic) — falha em qualquer ponto
-- faz rollback do delete.

CREATE OR REPLACE FUNCTION public.replace_order_notification_rules(
  p_config_id uuid,
  p_tenant_id uuid,
  p_rules jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  r jsonb;
BEGIN
  -- Validate inputs
  IF p_config_id IS NULL THEN
    RAISE EXCEPTION 'p_config_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' THEN
    RAISE EXCEPTION 'p_rules must be a JSON array';
  END IF;

  -- Replace rules atomically (function execution is a single transaction)
  DELETE FROM public.order_notification_status_rules WHERE config_id = p_config_id;

  IF jsonb_array_length(p_rules) > 0 THEN
    FOR r IN SELECT jsonb_array_elements(p_rules) LOOP
      INSERT INTO public.order_notification_status_rules (
        config_id, tenant_id, status_name, status_id, is_enabled,
        message_template, email_subject, email_body, delay_minutes
      )
      VALUES (
        p_config_id,
        p_tenant_id,
        r->>'status_name',
        NULLIF((r->>'status_id'), '')::integer,
        COALESCE((r->>'is_enabled')::boolean, true),
        r->>'message_template',
        NULLIF(r->>'email_subject', ''),
        NULLIF(r->>'email_body', ''),
        COALESCE((r->>'delay_minutes')::integer, 0)
      );
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_order_notification_rules(uuid, uuid, jsonb) TO authenticated;
