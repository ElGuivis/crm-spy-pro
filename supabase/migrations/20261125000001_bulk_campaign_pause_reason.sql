-- Motivo da pausa automática do disparo em massa (ex.: número restrito/desconectado).
ALTER TABLE public.bulk_campaigns ADD COLUMN IF NOT EXISTS pause_reason text;
