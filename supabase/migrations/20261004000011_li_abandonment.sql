-- Recuperacao de carrinho/navegacao/pedido abandonado a partir da API de Marketing da Loja Integrada (/v3/marketing).
--  * li_abandonment_campaigns : espelho das "campanhas" da loja (um registro por carrinho/navegacao/pedido abandonado)
--  * abandonment_flows        : fluxo configurado por tipo (etapas, atrasos, canais, cupom), sempre nasce DESLIGADO
--  * abandonment_flow_sends   : o que ja foi enviado (unico por registro + etapa + canal: nunca envia duas vezes)
--  * li_native_toggle_log     : auditoria de quem ligou/desligou a automacao nativa da loja
--  * email_campaigns.flow_kind/flow_step : cada etapa de e-mail e uma campanha "de fluxo" (editor, rastreio e metricas reaproveitados)
-- Tambem: atribuicao de compra por UTM (utm_campaign do pedido = slug do nome da campanha) e deteccao de recuperacao.

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS flow_kind text CHECK (flow_kind IS NULL OR flow_kind IN ('cart', 'browse', 'order')),
  ADD COLUMN IF NOT EXISTS flow_step text;
CREATE INDEX IF NOT EXISTS idx_email_campaigns_flow ON public.email_campaigns (tenant_id, flow_kind) WHERE flow_kind IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.abandonment_flows (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cart', 'browse', 'order')),
  enabled boolean NOT NULL DEFAULT false,
  email_integration_id uuid REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  whatsapp_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  -- [{id, delay_minutes, email:{enabled, campaign_id}, whatsapp:{enabled, text}, coupon: UniqueCouponConfig|null}]
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiet_start time NOT NULL DEFAULT '21:00',
  quiet_end time NOT NULL DEFAULT '08:00',
  max_event_age_hours integer NOT NULL DEFAULT 96 CHECK (max_event_age_hours BETWEEN 1 AND 720),
  cooldown_days integer NOT NULL DEFAULT 3 CHECK (cooldown_days BETWEEN 0 AND 60),
  min_value numeric NOT NULL DEFAULT 0,
  -- ao atender uma pessoa, ela sai da automacao nativa da loja (evita receber em dobro sem desligar a nativa inteira)
  opt_out_native boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind)
);

CREATE TABLE IF NOT EXISTS public.li_abandonment_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  li_campaign_id bigint NOT NULL,
  automation_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cart', 'browse', 'order')),
  rule_id bigint,
  li_status text,
  value numeric NOT NULL DEFAULT 0,
  -- [{product_id, quantity, name, price, image, url}] ja normalizado
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  product_ids bigint[] NOT NULL DEFAULT '{}',
  recipient_email text,
  recipient_name text,
  recipient_phone text,
  client_id bigint,
  event_at timestamptz,
  li_last_sent_at timestamptz,
  cart_json jsonb,
  details_fetched_at timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  gone_at timestamptz,
  flow_status text NOT NULL DEFAULT 'open' CHECK (flow_status IN ('open', 'recovered', 'expired', 'excluded', 'done')),
  recovered_at timestamptz,
  recovered_order_id uuid,
  recovered_total numeric,
  recovered_via text CHECK (recovered_via IS NULL OR recovered_via IN ('ours', 'other')),
  CONSTRAINT li_abandonment_campaigns_uniq UNIQUE (integration_id, li_campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_li_abandon_tenant_kind ON public.li_abandonment_campaigns (tenant_id, kind, flow_status, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_li_abandon_email ON public.li_abandonment_campaigns (tenant_id, lower(recipient_email));

CREATE TABLE IF NOT EXISTS public.abandonment_flow_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  abandonment_id uuid NOT NULL REFERENCES public.li_abandonment_campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cart', 'browse', 'order')),
  step_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  reason text,
  coupon_code text,
  flow_campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT abandonment_flow_sends_uniq UNIQUE (abandonment_id, step_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_abandon_sends_tenant ON public.abandonment_flow_sends (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.li_native_toggle_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  toggle_key text NOT NULL,
  from_state boolean,
  to_state boolean NOT NULL,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_abandonment_flows_updated_at ON public.abandonment_flows;
CREATE TRIGGER update_abandonment_flows_updated_at BEFORE UPDATE ON public.abandonment_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.abandonment_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_abandonment_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandonment_flow_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_native_toggle_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON public.abandonment_flows;
CREATE POLICY "Tenant isolation" ON public.abandonment_flows FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.li_abandonment_campaigns;
CREATE POLICY "Tenant select" ON public.li_abandonment_campaigns FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.abandonment_flow_sends;
CREATE POLICY "Tenant select" ON public.abandonment_flow_sends FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.li_native_toggle_log;
CREATE POLICY "Tenant select" ON public.li_native_toggle_log FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Realtime so a tela de carrinhos atualiza sozinha
ALTER TABLE public.li_abandonment_campaigns REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'li_abandonment_campaigns') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.li_abandonment_campaigns;
  END IF;
END $$;

-- "Black Friday 2026!" -> "black-friday-2026" (mesma regra de _shared/email-tracking.ts utmSlug)
CREATE OR REPLACE FUNCTION public.utm_slug(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT left(btrim(regexp_replace(translate(lower(coalesce(p_name, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'), '-'), 60)
$$;

-- Contadores de uma campanha de fluxo: ela e "enviada" desde o primeiro disparo e continua somando.
CREATE OR REPLACE FUNCTION public.bump_flow_campaign(p_campaign_id uuid, p_ok boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  UPDATE public.email_campaigns
  SET total_sent = COALESCE(total_sent, 0) + CASE WHEN p_ok THEN 1 ELSE 0 END,
      total_delivered = COALESCE(total_delivered, 0) + CASE WHEN p_ok THEN 1 ELSE 0 END,
      total_recipients = COALESCE(total_recipients, 0) + 1,
      status = 'sent',
      sent_at = COALESCE(sent_at, now()),
      completed_at = now()
  WHERE id = p_campaign_id AND flow_kind IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.bump_flow_campaign(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_flow_campaign(uuid, boolean) TO service_role;

-- Recuperacao: compra do mesmo e-mail depois do abandono. "ours" quando enviamos algo antes da compra.
-- Para as nossas, grava a conversao na ultima campanha de e-mail enviada (tipo 'recovery').
ALTER TABLE public.email_campaign_conversions DROP CONSTRAINT IF EXISTS email_campaign_conversions_attribution_type_check;
ALTER TABLE public.email_campaign_conversions ADD CONSTRAINT email_campaign_conversions_attribution_type_check
  CHECK (attribution_type = ANY (ARRAY['coupon'::text, 'utm'::text, 'click'::text, 'open'::text, 'recovery'::text]));

CREATE OR REPLACE FUNCTION public.refresh_abandonment_recovery()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_count integer := 0;
BEGIN
  WITH hit AS (
    SELECT DISTINCT ON (a.id)
           a.id AS a_id, a.tenant_id, o.id AS order_id, o.order_number, o.created_at_remote AS ordered_at,
           lower(btrim(o.raw_json->'cliente'->>'email')) AS email,
           COALESCE(public.try_numeric(o.totals_json->>'total'), 0) AS total,
           (SELECT s.flow_campaign_id FROM public.abandonment_flow_sends s
             WHERE s.abandonment_id = a.id AND s.channel = 'email' AND s.status = 'sent' AND s.sent_at <= o.created_at_remote
             ORDER BY s.sent_at DESC LIMIT 1) AS flow_campaign_id,
           EXISTS (SELECT 1 FROM public.abandonment_flow_sends s
             WHERE s.abandonment_id = a.id AND s.status = 'sent' AND s.sent_at <= o.created_at_remote) AS ours
    FROM public.li_abandonment_campaigns a
    JOIN public.li_orders o
      ON o.tenant_id = a.tenant_id
     AND lower(btrim(o.raw_json->'cliente'->>'email')) = lower(btrim(a.recipient_email))
     AND o.created_at_remote >= a.event_at
     AND o.created_at_remote <= a.event_at + interval '7 days'
     AND COALESCE(o.status_id, 0) NOT IN (7, 8, 16, 1020)
    WHERE a.flow_status IN ('open', 'done', 'expired') AND a.recipient_email IS NOT NULL AND a.event_at IS NOT NULL
      AND a.event_at >= now() - interval '30 days'
    ORDER BY a.id, o.created_at_remote
  ), upd AS (
    UPDATE public.li_abandonment_campaigns a
    SET flow_status = 'recovered', recovered_at = h.ordered_at, recovered_order_id = h.order_id, recovered_total = h.total,
        recovered_via = CASE WHEN h.ours THEN 'ours' ELSE 'other' END
    FROM hit h WHERE a.id = h.a_id
    RETURNING a.id
  ), conv AS (
    INSERT INTO public.email_campaign_conversions
      (tenant_id, campaign_id, platform, order_id, order_number, customer_email, order_total, ordered_at, attribution_type, touch_at)
    SELECT h.tenant_id, h.flow_campaign_id, 'loja_integrada', h.order_id, h.order_number, h.email, h.total, h.ordered_at, 'recovery', h.ordered_at
    FROM hit h WHERE h.ours AND h.flow_campaign_id IS NOT NULL
    ON CONFLICT (tenant_id, platform, order_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_abandonment_recovery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_abandonment_recovery() TO service_role;

-- Funil da recuperacao por tipo (ultimos N dias)
CREATE OR REPLACE FUNCTION public.get_abandonment_funnel(p_tenant_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE (kind text, captured integer, with_contact integer, contacted integer, opened integer, clicked integer,
               recovered_ours integer, recovered_other integer, revenue_ours numeric, whatsapp_sent integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT k.kind,
    (SELECT count(*)::int FROM public.li_abandonment_campaigns a WHERE a.tenant_id = p_tenant_id AND a.kind = k.kind AND a.event_at >= now() - make_interval(days => p_days)),
    (SELECT count(*)::int FROM public.li_abandonment_campaigns a WHERE a.tenant_id = p_tenant_id AND a.kind = k.kind AND a.event_at >= now() - make_interval(days => p_days) AND (a.recipient_email IS NOT NULL OR a.recipient_phone IS NOT NULL)),
    (SELECT count(DISTINCT s.abandonment_id)::int FROM public.abandonment_flow_sends s WHERE s.tenant_id = p_tenant_id AND s.kind = k.kind AND s.status = 'sent' AND s.sent_at >= now() - make_interval(days => p_days)),
    (SELECT count(DISTINCT s.abandonment_id)::int FROM public.abandonment_flow_sends s
       JOIN public.li_abandonment_campaigns a ON a.id = s.abandonment_id
       JOIN public.email_events e ON e.campaign_id = s.flow_campaign_id AND e.event_type = 'open' AND lower(btrim(e.recipient_email)) = lower(btrim(a.recipient_email))
      WHERE s.tenant_id = p_tenant_id AND s.kind = k.kind AND s.channel = 'email' AND s.status = 'sent' AND s.sent_at >= now() - make_interval(days => p_days)),
    (SELECT count(DISTINCT s.abandonment_id)::int FROM public.abandonment_flow_sends s
       JOIN public.li_abandonment_campaigns a ON a.id = s.abandonment_id
       JOIN public.email_events e ON e.campaign_id = s.flow_campaign_id AND e.event_type = 'click' AND lower(btrim(e.recipient_email)) = lower(btrim(a.recipient_email))
      WHERE s.tenant_id = p_tenant_id AND s.kind = k.kind AND s.channel = 'email' AND s.status = 'sent' AND s.sent_at >= now() - make_interval(days => p_days)),
    (SELECT count(*)::int FROM public.li_abandonment_campaigns a WHERE a.tenant_id = p_tenant_id AND a.kind = k.kind AND a.recovered_via = 'ours' AND a.event_at >= now() - make_interval(days => p_days)),
    (SELECT count(*)::int FROM public.li_abandonment_campaigns a WHERE a.tenant_id = p_tenant_id AND a.kind = k.kind AND a.recovered_via = 'other' AND a.event_at >= now() - make_interval(days => p_days)),
    (SELECT COALESCE(sum(a.recovered_total), 0) FROM public.li_abandonment_campaigns a WHERE a.tenant_id = p_tenant_id AND a.kind = k.kind AND a.recovered_via = 'ours' AND a.event_at >= now() - make_interval(days => p_days)),
    (SELECT count(*)::int FROM public.abandonment_flow_sends s WHERE s.tenant_id = p_tenant_id AND s.kind = k.kind AND s.channel = 'whatsapp' AND s.status = 'sent' AND s.sent_at >= now() - make_interval(days => p_days))
  FROM (VALUES ('cart'), ('browse'), ('order')) AS k(kind);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_abandonment_funnel(uuid, integer) TO authenticated;

-- Atribuicao de compra: agora tambem por UTM (utm_campaign do pedido = slug do nome da campanha).
-- Ordem de confianca: cupom > UTM > clique > abertura. Conversoes de recuperacao (tipo 'recovery') nao sao recalculadas aqui.
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
  WHERE tenant_id = p_tenant_id AND campaign_id = ANY (v_active) AND attribution_type <> 'recovery';

  WITH camp AS (
    SELECT c.id, c.attribution_window_days AS win,
           COALESCE(c.sent_at, c.started_at, c.created_at) AS start_at,
           public.utm_slug(c.internal_name) AS slug,
           ARRAY(SELECT upper(btrim(x)) FROM unnest(c.coupon_codes) x WHERE btrim(x) <> '') AS codes
    FROM public.email_campaigns c
    WHERE c.id = ANY (v_active)
  ),
  orders AS (
    SELECT tenant_id, 'loja_integrada'::text AS platform, id AS order_id, order_number,
           lower(btrim(raw_json->'cliente'->>'email')) AS email,
           COALESCE(public.try_numeric(totals_json->>'total'), 0) AS total,
           created_at_remote AS ordered_at,
           upper(btrim(raw_json->'cupom_desconto'->>'codigo')) AS coupon,
           NULLIF(lower(btrim(raw_json->>'utm_campaign')), '') AS utm
    FROM public.li_orders
    WHERE tenant_id = p_tenant_id AND created_at_remote >= v_since
      AND COALESCE(status_id, 0) NOT IN (7, 8, 16, 1020)
    UNION ALL
    SELECT tenant_id, 'bling', id, numero,
           lower(btrim(cliente_email)),
           COALESCE(valor_total, 0),
           data_criacao::timestamptz,
           NULL, NULL
    FROM public.bling_orders
    WHERE tenant_id = p_tenant_id AND data_criacao >= v_since
      AND COALESCE(situacao_nome, '') !~* 'cancel'
    UNION ALL
    SELECT tenant_id, 'nuvemshop', id, order_number,
           lower(btrim(raw_json->>'contact_email')),
           COALESCE(public.try_numeric(raw_json->>'total'), public.try_numeric(totals_json->>'total'), 0),
           created_at_remote,
           CASE WHEN jsonb_typeof(raw_json->'coupon') = 'array'
                THEN upper(btrim(raw_json->'coupon'->0->>'code')) END,
           NULL
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
  by_utm AS (
    SELECT o.platform, o.order_id, o.order_number, o.email, o.total, o.ordered_at,
           c.id AS campaign_id, 2 AS prio, 'utm'::text AS atype, c.start_at AS touch_at, NULL::text AS coupon
    FROM orders o
    JOIN camp c ON o.utm IS NOT NULL AND c.slug <> '' AND o.utm = c.slug
               AND o.ordered_at >= c.start_at
               AND o.ordered_at <= c.start_at + (c.win || ' days')::interval
  ),
  by_event AS (
    SELECT o.platform, o.order_id, o.order_number, o.email, o.total, o.ordered_at,
           e.campaign_id,
           CASE e.event_type WHEN 'click' THEN 3 ELSE 4 END AS prio,
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
    FROM (SELECT * FROM by_coupon UNION ALL SELECT * FROM by_utm UNION ALL SELECT * FROM by_event) u
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

-- Crons: captura dos carrinhos (10 min) e processador do fluxo (1 min)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'abandonment-capture') THEN
    PERFORM cron.schedule('abandonment-capture', '*/10 * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/abandonment-capture',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'abandonment-processor') THEN
    PERFORM cron.schedule('abandonment-processor', '* * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/abandonment-processor',
                           headers := public.get_internal_headers(), body := '{}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
END
$$;
