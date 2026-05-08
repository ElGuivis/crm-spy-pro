# Documentação SQL do Sistema

Este diretório contém todos os scripts SQL necessários para replicar o banco de dados em um novo projeto Supabase.

## Ordem de Execução

Execute os scripts na seguinte ordem:

1. `01_extensions.sql` - Extensões do PostgreSQL
2. `02_enums.sql` - Tipos ENUM personalizados
3. `03_tables/*.sql` - Tabelas (na ordem numérica dos arquivos)
4. `04_functions.sql` - Funções do banco
5. `05_triggers.sql` - Triggers
6. `06_rls_policies.sql` - Políticas de Row Level Security
7. `07_storage.sql` - Buckets de Storage e políticas
8. `08_cron_jobs.sql` - Cron jobs (substituir variáveis primeiro)
9. `09_realtime.sql` - Configuração de Realtime

## Variáveis a Substituir

Antes de executar `08_cron_jobs.sql`, substitua:
- `{SUPABASE_URL}` - URL do projeto Supabase
- `{SUPABASE_ANON_KEY}` - Chave anon do projeto
- `REPLACE_WITH_YOUR_CRON_SECRET` - Secret para autenticação dos cron jobs

## Secrets Necessários

Configure os seguintes secrets no Supabase:

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_ANON_KEY` | Chave anônima |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role |
| `SUPABASE_DB_URL` | URL de conexão direta ao banco |
| `SUPABASE_PUBLISHABLE_KEY` | Chave pública do Supabase |
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave da Evolution API |
| `LOJA_INTEGRADA_API_KEY` | Chave da Loja Integrada |
| `LOJA_INTEGRADA_APP_KEY` | App Key da Loja Integrada |
| `LI_WEBHOOK_SECRET` | Secret de webhook da Loja Integrada |
| `BLING_CLIENT_ID` | Client ID do Bling |
| `BLING_CLIENT_SECRET` | Client Secret do Bling |
| `MELHOR_ENVIO_CLIENT_ID` | Client ID do Melhor Envio |
| `MELHOR_ENVIO_CLIENT_SECRET` | Client Secret do Melhor Envio |
| `MELHOR_ENVIO_WEBHOOK_SECRET` | Webhook Secret do Melhor Envio |
| `MELHOR_ENVIO_ENVIRONMENT` | Ambiente do Melhor Envio (sandbox/production) |
| `META_APP_ID` | App ID do Meta |
| `META_APP_SECRET` | App Secret do Meta |
| `META_WEBHOOK_VERIFY_TOKEN` | Token de verificação webhook Meta |
| `VITE_META_APP_ID` | App ID do Meta (frontend) |
| `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | Config ID do Embedded Signup Meta |
| `CHATWOOT_PLATFORM_URL` | URL da plataforma Chatwoot |
| `CHATWOOT_PLATFORM_TOKEN` | Token da plataforma Chatwoot |
| `N8N_WEBHOOK_URL` | URL do webhook N8N |
| `CRON_SECRET` | Secret para autenticação dos cron jobs |
| `LOVABLE_API_KEY` | Chave da API Lovable (para funcionalidades de IA) |

## Edge Functions

As edge functions estão em `supabase/functions/` e devem ser deployadas no projeto Supabase.

### Lista de Edge Functions

| Função | Descrição |
|--------|-----------|
| `ai-buffer-processor` | Processador de buffer de mensagens IA |
| `ai-chat` | Chat com IA |
| `ai-provider-validate` | Validação de provedor de IA |
| `birthday-processor` | Processador de aniversariantes |
| `bling-job-processor` | Processador de jobs Bling |
| `bling-oauth` | OAuth do Bling |
| `bling-products-job-processor` | Processador de jobs de produtos Bling |
| `bling-stores` | Lojas do Bling |
| `bling-sync` | Sincronização Bling |
| `bling-webhooks` | Webhooks do Bling |
| `bot-engine` | Engine de bot/chatbot |
| `bulk-campaign-processor` | Processador de campanhas em massa |
| `bulk-campaign-scheduler` | Agendador de campanhas em massa |
| `cashback-reminder-processor` | Processador de lembretes de cashback |
| `conversation-inactivity-processor` | Processador de inatividade de conversas |
| `create-team-member` | Criação de membros da equipe |
| `delete-account` | Exclusão de conta |
| `evolution-api` | Integração com Evolution API |
| `get-store-statuses` | Obter status de lojas |
| `instagram-api` | API do Instagram |
| `instagram-oauth` | OAuth do Instagram |
| `instagram-webhook` | Webhook do Instagram |
| `li-cashback` | Cashback Loja Integrada |
| `li-coupon-create` | Criação de cupons LI |
| `li-coupon-sync` | Sincronização de cupons LI |
| `li-job-processor` | Processador de jobs LI |
| `li-reconciliation-processor` | Processador de reconciliação LI |
| `li-sync` | Sincronização LI |
| `li-validate` | Validação LI |
| `li-webhook` | Webhook LI |
| `me-job-processor` | Processador de jobs Melhor Envio |
| `melhor-envio` | Integração Melhor Envio |
| `melhor-envio-webhook` | Webhook Melhor Envio |
| `message-queue-processor` | Processador de fila de mensagens |
| `meta-api` | API Meta |
| `meta-oauth` | OAuth Meta |
| `meta-webhook` | Webhook Meta |
| `process-outbound-queue` | Processador de fila de saída |
| `rfm-calculator` | Calculador RFM |
| `rfm-cron-trigger` | Trigger cron RFM |
| `send-email` | Envio de emails |
| `send-message` | Envio de mensagens |
| `test-webhook` | Webhook de teste |

## Notas Importantes

- O trigger `on_auth_user_created` é executado na tabela `auth.users`
- As extensões `pg_cron` e `pg_net` precisam estar habilitadas no Supabase
- Todas as tabelas têm RLS habilitado por padrão
- O bucket `campaign-media` de storage é privado (requer autenticação)
- Cron jobs com schedule de 6 campos (ex: `*/10 * * * * *`) requerem pg_cron avançado
