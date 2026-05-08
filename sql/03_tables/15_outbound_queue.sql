-- =============================================================================
-- TABELA DE FILA DE MENSAGENS DE SAÍDA
-- =============================================================================

-- -----------------------------------------------------------------------------
-- OUTBOUND_QUEUE (Fila de Mensagens de Saída)
-- -----------------------------------------------------------------------------
CREATE TABLE public.outbound_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  channel_id UUID NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  to_phone_e164 TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed'
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.outbound_queue IS 'Fila de mensagens de saída para processamento assíncrono';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_outbound_queue_tenant_id ON public.outbound_queue(tenant_id);
CREATE INDEX idx_outbound_queue_status ON public.outbound_queue(status);
CREATE INDEX idx_outbound_queue_next_retry ON public.outbound_queue(next_retry_at);
CREATE INDEX idx_outbound_queue_channel_id ON public.outbound_queue(channel_id);
