-- Cupons: correcao do menu (campos reais da API da Loja Integrada), cupom unico por pessoa nas campanhas de e-mail
-- e atribuicao de compra reconhecendo os cupons unicos.

-- 1) generated_coupons: dados reais que a API devolve (ativo, valor minimo, usos por cliente, cumulativo)
ALTER TABLE public.generated_coupons
  ADD COLUMN IF NOT EXISTS li_ativo boolean,
  ADD COLUMN IF NOT EXISTS li_valor_minimo numeric,
  ADD COLUMN IF NOT EXISTS li_quantidade_por_cliente integer,
  ADD COLUMN IF NOT EXISTS li_cumulativo boolean;

-- permite importar em lote (upsert) sem duplicar o mesmo codigo na mesma loja
CREATE UNIQUE INDEX IF NOT EXISTS generated_coupons_integration_code_uniq
  ON public.generated_coupons (integration_id, coupon_code) WHERE integration_id IS NOT NULL;

-- 2) cupom unico por pessoa: configuracao na campanha + um registro por destinatario
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS unique_coupon jsonb;
COMMENT ON COLUMN public.email_campaigns.unique_coupon IS 'Cupom unico por destinatario: {tipo: porcentagem|fixo|frete_gratis, valor, validade_dias, valor_minimo, prefixo}. Vazio = cupom unico para todos (coupon_codes).';

CREATE TABLE IF NOT EXISTS public.email_campaign_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  code text NOT NULL,
  li_coupon_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, recipient_email),
  UNIQUE (campaign_id, code)
);
CREATE INDEX IF NOT EXISTS idx_email_campaign_coupons_code ON public.email_campaign_coupons (code);
ALTER TABLE public.email_campaign_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_campaign_coupons_select ON public.email_campaign_coupons FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 3) atribuicao: um pedido com o cupom unico de um destinatario conta para a campanha dele
CREATE OR REPLACE FUNCTION public.refresh_email_campaign_attribution(p_tenant_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active uuid[];
  v_since timestamptz;
  v_inserted integer := 0;
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(c.id),
         min(COALESCE(c.sent_at, c.started_at, c.created_at))
    INTO v_active, v_since
  FROM public.email_campaigns c
  WHERE c.tenant_id = p_tenant_id
    AND c.status::text IN ('sent', 'sending')
    AND COALESCE(c.sent_at, c.started_at, c.created_at) >= now() - ((c.attribution_window_days + 7) || ' days')::interval;

  IF v_active IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.email_campaign_conversions
  WHERE tenant_id = p_tenant_id AND campaign_id = ANY (v_active);

  WITH camp AS (
    SELECT c.id, c.attribution_window_days AS win,
           COALESCE(c.sent_at, c.started_at, c.created_at) AS start_at,
           ARRAY(SELECT upper(btrim(x)) FROM unnest(c.coupon_codes) x WHERE btrim(x) <> '') AS codes
    FROM public.email_campaigns c
    WHERE c.id = ANY (v_active)
  ),
  orders AS (
    SELECT tenant_id, 'loja_integrada'::text AS platform, id AS order_id, order_number,
           lower(btrim(raw_json->'cliente'->>'email')) AS email,
           COALESCE(public.try_numeric(totals_json->>'total'), 0) AS total,
           created_at_remote AS ordered_at,
           upper(btrim(raw_json->'cupom_desconto'->>'codigo')) AS coupon
    FROM public.li_orders
    WHERE tenant_id = p_tenant_id AND created_at_remote >= v_since
      AND COALESCE(status_id, 0) NOT IN (7, 8, 16, 1020)
    UNION ALL
    SELECT tenant_id, 'bling', id, numero,
           lower(btrim(cliente_email)),
           COALESCE(valor_total, 0),
           data_criacao::timestamptz,
           NULL
    FROM public.bling_orders
    WHERE tenant_id = p_tenant_id AND data_criacao >= v_since
      AND COALESCE(situacao_nome, '') !~* 'cancel'
    UNION ALL
    SELECT tenant_id, 'nuvemshop', id, order_number,
           lower(btrim(raw_json->>'contact_email')),
           COALESCE(public.try_numeric(raw_json->>'total'), public.try_numeric(totals_json->>'total'), 0),
           created_at_remote,
           CASE WHEN jsonb_typeof(raw_json->'coupon') = 'array'
                THEN upper(btrim(raw_json->'coupon'->0->>'code')) END
    FROM public.nuvemshop_orders
    WHERE tenant_id = p_tenant_id AND created_at_remote >= v_since
      AND COALESCE(status, '') <> 'cancelled'
      AND COALESCE(payment_status, '') NOT IN ('refunded', 'voided')
  ),
  by_coupon AS (
    SELECT o.platform, o.order_id, o.order_number, o.email, o.total, o.ordered_at,
           c.id AS campaign_id, 1 AS prio, 'coupon'::text AS atype, c.start_at AS touch_at, o.coupon
    FROM orders o
    JOIN camp c ON o.coupon IS NOT NULL
               AND (o.coupon = ANY (c.codes)
                    OR EXISTS (SELECT 1 FROM public.email_campaign_coupons ec WHERE ec.campaign_id = c.id AND ec.code = o.coupon))
               AND o.ordered_at >= c.start_at
               AND o.ordered_at <= c.start_at + (c.win || ' days')::interval
  ),
  by_event AS (
    SELECT o.platform, o.order_id, o.order_number, o.email, o.total, o.ordered_at,
           e.campaign_id,
           CASE e.event_type WHEN 'click' THEN 2 ELSE 3 END AS prio,
           e.event_type AS atype,
           max(e.created_at) AS touch_at,
           NULL::text AS coupon
    FROM orders o
    JOIN public.email_events e
      ON e.tenant_id = p_tenant_id
     AND e.event_type IN ('click', 'open')
     AND e.campaign_id = ANY (v_active)
     AND lower(btrim(e.recipient_email)) = o.email
     AND e.created_at <= o.ordered_at
    JOIN camp c ON c.id = e.campaign_id
               AND e.created_at >= o.ordered_at - (c.win || ' days')::interval
    WHERE o.email IS NOT NULL AND o.email <> ''
    GROUP BY o.platform, o.order_id, o.order_number, o.email, o.total, o.ordered_at, e.campaign_id, e.event_type
  ),
  best AS (
    SELECT DISTINCT ON (platform, order_id) *
    FROM (SELECT * FROM by_coupon UNION ALL SELECT * FROM by_event) u
    ORDER BY platform, order_id, prio, touch_at DESC
  ),
  ins AS (
    INSERT INTO public.email_campaign_conversions
      (tenant_id, campaign_id, platform, order_id, order_number, customer_email, order_total,
       ordered_at, attribution_type, touch_at, coupon_code)
    SELECT p_tenant_id, campaign_id, platform, order_id, order_number, email, total,
           ordered_at, atype, touch_at, coupon
    FROM best
    ON CONFLICT (tenant_id, platform, order_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  UPDATE public.email_campaigns c
  SET unique_opens = s.opens,
      unique_clicks = s.clicks,
      attribution_refreshed_at = now()
  FROM (
    SELECT cc.id,
           count(DISTINCT lower(btrim(e.recipient_email))) FILTER (WHERE e.event_type = 'open')  AS opens,
           count(DISTINCT lower(btrim(e.recipient_email))) FILTER (WHERE e.event_type = 'click') AS clicks
    FROM public.email_campaigns cc
    LEFT JOIN public.email_events e ON e.campaign_id = cc.id AND e.event_type IN ('open', 'click')
    WHERE cc.id = ANY (v_active)
    GROUP BY cc.id
  ) s
  WHERE c.id = s.id;

  RETURN v_inserted;
END;
$function$;
