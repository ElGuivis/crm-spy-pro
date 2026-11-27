-- Alarme dos números de WhatsApp (27/11/2026). O número Outback ficou 16 h "conectado" sem receber nada
-- e ninguém percebeu. O verificador da VPS (/opt/spypro-monitor/wa_health.py, cron 5 min) olha a Evolution
-- e grava aqui um alerta aberto por (integração, tipo); quando o problema some, preenche resolved_at.
-- A tela mostra os abertos num aviso no topo e no sino.

CREATE TABLE IF NOT EXISTS public.whatsapp_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('disconnected', 'unstable', 'session_conflict', 'not_receiving', 'not_reaching_system')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- no máximo 1 alerta aberto por número e tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_health_alert_open
  ON public.whatsapp_health_alerts (integration_id, kind) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_health_alerts_tenant_open
  ON public.whatsapp_health_alerts (tenant_id, created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.whatsapp_health_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant reads own whatsapp health alerts" ON public.whatsapp_health_alerts;
CREATE POLICY "tenant reads own whatsapp health alerts" ON public.whatsapp_health_alerts
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id((SELECT auth.uid()))));

REVOKE ALL ON public.whatsapp_health_alerts FROM anon;
GRANT SELECT ON public.whatsapp_health_alerts TO authenticated;
