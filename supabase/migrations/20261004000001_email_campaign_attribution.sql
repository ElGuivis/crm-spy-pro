-- Metricas reais por campanha de e-mail: aberturas e cliques unicos + compras atribuidas.
--
-- Regra de atribuicao (um pedido conta para UMA campanha so):
--   1. cupom   - pedido usou um cupom cadastrado na campanha, dentro da janela apos o envio
--   2. clique  - o cliente (mesmo e-mail) clicou num link da campanha ate N dias antes do pedido
--   3. abertura- o cliente abriu o e-mail ate N dias antes do pedido (so se nao houve clique/cupom)
-- Vale a prioridade acima; dentro do mesmo tipo vence o contato mais recente. N = attribution_window_days
-- (padrao 7). Pedidos cancelados, devolvidos ou com chargeback nao entram.
--
-- Os resultados ficam gravados em email_campaign_conversions e so sao recalculados enquanto a campanha
-- esta "ativa" (janela + 7 dias), porque email_events e apagado depois de 90 dias (LGPD).

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS coupon_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attribution_window_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS unique_opens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attribution_refreshed_at timestamptz;

ALTER TABLE public.email_campaigns
  DROP CONSTRAINT IF EXISTS email_campaigns_attribution_window_check;
ALTER TABLE public.email_campaigns
  ADD CONSTRAINT email_campaigns_attribution_window_check CHECK (attribution_window_days BETWEEN 1 AND 30);

CREATE TABLE IF NOT EXISTS public.email_campaign_conversions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id      uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('loja_integrada', 'bling', 'nuvemshop')),
  order_id         uuid NOT NULL,
  order_number     text,
  customer_email   text,
  order_total      numeric NOT NULL DEFAULT 0,
  ordered_at       timestamptz NOT NULL,
  attribution_type text NOT NULL CHECK (attribution_type IN ('coupon', 'click', 'open')),
  touch_at         timestamptz,
  coupon_code      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform, order_id)
);

CREATE INDEX IF NOT EXISTS idx_email_conversions_campaign ON public.email_campaign_conversions (campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_tenant_type_created ON public.email_events (tenant_id, event_type, created_at);

ALTER TABLE public.email_campaign_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON public.email_campaign_conversions;
CREATE POLICY "Tenant isolation" ON public.email_campaign_conversions FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));
GRANT SELECT ON public.email_campaign_conversions TO authenticated;
GRANT ALL ON public.email_campaign_conversions TO service_role;

-- numero seguro: valor fora do padrao vira NULL em vez de derrubar a consulta
CREATE OR REPLACE FUNCTION public.try_numeric(p_text text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN btrim(p_text) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(p_text)::numeric END;
$$;
REVOKE EXECUTE ON FUNCTION public.try_numeric(text) FROM PUBLIC, anon;

-- Recalcula as conversoes das campanhas ativas do tenant e os contadores unicos de abertura/clique.
CREATE OR REPLACE FUNCTION public.refresh_email_campaign_attribution(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    JOIN camp c ON o.coupon IS NOT NULL AND o.coupon = ANY (c.codes)
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
$$;

-- Desempenho por campanha (uma ou todas as enviadas)
CREATE OR REPLACE FUNCTION public.get_email_campaign_performance(p_tenant_id uuid, p_campaign_id uuid DEFAULT NULL)
RETURNS TABLE (
  campaign_id uuid, internal_name text, subject text, status text, sent_at timestamptz,
  total_sent integer, total_delivered integer, unique_opens integer, unique_clicks integer,
  orders bigint, revenue numeric,
  orders_coupon bigint, revenue_coupon numeric,
  orders_click bigint, revenue_click numeric,
  orders_open bigint, revenue_open numeric,
  window_days integer, coupon_codes text[], refreshed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.internal_name, c.subject, c.status::text,
         COALESCE(c.sent_at, c.started_at, c.created_at),
         COALESCE(c.total_sent, 0), COALESCE(c.total_delivered, 0), c.unique_opens, c.unique_clicks,
         count(v.id), COALESCE(sum(v.order_total), 0),
         count(v.id) FILTER (WHERE v.attribution_type = 'coupon'),
         COALESCE(sum(v.order_total) FILTER (WHERE v.attribution_type = 'coupon'), 0),
         count(v.id) FILTER (WHERE v.attribution_type = 'click'),
         COALESCE(sum(v.order_total) FILTER (WHERE v.attribution_type = 'click'), 0),
         count(v.id) FILTER (WHERE v.attribution_type = 'open'),
         COALESCE(sum(v.order_total) FILTER (WHERE v.attribution_type = 'open'), 0),
         c.attribution_window_days, c.coupon_codes, c.attribution_refreshed_at
  FROM public.email_campaigns c
  LEFT JOIN public.email_campaign_conversions v ON v.campaign_id = c.id
  WHERE public.caller_has_tenant(p_tenant_id)
    AND c.tenant_id = p_tenant_id
    AND (p_campaign_id IS NULL OR c.id = p_campaign_id)
    AND (p_campaign_id IS NOT NULL OR c.status::text IN ('sent', 'sending'))
  GROUP BY c.id
  ORDER BY COALESCE(c.sent_at, c.started_at, c.created_at) DESC
  LIMIT 100;
$$;

-- Pedidos atribuidos a uma campanha
CREATE OR REPLACE FUNCTION public.get_email_campaign_conversions(p_tenant_id uuid, p_campaign_id uuid)
RETURNS TABLE (
  platform text, order_id uuid, order_number text, customer_email text, order_total numeric,
  ordered_at timestamptz, attribution_type text, touch_at timestamptz, coupon_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT v.platform, v.order_id, v.order_number, v.customer_email, v.order_total,
         v.ordered_at, v.attribution_type, v.touch_at, v.coupon_code
  FROM public.email_campaign_conversions v
  WHERE public.caller_has_tenant(p_tenant_id)
    AND v.tenant_id = p_tenant_id AND v.campaign_id = p_campaign_id
  ORDER BY v.ordered_at DESC
  LIMIT 200;
$$;

-- Links mais clicados de uma campanha
CREATE OR REPLACE FUNCTION public.get_email_campaign_top_links(p_tenant_id uuid, p_campaign_id uuid)
RETURNS TABLE (link_url text, clicks bigint, unique_clickers bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.link_url, count(*), count(DISTINCT lower(btrim(e.recipient_email)))
  FROM public.email_events e
  WHERE public.caller_has_tenant(p_tenant_id)
    AND e.tenant_id = p_tenant_id AND e.campaign_id = p_campaign_id
    AND e.event_type = 'click' AND e.link_url IS NOT NULL
  GROUP BY e.link_url
  ORDER BY 3 DESC, 2 DESC
  LIMIT 20;
$$;

REVOKE EXECUTE ON FUNCTION
  public.refresh_email_campaign_attribution(uuid),
  public.get_email_campaign_performance(uuid, uuid),
  public.get_email_campaign_conversions(uuid, uuid),
  public.get_email_campaign_top_links(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.refresh_email_campaign_attribution(uuid),
  public.get_email_campaign_performance(uuid, uuid),
  public.get_email_campaign_conversions(uuid, uuid),
  public.get_email_campaign_top_links(uuid, uuid)
TO authenticated, service_role;

-- Cron: mantem os numeros atualizados mesmo sem ninguem abrir a tela (a cada 15 min)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-attribution-refresh') THEN
    PERFORM cron.schedule(
      'email-attribution-refresh',
      '*/15 * * * *',
      $job$SELECT public.refresh_email_campaign_attribution(t.tenant_id)
           FROM (SELECT DISTINCT tenant_id FROM public.email_campaigns
                 WHERE status::text IN ('sent', 'sending')
                   AND COALESCE(sent_at, started_at, created_at) >= now() - interval '40 days') t$job$
    );
  END IF;
END
$$;
