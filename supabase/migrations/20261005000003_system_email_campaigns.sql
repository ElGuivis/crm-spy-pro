-- E-mails automaticos fora do motor de campanhas (aniversario, cashback, lembrete de cashback) agora levam link de descadastro.
-- O descadastro precisa de uma "campanha" para guardar o token e o registro: cada tenant ganha, sob demanda, uma campanha de sistema
-- por tipo (flow_kind = 'system', arquivada, nunca enviada, fora da lista e das metricas).
ALTER TABLE public.email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_flow_kind_check;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_flow_kind_check CHECK (flow_kind IS NULL OR flow_kind IN ('cart', 'browse', 'order', 'welcome', 'system'));
