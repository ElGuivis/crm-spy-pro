-- Google Ads Manager (fase 3): escrita controlada. Guarda o "endereco" do orcamento de cada campanha
-- (a API altera o orcamento, nao a campanha) e se ele e compartilhado (nesse caso o sistema nao mexe).
ALTER TABLE public.google_ads_campaigns
  ADD COLUMN IF NOT EXISTS budget_resource_name text,
  ADD COLUMN IF NOT EXISTS budget_explicitly_shared boolean;

COMMENT ON COLUMN public.google_ads_campaigns.budget_resource_name IS
  'customers/<id>/campaignBudgets/<id>: recurso que a API altera para mudar o orcamento diario.';

NOTIFY pgrst, 'reload schema';
