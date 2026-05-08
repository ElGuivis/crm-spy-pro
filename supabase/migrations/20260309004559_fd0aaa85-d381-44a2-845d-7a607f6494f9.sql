-- =============================================================================
-- EMAIL MARKETING - Ajustes para FASE 1
-- =============================================================================

-- Adicionar campos faltantes em email_campaigns
ALTER TABLE public.email_campaigns
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Adicionar índice para is_archived
CREATE INDEX IF NOT EXISTS idx_email_campaigns_is_archived ON public.email_campaigns(is_archived);

-- Adicionar campo is_active em email_templates  
ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;