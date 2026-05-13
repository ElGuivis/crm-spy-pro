-- =============================================================================
-- Nuvemshop integration: tabelas, RLS, criptografia de token, realtime, watchdog
-- Padrão espelhado da integração Bling/Loja Integrada.
-- =============================================================================

-- ── 1) nuvemshop_connections (token criptografado, 1 por tenant) ─────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by_user_id UUID,
  store_id BIGINT NOT NULL,                 -- Nuvemshop user_id == store_id
  store_name TEXT,
  store_url TEXT,
  store_country TEXT,
  store_email TEXT,
  scope TEXT,
  access_token TEXT DEFAULT '',             -- cleared by trigger
  access_token_encrypted TEXT,              -- encrypted value (vault)
  status TEXT NOT NULL DEFAULT 'connected',  -- connected | disconnected
  last_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_nuvemshop_connections_tenant ON public.nuvemshop_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_connections_store ON public.nuvemshop_connections(store_id);

ALTER TABLE public.nuvemshop_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY nuvemshop_connections_tenant_isolation ON public.nuvemshop_connections
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Token-encryption trigger (same pattern as encrypt_bling_tokens)
CREATE OR REPLACE FUNCTION public.encrypt_nuvemshop_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
      NEW.access_token := '';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_encrypt_nuvemshop_tokens ON public.nuvemshop_connections;
CREATE TRIGGER trg_encrypt_nuvemshop_tokens
  BEFORE INSERT OR UPDATE ON public.nuvemshop_connections
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_nuvemshop_tokens();

-- ── 2) nuvemshop_customers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  nuvemshop_customer_id BIGINT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  doc TEXT,
  address_json JSONB,
  total_spent NUMERIC(14,2),
  total_orders INT,
  raw_json JSONB,
  updated_at_remote TIMESTAMPTZ,
  updated_at_local TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (integration_id, nuvemshop_customer_id)
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_customers_tenant ON public.nuvemshop_customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_customers_email ON public.nuvemshop_customers(email);

ALTER TABLE public.nuvemshop_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY nuvemshop_customers_tenant_isolation ON public.nuvemshop_customers
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ── 3) nuvemshop_products ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  nuvemshop_product_id BIGINT NOT NULL,
  sku TEXT,
  name TEXT,
  handle TEXT,
  description TEXT,
  price NUMERIC(14,2),
  promotional_price NUMERIC(14,2),
  cost_price NUMERIC(14,2),
  stock INT,
  stock_managed BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  variations_json JSONB,
  image_url TEXT,
  raw_json JSONB,
  updated_at_remote TIMESTAMPTZ,
  updated_at_local TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (integration_id, nuvemshop_product_id)
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_tenant ON public.nuvemshop_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_products_sku ON public.nuvemshop_products(sku);

ALTER TABLE public.nuvemshop_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY nuvemshop_products_tenant_isolation ON public.nuvemshop_products
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ── 4) nuvemshop_orders ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  nuvemshop_order_id BIGINT NOT NULL,
  order_number TEXT,
  status TEXT,
  payment_status TEXT,
  shipping_status TEXT,
  customer_id UUID REFERENCES public.nuvemshop_customers(id) ON DELETE SET NULL,
  totals_json JSONB,
  shipping_json JSONB,
  payment_json JSONB,
  items_json JSONB,
  raw_json JSONB,
  created_at_remote TIMESTAMPTZ,
  updated_at_remote TIMESTAMPTZ,
  updated_at_local TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (integration_id, nuvemshop_order_id)
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_tenant ON public.nuvemshop_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_status ON public.nuvemshop_orders(status);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_customer ON public.nuvemshop_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_orders_created_remote ON public.nuvemshop_orders(created_at_remote);

ALTER TABLE public.nuvemshop_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY nuvemshop_orders_tenant_isolation ON public.nuvemshop_orders
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ── 5) nuvemshop_order_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.nuvemshop_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  nuvemshop_product_id BIGINT,
  nuvemshop_variant_id BIGINT,
  sku TEXT,
  name TEXT,
  qty INT,
  price NUMERIC(14,2),
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_order_items_order ON public.nuvemshop_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_order_items_tenant ON public.nuvemshop_order_items(tenant_id);

ALTER TABLE public.nuvemshop_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY nuvemshop_order_items_tenant_isolation ON public.nuvemshop_order_items
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ── 6) nuvemshop_sync_state (resume points por entityType) ───────────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL,        -- customers | products | orders
  last_synced_at TIMESTAMPTZ,
  last_page INT DEFAULT 0,
  records_synced INT DEFAULT 0,
  total_count INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (integration_id, entity_type)
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_sync_state_tenant ON public.nuvemshop_sync_state(tenant_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_sync_state_updated ON public.nuvemshop_sync_state(updated_at);

ALTER TABLE public.nuvemshop_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY nuvemshop_sync_state_tenant_isolation ON public.nuvemshop_sync_state
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ── 7) nuvemshop_webhook_events (audit operacional + LGPD) ───────────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  tenant_id UUID,
  event TEXT NOT NULL,              -- "order/created", "store/redact", etc.
  store_id BIGINT,
  resource_id TEXT,
  payload_json JSONB,
  status TEXT NOT NULL DEFAULT 'received',  -- received | processing | processed | failed
  error TEXT,
  retry_count INT DEFAULT 0,
  dedupe_key TEXT UNIQUE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_events_integration ON public.nuvemshop_webhook_events(integration_id);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_events_event ON public.nuvemshop_webhook_events(event);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_webhook_events_received ON public.nuvemshop_webhook_events(received_at);

ALTER TABLE public.nuvemshop_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY nuvemshop_webhook_events_tenant_isolation ON public.nuvemshop_webhook_events
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ── 8) nuvemshop_lgpd_events (audit trail dedicado para LGPD) ────────────────
CREATE TABLE IF NOT EXISTS public.nuvemshop_lgpd_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  tenant_id UUID,
  event_type TEXT NOT NULL,         -- store/redact | customers/redact | customers/data_request
  store_id BIGINT,
  customer_id BIGINT,
  orders_to_redact JSONB,
  payload_json JSONB NOT NULL,
  hmac_valid BOOLEAN,
  status TEXT NOT NULL DEFAULT 'received',  -- received | processed | failed
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_lgpd_events_type ON public.nuvemshop_lgpd_events(event_type);
CREATE INDEX IF NOT EXISTS idx_nuvemshop_lgpd_events_created ON public.nuvemshop_lgpd_events(created_at);

ALTER TABLE public.nuvemshop_lgpd_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY nuvemshop_lgpd_events_tenant_isolation ON public.nuvemshop_lgpd_events
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ── 9) Realtime publication ──────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='nuvemshop_orders';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nuvemshop_orders;
  END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='nuvemshop_customers';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nuvemshop_customers;
  END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='nuvemshop_products';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nuvemshop_products;
  END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='nuvemshop_sync_state';
  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.nuvemshop_sync_state;
  END IF;
END $$;

ALTER TABLE public.nuvemshop_orders REPLICA IDENTITY FULL;
ALTER TABLE public.nuvemshop_customers REPLICA IDENTITY FULL;
ALTER TABLE public.nuvemshop_products REPLICA IDENTITY FULL;
ALTER TABLE public.nuvemshop_sync_state REPLICA IDENTITY FULL;

-- ── 10) Watchdog cron: detecta sync travado e re-aciona job-processor ────────
-- Same pattern as li-sync-watchdog.
DO $$
BEGIN
  PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'nuvemshop-sync-watchdog' LIMIT 1));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'nuvemshop-sync-watchdog',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/nuvemshop-job-processor',
    headers := public.get_internal_headers(),
    body := jsonb_build_object('integration_id', s.integration_id)
  )
  FROM public.nuvemshop_sync_state s
  JOIN public.integrations i ON i.id = s.integration_id
  WHERE s.last_page > 0
    AND s.updated_at < NOW() - INTERVAL '90 seconds'
    AND i.type = 'nuvemshop'
    AND i.status = 'connected';
  $$
);
