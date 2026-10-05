-- Cupons que chegam depois (sincronizacao com a loja): ja nascem com a origem e com o uso preenchido a partir dos pedidos.
CREATE OR REPLACE FUNCTION public.set_coupon_origin()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.origin_type IS NULL THEN
    NEW.origin_type := CASE NEW.source
      WHEN 'cashback' THEN 'cashback' WHEN 'email' THEN 'email_campaign' WHEN 'manual' THEN 'manual'
      WHEN 'birthday' THEN 'birthday' WHEN 'reactivation' THEN 'reactivation' WHEN 'loyalty' THEN 'loyalty' ELSE 'imported' END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_coupon_origin ON public.generated_coupons;
CREATE TRIGGER trg_set_coupon_origin BEFORE INSERT ON public.generated_coupons FOR EACH ROW EXECUTE FUNCTION public.set_coupon_origin();

-- Preenche o uso (pedido e valor) dos cupons do tenant que ainda constam como nao usados, a partir dos pedidos ja sincronizados.
CREATE OR REPLACE FUNCTION public.refresh_coupon_usage(p_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  WITH first_use AS (
    SELECT DISTINCT ON (o.integration_id, upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')))
           o.integration_id, upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')) AS code, o.order_number, o.created_at_remote,
           COALESCE(public.try_numeric(o.totals_json->>'total'), 0) AS total
    FROM public.li_orders o
    WHERE o.tenant_id = p_tenant_id AND COALESCE(o.raw_json->'cupom_desconto'->>'codigo', '') <> '' AND COALESCE(o.status_id, 0) NOT IN (7, 8, 16, 1020)
    ORDER BY o.integration_id, upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')), o.created_at_remote
  )
  UPDATE public.generated_coupons g SET used_at = f.created_at_remote, used_in_order_id = f.order_number, used_order_value = f.total
  FROM first_use f
  WHERE g.tenant_id = p_tenant_id AND g.integration_id = f.integration_id AND g.coupon_code = f.code AND g.used_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_coupon_usage(uuid) TO authenticated;
