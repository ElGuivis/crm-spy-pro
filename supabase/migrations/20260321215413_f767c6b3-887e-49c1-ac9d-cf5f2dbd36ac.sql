
-- Dead Letter Queue (unified for all channels)
CREATE TABLE public.dead_letter_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_queue TEXT NOT NULL, -- 'outbound_queue', 'instagram_outbox', etc.
  source_item_id UUID NOT NULL,
  channel_type TEXT NOT NULL, -- 'whatsapp', 'instagram', etc.
  channel_id UUID,
  destination TEXT NOT NULL, -- phone number or IGSID
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  correlation_id TEXT,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'dead', -- 'dead', 'retried', 'discarded'
  retried_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_dead_letter_queue_tenant ON public.dead_letter_queue(tenant_id);
CREATE INDEX idx_dead_letter_queue_status ON public.dead_letter_queue(status);
CREATE INDEX idx_dead_letter_queue_source ON public.dead_letter_queue(source_queue);
CREATE INDEX idx_dead_letter_queue_correlation ON public.dead_letter_queue(correlation_id);

ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view dead letters"
  ON public.dead_letter_queue FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- Circuit Breaker State
CREATE TABLE public.circuit_breaker_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL, -- 'evolution', 'meta', 'bling', 'melhor_envio'
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'closed', -- 'closed', 'open', 'half_open'
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  opened_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider, tenant_id)
);

CREATE INDEX idx_circuit_breaker_tenant ON public.circuit_breaker_state(tenant_id);
CREATE INDEX idx_circuit_breaker_state ON public.circuit_breaker_state(state);

ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view circuit breaker state"
  ON public.circuit_breaker_state FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- Function metrics tracking
CREATE TABLE public.function_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  correlation_id TEXT,
  status TEXT NOT NULL DEFAULT 'ok', -- 'ok', 'error'
  duration_ms INTEGER,
  items_processed INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  items_dead INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_function_metrics_name ON public.function_metrics(function_name);
CREATE INDEX idx_function_metrics_created ON public.function_metrics(created_at);
CREATE INDEX idx_function_metrics_tenant ON public.function_metrics(tenant_id);
CREATE INDEX idx_function_metrics_status ON public.function_metrics(status);

ALTER TABLE public.function_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view function metrics"
  ON public.function_metrics FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL OR public.is_tenant_admin(auth.uid(), tenant_id)
  );
