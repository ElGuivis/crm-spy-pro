-- Livro-razao de cupons: generated_coupons passa a ser o registro unico de TODO cupom emitido, qualquer que seja o modulo que o criou
-- (cashback, aniversario, reativacao, e-mail marketing, recuperacao, boas-vindas, manual, importado da loja).
--  * origin_type/origin_id/origin_ref : quem emitiu (modulo, configuracao/campanha, etapa) -> retorno por origem
--  * issue_status : 'pending' = reservado antes de chamar a loja (um codigo nunca e usado duas vezes); 'issued' = criado na loja
--  * uso do cupom: gatilho em li_orders marca used_at / used_in_order_id / used_order_value pelo pedido real (retroativo tambem)
ALTER TABLE public.generated_coupons
  ADD COLUMN IF NOT EXISTS origin_type text,
  ADD COLUMN IF NOT EXISTS origin_id uuid,
  ADD COLUMN IF NOT EXISTS origin_ref text,
  ADD COLUMN IF NOT EXISTS issue_status text NOT NULL DEFAULT 'issued';

ALTER TABLE public.generated_coupons DROP CONSTRAINT IF EXISTS generated_coupons_issue_status_check;
ALTER TABLE public.generated_coupons ADD CONSTRAINT generated_coupons_issue_status_check CHECK (issue_status IN ('pending', 'issued'));
ALTER TABLE public.generated_coupons DROP CONSTRAINT IF EXISTS generated_coupons_origin_type_check;
ALTER TABLE public.generated_coupons ADD CONSTRAINT generated_coupons_origin_type_check
  CHECK (origin_type IS NULL OR origin_type IN ('cashback', 'birthday', 'reactivation', 'email_campaign', 'recovery', 'welcome', 'manual', 'loyalty', 'imported'));

UPDATE public.generated_coupons SET origin_type = CASE source
    WHEN 'cashback' THEN 'cashback' WHEN 'email' THEN 'email_campaign' WHEN 'manual' THEN 'manual'
    WHEN 'birthday' THEN 'birthday' WHEN 'reactivation' THEN 'reactivation' WHEN 'loyalty' THEN 'loyalty' ELSE 'imported' END
WHERE origin_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_generated_coupons_origin ON public.generated_coupons (tenant_id, origin_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_coupons_used ON public.generated_coupons (tenant_id, used_at) WHERE used_at IS NOT NULL;

-- Uso do cupom pelo pedido: o codigo vem em raw_json.cupom_desconto.codigo. Pedido cancelado/devolvido nao conta (e desfaz se ja contou).
CREATE OR REPLACE FUNCTION public.mark_coupon_redeemed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_code text;
BEGIN
  v_code := upper(btrim(NEW.raw_json->'cupom_desconto'->>'codigo'));
  IF v_code IS NULL OR v_code = '' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status_id, 0) IN (7, 8, 16, 1020) THEN
    UPDATE public.generated_coupons SET used_at = NULL, used_in_order_id = NULL, used_order_value = NULL
    WHERE integration_id = NEW.integration_id AND coupon_code = v_code AND used_in_order_id = NEW.order_number;
  ELSE
    UPDATE public.generated_coupons
    SET used_at = COALESCE(NEW.created_at_remote, now()), used_in_order_id = NEW.order_number,
        used_order_value = COALESCE(public.try_numeric(NEW.totals_json->>'total'), 0)
    WHERE integration_id = NEW.integration_id AND coupon_code = v_code AND used_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_mark_coupon_redeemed ON public.li_orders;
CREATE TRIGGER trg_mark_coupon_redeemed AFTER INSERT OR UPDATE OF raw_json, status_id ON public.li_orders
  FOR EACH ROW EXECUTE FUNCTION public.mark_coupon_redeemed();

-- Retroativo: pedidos que ja usaram cupons conhecidos (o mais antigo valido de cada codigo)
WITH first_use AS (
  SELECT DISTINCT ON (o.integration_id, upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')))
         o.integration_id, upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')) AS code, o.order_number, o.created_at_remote,
         COALESCE(public.try_numeric(o.totals_json->>'total'), 0) AS total
  FROM public.li_orders o
  WHERE COALESCE(o.raw_json->'cupom_desconto'->>'codigo', '') <> '' AND COALESCE(o.status_id, 0) NOT IN (7, 8, 16, 1020)
  ORDER BY o.integration_id, upper(btrim(o.raw_json->'cupom_desconto'->>'codigo')), o.created_at_remote
)
UPDATE public.generated_coupons g SET used_at = f.created_at_remote, used_in_order_id = f.order_number, used_order_value = f.total
FROM first_use f
WHERE g.integration_id = f.integration_id AND g.coupon_code = f.code AND g.used_at IS NULL;

-- Retorno por origem: quantos cupons cada modulo emitiu no periodo, quantos foram usados e quanto renderam (p_days = 0: tudo)
CREATE OR REPLACE FUNCTION public.get_coupon_performance(p_tenant_id uuid, p_days integer DEFAULT 90)
RETURNS TABLE (origin_type text, issued integer, redeemed integer, revenue numeric, avg_ticket numeric, discount_cost numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT COALESCE(g.origin_type, 'imported'),
         count(*)::int,
         count(g.used_at)::int,
         COALESCE(sum(g.used_order_value) FILTER (WHERE g.used_at IS NOT NULL), 0),
         COALESCE(avg(g.used_order_value) FILTER (WHERE g.used_at IS NOT NULL), 0),
         COALESCE(sum(COALESCE(g.coupon_value, g.used_order_value * g.discount_percentage / 100)) FILTER (WHERE g.used_at IS NOT NULL), 0)
  FROM public.generated_coupons g
  WHERE g.tenant_id = p_tenant_id AND g.issue_status = 'issued'
    AND (p_days <= 0 OR COALESCE(g.li_data_inicio, g.created_at) >= now() - make_interval(days => p_days))
  GROUP BY 1
  ORDER BY 3 DESC, 2 DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_coupon_performance(uuid, integer) TO authenticated;

-- Reservas esquecidas (queda no meio da emissao): com id da loja viram emitidas; sem id, somem
CREATE OR REPLACE FUNCTION public.cleanup_pending_coupons()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.generated_coupons SET issue_status = 'issued' WHERE issue_status = 'pending' AND li_coupon_id IS NOT NULL;
  DELETE FROM public.generated_coupons WHERE issue_status = 'pending' AND li_coupon_id IS NULL AND created_at < now() - interval '15 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_pending_coupons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_pending_coupons() TO service_role;
