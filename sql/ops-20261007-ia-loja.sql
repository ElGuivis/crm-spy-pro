-- Ajustes de dados da IA da loja (07/10/2026). Rodar DEPOIS da migration 20261007000003_tenant_business_profiles.sql.
-- Uso na VPS:
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < ops-20261007-ia-loja.sql

-- 1) Painel de IA: a credencial Groq foi gravada sem a linha de integracao que a tela usa.
INSERT INTO public.integrations (tenant_id, type, name, status, metadata)
SELECT 'bfbf95be-2ce9-47b5-82b1-c9677f42a5a8'::uuid, 'ai_groq', 'AI groq', 'connected', '{"provider":"groq"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.integrations
  WHERE tenant_id = 'bfbf95be-2ce9-47b5-82b1-c9677f42a5a8'::uuid AND type = 'ai_groq'
);

-- 2) Historico: respostas do bot gravadas como "inbound" por falta de direction nos inserts antigos.
UPDATE public.messages
SET direction = 'outbound'
WHERE sender_type = 'bot' AND direction = 'inbound';
