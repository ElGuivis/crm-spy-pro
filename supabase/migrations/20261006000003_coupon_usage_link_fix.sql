-- Uso de cupom: o vínculo com o pedido (número e valor) nunca era preenchido para cupons que a sincronização da loja
-- já tinha marcado como usados (used_at vem da quantidade usada na loja): a função e o gatilho só atualizavam
-- linhas com used_at IS NULL. Resultado: 67 cupons usados, 0 com pedido e valor.
-- Agora o vínculo é decidido pelos pedidos: primeira data/pedido de uso e valor TOTAL dos pedidos válidos que trouxeram o
-- código (cupom de uso múltiplo soma todos). Pedido cancelado/devolvido (7, 8, 16, 1020) não conta.

CREATE INDEX IF NOT EXISTS idx_li_orders_coupon_code
  ON public.li_orders (integration_id, (upper(btrim(raw_json->'cupom_desconto'->>'codigo'))))
  WHERE COALESCE(raw_json->'cupom_desconto'->>'codigo', '') <> '';

CREATE OR REPLACE FUNCTION public.recompute_coupon_usage(p_integration_id uuid, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_first timestamptz; v_order text; v_total numeric; v_n integer;
BEGIN
  SELECT count(*), min(o.created_at_remote), (array_agg(o.order_number::text ORDER BY o.created_at_remote))[1],
         COALESCE(sum(COALESCE(public.try_numeric(o.totals_json->>'total'), 0)), 0)
    INTO v_n, v_first, v_order, v_total
  FROM public.li_orders o
  WHERE o.integration_id = p_integration_id AND COALESCE(o.status_id, 0) NOT IN (7, 8, 16, 1020)
    AND upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')) = p_code;

  IF v_n > 0 THEN
    UPDATE public.generated_coupons
    SET used_at = COALESCE(v_first, used_at, now()), used_in_order_id = v_order, used_order_value = v_total
    WHERE integration_id = p_integration_id AND coupon_code = p_code;
  ELSE
    -- nenhum pedido válido: desfaz só o que veio de pedido (o uso informado pela loja continua)
    UPDATE public.generated_coupons SET used_at = NULL, used_in_order_id = NULL, used_order_value = NULL
    WHERE integration_id = p_integration_id AND coupon_code = p_code AND used_in_order_id IS NOT NULL;
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.recompute_coupon_usage(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_coupon_redeemed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_code text;
BEGIN
  v_code := upper(btrim(NEW.raw_json->'cupom_desconto'->>'codigo'));
  IF v_code IS NULL OR v_code = '' THEN RETURN NEW; END IF;
  PERFORM public.recompute_coupon_usage(NEW.integration_id, v_code);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_coupon_usage(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  WITH u AS (
    SELECT o.integration_id, upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')) AS code,
           min(o.created_at_remote) AS first_at, (array_agg(o.order_number::text ORDER BY o.created_at_remote))[1] AS first_order,
           COALESCE(sum(COALESCE(public.try_numeric(o.totals_json->>'total'), 0)), 0) AS total
    FROM public.li_orders o
    WHERE o.tenant_id = p_tenant_id AND COALESCE(o.raw_json->'cupom_desconto'->>'codigo', '') <> '' AND COALESCE(o.status_id, 0) NOT IN (7, 8, 16, 1020)
    GROUP BY 1, 2
  )
  UPDATE public.generated_coupons g
  SET used_at = u.first_at, used_in_order_id = u.first_order, used_order_value = u.total
  FROM u
  WHERE g.tenant_id = p_tenant_id AND g.integration_id = u.integration_id AND g.coupon_code = u.code
    AND (g.used_in_order_id IS DISTINCT FROM u.first_order OR g.used_order_value IS DISTINCT FROM u.total OR g.used_at IS DISTINCT FROM u.first_at);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

-- Desconto dado: cupom de valor fixo vale uma vez por uso (antes contava só uma vez, mesmo com dezenas de usos)
CREATE OR REPLACE FUNCTION public.get_coupon_performance(p_tenant_id uuid, p_days integer DEFAULT 90)
RETURNS TABLE(origin_type text, issued integer, redeemed integer, revenue numeric, avg_ticket numeric, discount_cost numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT COALESCE(g.origin_type, 'imported'),
         count(*)::int,
         count(g.used_at)::int,
         COALESCE(sum(g.used_order_value) FILTER (WHERE g.used_at IS NOT NULL), 0),
         COALESCE(sum(g.used_order_value) FILTER (WHERE g.used_at IS NOT NULL) / NULLIF(sum(GREATEST(COALESCE(g.li_quantidade_usada, 1), 1)) FILTER (WHERE g.used_at IS NOT NULL), 0), 0),
         COALESCE(sum(COALESCE(g.coupon_value * GREATEST(COALESCE(g.li_quantidade_usada, 1), 1), g.used_order_value * g.discount_percentage / 100)) FILTER (WHERE g.used_at IS NOT NULL), 0)
  FROM public.generated_coupons g
  WHERE g.tenant_id = p_tenant_id AND g.issue_status = 'issued'
    AND (p_days <= 0 OR COALESCE(g.li_data_inicio, g.created_at) >= now() - make_interval(days => p_days))
  GROUP BY 1
  ORDER BY 3 DESC, 2 DESC;
END;
$function$;
