-- Dois estados novos para propostas, para nao perder o que realmente aconteceu:
--  blocked  = barrada pelo revisor (conflito, mudanca pequena, poucos dados, duplicata); o motivo fica em `error`; volta sozinha se a situacao mudar.
--  resolved = deixou de valer porque o objetivo ja foi atingido (ex.: termo ja negativado, meta ja desligada), por outro caminho.
ALTER TABLE public.google_ads_recommendations DROP CONSTRAINT IF EXISTS google_ads_recommendations_status_check;
ALTER TABLE public.google_ads_recommendations ADD CONSTRAINT google_ads_recommendations_status_check
  CHECK (status = ANY (ARRAY['pending','approved','rejected','applied','failed','expired','blocked','resolved']));
