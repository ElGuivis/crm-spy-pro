-- Variações completas da mensagem do disparo: cada contato recebe um texto sorteado entre
-- message_template e message_variants (além do spintax {Oi|Olá} dentro de cada texto).
ALTER TABLE public.bulk_campaigns
  ADD COLUMN IF NOT EXISTS message_variants text[] NOT NULL DEFAULT '{}';
