-- Membros de audiencia RFM apontam para o snapshot atual: sem chave estrangeira o embed do PostgREST
-- (usado em email-campaign-send/audience-resolvers.ts) nao funcionava e linhas apagadas deixavam membros orfaos.
DELETE FROM public.rfm_audience_members m
WHERE NOT EXISTS (SELECT 1 FROM public.customer_rfm_snapshots s WHERE s.id = m.snapshot_id);

ALTER TABLE public.rfm_audience_members
  ADD CONSTRAINT rfm_audience_members_snapshot_id_fkey
  FOREIGN KEY (snapshot_id) REFERENCES public.customer_rfm_snapshots(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_rfm_audience_members_snapshot ON public.rfm_audience_members (snapshot_id);
