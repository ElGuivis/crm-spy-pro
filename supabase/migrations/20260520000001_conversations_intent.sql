-- Fase 5B: intent classification + sentiment triage for conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS intent      TEXT,  -- compra | suporte | reclamacao | outro
  ADD COLUMN IF NOT EXISTS ai_sentiment TEXT; -- positive | neutral | negative
