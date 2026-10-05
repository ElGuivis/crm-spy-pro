-- Newsletter da loja, lista de espera ("avise-me") e descadastro em duas vias com a Loja Integrada.
--  * fluxo "welcome": boas-vindas para quem se inscreve na newsletter DEPOIS de hoje (o historico so e populado, nunca recebe nada)
--  * li_newsletter_subscribers / li_newsletter_scan_state : espelho da newsletter (a API so lista por e-mail, 100 por pagina)
--  * li_waitlist_snapshots + get_waitlist_panel : painel de reposicao
--  * li_marketing_settings + li_marketing_outbox + trigger : quem sai aqui sai da newsletter/automacoes da loja
--  * indice de e-mail em li_orders (deteccao de recuperacao e de quem ja comprou)

-- 1) tipo de fluxo "welcome"
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass AS tbl, conname FROM pg_constraint
           WHERE contype = 'c' AND conname IN ('email_campaigns_flow_kind_check', 'abandonment_flows_kind_check', 'li_abandonment_campaigns_kind_check', 'abandonment_flow_sends_kind_check')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_flow_kind_check CHECK (flow_kind IS NULL OR flow_kind IN ('cart', 'browse', 'order', 'welcome'));
ALTER TABLE public.abandonment_flows ADD CONSTRAINT abandonment_flows_kind_check CHECK (kind IN ('cart', 'browse', 'order', 'welcome'));
ALTER TABLE public.li_abandonment_campaigns ADD CONSTRAINT li_abandonment_campaigns_kind_check CHECK (kind IN ('cart', 'browse', 'order', 'welcome'));
ALTER TABLE public.abandonment_flow_sends ADD CONSTRAINT abandonment_flow_sends_kind_check CHECK (kind IN ('cart', 'browse', 'order', 'welcome'));

-- o funil agora tambem devolve a linha de "welcome"
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
  FROM (VALUES ('cart'), ('browse'), ('order'), ('welcome')) AS k(kind);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_abandonment_funnel(uuid, integer) TO authenticated;

-- 2) newsletter da loja
CREATE TABLE IF NOT EXISTS public.li_newsletter_subscribers (
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  li_id bigint NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  -- inscritos que ja estavam na loja quando conectamos: so populamos, nada e enviado para eles
  is_baseline boolean NOT NULL DEFAULT false,
  is_customer boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_scan integer NOT NULL DEFAULT 0,
  removed_at timestamptz,
  PRIMARY KEY (integration_id, li_id)
);
CREATE INDEX IF NOT EXISTS idx_li_newsletter_tenant_email ON public.li_newsletter_subscribers (tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_li_newsletter_new ON public.li_newsletter_subscribers (tenant_id, first_seen_at DESC) WHERE NOT is_baseline AND removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.li_newsletter_scan_state (
  integration_id uuid PRIMARY KEY REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  total integer NOT NULL DEFAULT 0,
  scan_no integer NOT NULL DEFAULT 0,
  next_offset integer NOT NULL DEFAULT 0,
  scanning boolean NOT NULL DEFAULT false,
  baseline_done boolean NOT NULL DEFAULT false,
  last_full_scan_at timestamptz,
  last_check_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) lista de espera
CREATE TABLE IF NOT EXISTS public.li_waitlist_snapshots (
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  product_id bigint NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_id bigint,
  sku text,
  name text,
  subscribers integer NOT NULL DEFAULT 0,
  stock integer,
  PRIMARY KEY (integration_id, snapshot_date, product_id)
);
CREATE INDEX IF NOT EXISTS idx_li_waitlist_tenant_date ON public.li_waitlist_snapshots (tenant_id, snapshot_date DESC);

-- Painel de reposicao: ultimo retrato com a tendencia de 7 dias, estoque atual do catalogo e se voltou ao estoque
CREATE OR REPLACE FUNCTION public.get_waitlist_panel(p_tenant_id uuid, p_limit integer DEFAULT 200)
RETURNS TABLE (product_id bigint, parent_id bigint, sku text, name text, subscribers integer, snapshot_stock integer, current_stock integer,
               delta_7d integer, restocked boolean, image_url text, snapshot_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_date date;
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT max(s.snapshot_date) INTO v_date FROM public.li_waitlist_snapshots s WHERE s.tenant_id = p_tenant_id;
  IF v_date IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.product_id, c.parent_id, c.sku, c.name, c.subscribers, c.stock,
         p.stock,
         c.subscribers - COALESCE(prev.subscribers, c.subscribers),
         (COALESCE(p.stock, c.stock, 0) > 0 AND EXISTS (SELECT 1 FROM public.li_waitlist_snapshots o
            WHERE o.tenant_id = p_tenant_id AND o.product_id = c.product_id AND o.snapshot_date >= v_date - 30 AND o.snapshot_date < v_date AND COALESCE(o.stock, 0) <= 0)),
         COALESCE(p.image_url, pp.image_url),
         c.snapshot_date
  FROM public.li_waitlist_snapshots c
  LEFT JOIN LATERAL (SELECT o.subscribers FROM public.li_waitlist_snapshots o
                      WHERE o.tenant_id = p_tenant_id AND o.product_id = c.product_id AND o.snapshot_date <= v_date - 7
                      ORDER BY o.snapshot_date DESC LIMIT 1) prev ON true
  LEFT JOIN public.li_products p ON p.integration_id = c.integration_id AND p.loja_integrada_product_id = c.product_id
  LEFT JOIN public.li_products pp ON pp.integration_id = c.integration_id AND pp.loja_integrada_product_id = c.parent_id
  WHERE c.tenant_id = p_tenant_id AND c.snapshot_date = v_date
  ORDER BY (COALESCE(p.stock, c.stock, 0) <= 0) DESC, c.subscribers DESC
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_waitlist_panel(uuid, integer) TO authenticated;

-- 4) descadastro em duas vias
CREATE TABLE IF NOT EXISTS public.li_marketing_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- quem sai da nossa lista (descadastro, reclamacao, e-mail invalido) tambem sai da newsletter e das automacoes da loja
  sync_unsubscribes boolean NOT NULL DEFAULT true,
  -- avisa no CRM quando um produto com muita gente na lista de espera volta ao estoque
  waitlist_alert boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.li_marketing_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('unsubscribe', 'newsletter_subscribe')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_li_outbox_pending ON public.li_marketing_outbox (next_attempt_at) WHERE status = 'pending';

ALTER TABLE public.li_newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_newsletter_scan_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_waitlist_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_marketing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_marketing_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select" ON public.li_newsletter_subscribers;
CREATE POLICY "Tenant select" ON public.li_newsletter_subscribers FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.li_newsletter_scan_state;
CREATE POLICY "Tenant select" ON public.li_newsletter_scan_state FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.li_waitlist_snapshots;
CREATE POLICY "Tenant select" ON public.li_waitlist_snapshots FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant isolation" ON public.li_marketing_settings;
CREATE POLICY "Tenant isolation" ON public.li_marketing_settings FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.li_marketing_outbox;
CREATE POLICY "Tenant select" ON public.li_marketing_outbox FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Quem entra na lista de supressao (descadastro pelo link, reclamacao, bounce, invalido, bloqueio) vai para a fila da loja.
-- Entradas que vieram da propria newsletter da loja (source = 'li_newsletter') nao voltam para ela.
CREATE OR REPLACE FUNCTION public.enqueue_li_unsubscribe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.source, '') = 'li_newsletter' THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT s.sync_unsubscribes FROM public.li_marketing_settings s WHERE s.tenant_id = NEW.tenant_id), true) THEN RETURN NEW; END IF;
  INSERT INTO public.li_marketing_outbox (tenant_id, integration_id, kind, payload)
  SELECT NEW.tenant_id, i.id, 'unsubscribe', jsonb_build_object('email', NEW.email, 'reason', NEW.reason)
  FROM public.integrations i WHERE i.tenant_id = NEW.tenant_id AND i.type = 'loja_integrada' AND i.status = 'connected';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enqueue_li_unsubscribe ON public.email_suppression_list;
CREATE TRIGGER trg_enqueue_li_unsubscribe AFTER INSERT ON public.email_suppression_list
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_li_unsubscribe();

-- 5) desempenho: e-mail do cliente do pedido (recuperacao, "ja comprou")
CREATE INDEX IF NOT EXISTS idx_li_orders_email ON public.li_orders (tenant_id, (lower(btrim(raw_json->'cliente'->>'email'))), created_at_remote);

-- Marca quem da newsletter ja e cliente (para o painel; nao muda nenhum envio)
CREATE OR REPLACE FUNCTION public.refresh_newsletter_customers(p_integration_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH upd AS (
    UPDATE public.li_newsletter_subscribers n SET is_customer = true
    WHERE n.integration_id = p_integration_id AND NOT n.is_customer
      AND EXISTS (SELECT 1 FROM public.li_customers c WHERE c.tenant_id = n.tenant_id AND lower(btrim(c.email)) = n.email)
    RETURNING 1)
  SELECT count(*)::int FROM upd;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_newsletter_customers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_newsletter_customers(uuid) TO service_role;

-- 6) crons: varredura da newsletter (15 min), fila da loja (5 min), lista de espera (diario, 06:10 UTC)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'li-newsletter-sync') THEN
    PERFORM cron.schedule('li-newsletter-sync', '*/15 * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/li-marketing-jobs',
                           headers := public.get_internal_headers(), body := '{"job":"newsletter"}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'li-marketing-outbox') THEN
    PERFORM cron.schedule('li-marketing-outbox', '*/5 * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/li-marketing-jobs',
                           headers := public.get_internal_headers(), body := '{"job":"outbox"}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'li-waitlist-sync') THEN
    PERFORM cron.schedule('li-waitlist-sync', '10 6 * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/li-marketing-jobs',
                           headers := public.get_internal_headers(), body := '{"job":"waitlist"}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
END
$$;
