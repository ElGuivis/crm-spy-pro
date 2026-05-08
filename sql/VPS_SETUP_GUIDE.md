# SPY PRO CRM - Guia Completo de Deploy em VPS

> Documento gerado em: 2026-03-08
> Baseado na auditoria completa do banco de dados atual + repositório

---

## 📋 Visão Geral do Sistema

O SPY PRO CRM é um sistema multi-tenant SaaS com:
- **Frontend**: React + Vite + Tailwind + TypeScript
- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth + Realtime + Storage)
- **Integrações**: Loja Integrada, Bling, Melhor Envio, Meta/Instagram, Evolution WhatsApp

---

## 1. 🗄️ Banco de Dados - Tabelas (Total: 108 tabelas)

### Core (4 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `tenants` | Empresas/contas multi-tenant |
| `profiles` | Perfis de usuário |
| `team_members` | Membros da equipe |
| `member_permissions` | Permissões granulares |

### Tokens (3 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `token_plans` | Planos de compra de tokens |
| `tenant_tokens` | Saldo de tokens por tenant |
| `token_transactions` | Histórico de transações |

### Integrações (2 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `integrations` | Integrações com sistemas externos |
| `email_integrations` | Configurações SMTP |

### WhatsApp/Atendimento (7 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `kanban_columns` | Colunas do quadro Kanban |
| `contacts` | Contatos WhatsApp |
| `conversations` | Conversas |
| `messages` | Mensagens |
| `notification_settings` | Preferências de notificação |
| `quick_replies` | Respostas rápidas |
| `outbound_queue` | Fila de mensagens de saída |

### Canais e Inboxes (2 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `whatsapp_channels` | Canais WhatsApp (Evolution/Meta) |
| `inboxes` | Caixas de entrada |

### Loja Integrada (6 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `li_customers` | Clientes sincronizados |
| `li_orders` | Pedidos |
| `li_order_items` | Itens dos pedidos |
| `li_products` | Produtos |
| `li_sync_logs` | Logs de sincronização |
| `li_sync_jobs` | Jobs assíncronos |

### Bling (9 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `bling_connections` | Conexões OAuth |
| `bling_situacoes` | Cache de status |
| `bling_code_mappings` | Mapeamento de códigos |
| `bling_customers` | Clientes |
| `bling_orders` | Pedidos |
| `bling_order_items` | Itens dos pedidos |
| `bling_products` | Produtos |
| `bling_sync_logs` | Logs de sync |
| `bling_sync_jobs` | Jobs de sync |
| `bling_webhook_events` | Eventos de webhook |

### Melhor Envio (4 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `melhor_envio_tokens` | Tokens OAuth |
| `me_shipments` | Envios |
| `me_sync_jobs` | Jobs de sync |
| `me_auto_sync_configs` | Config auto-sync |

### Cashback/Cupons (5 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `cashback_configs` | Configurações de cashback |
| `generated_coupons` | Cupons gerados |
| `cashback_reminders` | Lembretes agendados |
| `cashback_executions` | Log de execuções |
| `cashback_balances` | Saldos de cashback |

### IA (6 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `ai_agents` | Agentes de IA |
| `ai_agent_column_assignments` | Atribuição a colunas Kanban |
| `ai_assistant_configs` | Config global do assistente |
| `tenant_ai_credentials` | Credenciais de IA por tenant |
| `ai_provider_health` | Saúde dos provedores |
| `ai_usage_logs` | Logs de uso |

### Automações (5 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `auto_messages` | Mensagens automáticas |
| `business_hours` | Horário comercial |
| `order_notification_configs` | Config de notificações |
| `order_notification_status_rules` | Regras por status |
| `order_notification_executions` | Log de notificações |

### Fila de Mensagens (1 tabela)
| Tabela | Descrição |
|--------|-----------|
| `message_queue` | Fila de envio assíncrono |

### Leads (2 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `leads` | Leads capturados |
| `receptionist_configs` | Config do recepcionista virtual |

### Campanhas (2 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `bulk_campaigns` | Campanhas em massa |
| `campaign_contacts` | Contatos das campanhas |

### Tags e Eventos (4 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `tags` | Tags para conversas |
| `conversation_tags` | Relação conversa-tag |
| `contact_blocks` | Bloqueio de contatos |
| `conversation_events` | Log de eventos |

### Webhook/OAuth (4 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `li_sync_state` | Estado de sync incremental LI |
| `li_webhook_events` | Eventos webhook LI |
| `oauth_states` | Estados temporários OAuth |
| `webhook_events` | Eventos webhook genéricos |

### Birthday (2 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `birthday_configs` | Config de aniversariantes |
| `birthday_executions` | Execuções |

### RFM (5 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `customer_rfm_snapshots` | Snapshots RFM |
| `customer_rfm_category_snapshots` | RFM por categoria |
| `rfm_audiences` | Audiências |
| `rfm_audience_members` | Membros de audiências |
| `rfm_alerts` | Alertas |

### Instagram (40 tabelas)
| Tabela | Descrição |
|--------|-----------|
| `instagram_channels` | Canais Instagram (tokens, status) |
| `instagram_channel_capabilities` | Recursos habilitados |
| `instagram_contacts` | Contatos IGSID |
| `instagram_threads` | Threads de conversa |
| `instagram_messages` | Mensagens |
| `instagram_outbox` | Fila de envio |
| `instagram_webhook_deliveries` | Buffer de webhooks |
| `instagram_event_log` | Log de eventos |
| `instagram_flows` | Fluxos de automação |
| `instagram_flow_versions` | Versões dos fluxos |
| `instagram_flow_nodes` | Nós dos fluxos |
| `instagram_flow_edges` | Conexões entre nós |
| `instagram_flow_runs` | Execuções de fluxos |
| `instagram_flow_run_steps` | Passos das execuções |
| `instagram_trigger_rules` | Regras de gatilho |
| `instagram_media_watchlist` | Monitoramento de mídia |
| `instagram_comment_queue` | Fila de comentários |
| `instagram_comment_replies_log` | Log de respostas |
| `instagram_content` | Conteúdo agendado |
| `instagram_tags` | Tags Instagram |
| `instagram_contact_tags` | Tags por contato |
| `instagram_contact_pauses` | Pausas de automação |
| `instagram_blocked_users` | Usuários bloqueados |
| `instagram_ice_breakers` | Ice breakers |
| `instagram_persistent_menu_items` | Menu persistente |
| `instagram_follow_dm_configs` | Config follow-to-DM |
| `instagram_share_dm_configs` | Config share-to-DM |
| `instagram_ad_welcome_flows` | Fluxos de welcome ads |
| `instagram_deep_links` | Deep links |
| `instagram_cta_links` | Links CTA |
| `instagram_cta_link_clicks` | Clicks CTA |
| `instagram_data_collection_events` | Coleta de dados |
| `instagram_channel_insights` | Insights do canal |
| `instagram_media_insights` | Insights de mídia |
| `instagram_metrics_daily` | Métricas diárias |
| `instagram_term_blacklist` | Termos bloqueados |
| `instagram_feature_flags` | Feature flags |
| `instagram_experimental_executions` | Execuções experimentais |
| `instagram_ai_flow_drafts` | Rascunhos IA |
| `instagram_quick_automation_templates` | Templates de automação |
| `instagram_quick_automation_installs` | Instalações |

---

## 2. 📝 Enums Customizados

| Enum | Valores |
|------|---------|
| `team_role` | owner, admin, member |
| `module_permission` | dashboard, sales, clients, conversations, automations, integrations, settings, coupons, products, contacts, tenants |
| `instagram_channel_status` | connected, expiring, expired, error, disconnected |
| `instagram_delivery_status` | pending, sent, delivered, read, failed |
| `instagram_message_direction` | incoming, outgoing, inbound, outbound |
| `instagram_outbox_status` | queued, processing, sent, failed, dead_letter, pending, retry, sending, dead |
| `instagram_thread_status` | open, pending, bot_active, human_active, paused, closed, spam, blocked |

---

## 3. ⚡ Edge Functions (74 funções)

### WhatsApp/Atendimento
| Função | JWT | Descrição |
|--------|-----|-----------|
| `whatsapp-webhook` | ❌ | Recebe webhooks WhatsApp |
| `bot-engine` | ❌ | Motor do chatbot |
| `ai-chat` | ❌ | Chat com IA |
| `ai-buffer-processor` | ❌ | Processa buffer de mensagens |
| `ai-provider-validate` | ❌ | Valida provedor de IA |
| `send-message` | ❌ | Envia mensagem |
| `send-email` | ❌ | Envia email |
| `message-queue-processor` | ❌ | Processa fila de mensagens |
| `process-outbound-queue` | ❌ | Processa fila de saída |
| `conversation-inactivity-processor` | ❌ | Processa inatividade |
| `evolution-api` | ❌ | API Evolution WhatsApp |
| `bulk-campaign-processor` | ❌ | Processa campanhas |
| `bulk-campaign-scheduler` | ❌ | Agenda campanhas |
| `bulk-status-update-li` | ❌ | Atualiza status em massa |
| `create-team-member` | ❌ | Cria membro de equipe |
| `delete-account` | ❌ | Exclui conta |
| `get-store-statuses` | ❌ | Status das lojas |

### Loja Integrada
| Função | JWT | Descrição |
|--------|-----|-----------|
| `li-sync` | ❌ | Sincronização inicial |
| `li-webhook` | ❌ | Recebe webhooks LI |
| `li-validate` | ❌ | Valida integração |
| `li-reconciliation-processor` | ❌ | Reconciliação |
| `li-job-processor` | ❌ | Processa jobs |
| `li-cashback` | ❌ | Cashback LI |
| `li-coupon-sync` | ❌ | Sync cupons |
| `li-coupon-create` | ❌ | Cria cupom |

### Bling
| Função | JWT | Descrição |
|--------|-----|-----------|
| `bling-oauth` | ❌ | OAuth Bling |
| `bling-webhooks` | ❌ | Webhooks Bling |
| `bling-sync` | ❌ | Sync Bling |
| `bling-stores` | ❌ | Lojas Bling |
| `bling-job-processor` | ❌ | Processa jobs |
| `bling-products-job-processor` | ❌ | Produtos jobs |

### Melhor Envio
| Função | JWT | Descrição |
|--------|-----|-----------|
| `melhor-envio` | ❌ | API Melhor Envio |
| `melhor-envio-webhook` | ❌ | Webhook ME |
| `me-job-processor` | ❌ | Processa jobs |

### Cashback/Birthday
| Função | JWT | Descrição |
|--------|-----|-----------|
| `cashback-reminder-processor` | ❌ | Lembretes cashback |
| `birthday-processor` | ❌ | Aniversariantes |

### RFM
| Função | JWT | Descrição |
|--------|-----|-----------|
| `rfm-calculator` | ❌ | Cálculo RFM |
| `rfm-cron-trigger` | ❌ | Trigger cron RFM |

### Instagram (35+ funções)
| Função | JWT | Descrição |
|--------|-----|-----------|
| `instagram-oauth` | ❌ | OAuth Instagram |
| `instagram-oauth-callback` | ❌ | Callback OAuth |
| `instagram-refresh-token` | ❌ | Renovar token |
| `instagram-manual-token` | ❌ | Token manual |
| `instagram-healthcheck` | ❌ | Health check |
| `instagram-webhook-ingest` | ❌ | Ingestão webhook |
| `instagram-webhook-worker` | ❌ | Worker webhook |
| `instagram-send-message` | ❌ | Enviar mensagem |
| `instagram-outbox-dispatch` | ❌ | Dispatch outbox |
| `instagram-dead-letter-retry` | ❌ | Retry dead letters |
| `instagram-trigger-dispatcher` | ❌ | Dispatcher triggers |
| `instagram-flow-runner` | ❌ | Executor de fluxos |
| `instagram-flow-resume-worker` | ❌ | Resume fluxos |
| `instagram-cancel-run` | ❌ | Cancelar execução |
| `instagram-publish-flow-version` | ❌ | Publicar versão |
| `instagram-pause-contact-automations` | ❌ | Pausar automações |
| `instagram-resume-contact-automations` | ❌ | Retomar automações |
| `instagram-send-private-reply` | ❌ | Reply privada |
| `instagram-send-comment-reply` | ❌ | Reply comentário |
| `instagram-generate-deep-link` | ❌ | Gerar deep link |
| `instagram-upsert-ice-breakers` | ❌ | Upsert ice breakers |
| `instagram-upsert-persistent-menu` | ❌ | Upsert menu |
| `instagram-upsert-welcome-ad-flow` | ❌ | Upsert welcome flow |
| `instagram-validate-collected-data` | ❌ | Validar dados |
| `instagram-save-contact-data` | ❌ | Salvar dados contato |
| `instagram-create-cta-link` | ❌ | Criar CTA link |
| `instagram-track-cta-click` | ❌ | Rastrear click |
| `instagram-install-quick-automation` | ❌ | Instalar automação |
| `instagram-list-quick-automations` | ❌ | Listar automações |
| `instagram-generate-flow-draft-ai` | ❌ | Gerar draft IA |
| `instagram-hide-comment` | ❌ | Ocultar comentário |
| `instagram-delete-comment` | ❌ | Deletar comentário |
| `instagram-block-user` | ❌ | Bloquear usuário |
| `instagram-unblock-user` | ❌ | Desbloquear |
| `instagram-move-thread-to-spam` | ❌ | Marcar spam |
| `instagram-publish-content` | ❌ | Publicar conteúdo |
| `instagram-schedule-content` | ❌ | Agendar conteúdo |
| `instagram-sync-insights` | ❌ | Sync insights |
| `instagram-metrics-rollup` | ❌ | Rollup métricas |
| `instagram-experimental-trigger` | ❌ | Trigger experimental |

---

## 4. ⏰ Cron Jobs (18 agendamentos)

| Nome | Frequência | Edge Function |
|------|-----------|---------------|
| `invoke-li-reconciliation-processor-every-3-min` | */3 * * * * | li-reconciliation-processor |
| `invoke-ai-buffer-processor-every-3-min` | */3 * * * * | ai-buffer-processor |
| `invoke-message-queue-processor-every-1-min` | * * * * * | message-queue-processor |
| `melhor-envio-sync-hourly` | 0 * * * * | melhor-envio?action=cron_sync |
| `process-cashback-reminders-hourly` | 0 * * * * | cashback-reminder-processor |
| `process-inactive-conversations` | */5 * * * * | conversation-inactivity-processor |
| `invoke-bling-job-processor-every-3-min` | */3 * * * * | bling-job-processor |
| `invoke-bling-products-job-processor-every-5-min` | */5 * * * * | bling-products-job-processor |
| `bulk-campaign-scheduler-every-3-min` | */3 * * * * | bulk-campaign-scheduler |
| `invoke-birthday-processor-hourly` | 0 * * * * | birthday-processor |
| `invoke-li-job-processor-every-5-min` | */5 * * * * | li-job-processor |
| `me-job-processor-every-5-min` | */5 * * * * | me-job-processor |
| `process-outbound-queue-every-1-min` | * * * * * | process-outbound-queue |
| `rfm-daily-calculation` | 0 7 * * * | rfm-cron-trigger |
| `instagram-outbox-dispatch` | * * * * * | instagram-outbox-dispatch |
| `instagram-webhook-worker` | * * * * * | instagram-webhook-worker |
| `instagram-refresh-token` | 0 4 * * * | instagram-refresh-token |
| `instagram-metrics-rollup` | 0 * * * * | instagram-metrics-rollup |

---

## 5. 🔑 Secrets Necessários

### Globais (obrigatórios)
| Secret | Descrição |
|--------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role |
| `CRON_SECRET` | Chave para autenticação de cron jobs |

### Loja Integrada
| Secret | Descrição |
|--------|-----------|
| `LOJA_INTEGRADA_APP_KEY` | App key da LI |

### Bling
| Secret | Descrição |
|--------|-----------|
| `BLING_CLIENT_ID` | Client ID OAuth Bling |
| `BLING_CLIENT_SECRET` | Client Secret OAuth Bling |

### Melhor Envio
| Secret | Descrição |
|--------|-----------|
| `MELHOR_ENVIO_CLIENT_ID` | Client ID OAuth ME |
| `MELHOR_ENVIO_CLIENT_SECRET` | Client Secret OAuth ME |
| `MELHOR_ENVIO_ENVIRONMENT` | `production` ou `sandbox` |

### Meta/Instagram
| Secret | Descrição |
|--------|-----------|
| `META_APP_ID` | App ID Meta |
| `META_APP_SECRET` | App Secret Meta |
| `META_WEBHOOK_VERIFY_TOKEN` | Token verificação webhook |
| `INSTAGRAM_APP_ID` | App ID Instagram |
| `INSTAGRAM_APP_SECRET` | App Secret Instagram |
| `VITE_META_APP_ID` | App ID (frontend) |
| `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | Config ID embedded signup |

### WhatsApp (Evolution API)
| Secret | Descrição |
|--------|-----------|
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave da Evolution API |

### Opcional
| Secret | Descrição |
|--------|-----------|
| `CHATWOOT_PLATFORM_URL` | URL Chatwoot (se usar) |
| `CHATWOOT_PLATFORM_TOKEN` | Token Chatwoot (se usar) |
| `MELHOR_ENVIO_WEBHOOK_SECRET` | Secret webhook ME |

---

## 6. 📦 Storage Buckets

| Bucket | Público | Descrição |
|--------|---------|-----------|
| `campaign-media` | ❌ | Mídia de campanhas em massa |

---

## 7. 📡 Realtime

Tabelas com realtime habilitado:
- `messages`, `conversations`, `contacts`
- `li_orders`, `li_webhook_events`, `li_products`, `li_customers`
- `generated_coupons`
- `integrations`
- `kanban_columns`
- `ai_agents`, `ai_agent_column_assignments`
- `bling_orders`, `bling_products`, `bling_customers`, `bling_sync_jobs`
- `me_shipments`, `me_sync_jobs`
- `instagram_messages` (via `meta_messages` alias no config atual)
- `outbound_queue`
- `customer_rfm_snapshots`

---

## 8. 🔐 Funções do Banco (DB Functions)

| Função | Tipo | Descrição |
|--------|------|-----------|
| `get_user_tenant_id(uuid)` | SECURITY DEFINER | Obtém tenant_id do usuário |
| `is_tenant_admin(uuid, uuid)` | SECURITY DEFINER | Verifica se é admin |
| `has_module_permission(uuid, enum, bool)` | SECURITY DEFINER | Verifica permissão de módulo |
| `handle_new_user()` | TRIGGER | Cria profile e tenant |
| `handle_new_tenant_tokens()` | TRIGGER | Inicializa tokens (100 grátis) |
| `get_tenant_token_balance(uuid)` | SECURITY DEFINER | Saldo de tokens |
| `has_enough_tokens(uuid, int)` | SECURITY DEFINER | Verifica saldo |
| `deduct_tokens(uuid, int, text, text, text)` | SECURITY DEFINER | Deduz tokens |
| `add_tokens(uuid, int, text, text, text)` | SECURITY DEFINER | Adiciona tokens |
| `update_updated_at_column()` | TRIGGER | Auto-atualiza updated_at |
| `update_li_updated_at_column()` | TRIGGER | Auto-atualiza updated_at (LI) |
| `map_evolution_status(text)` | IMMUTABLE | Mapeia status Evolution |
| `add_message_to_buffer(uuid, text, int)` | SECURITY DEFINER | Buffer de IA |
| `clear_message_buffer(uuid)` | SECURITY DEFINER | Limpa buffer |
| `get_cron_job_status()` | SECURITY DEFINER | Status cron LI |
| `get_cron_last_run()` | SECURITY DEFINER | Última execução cron LI |
| `get_me_cron_job_status()` | SECURITY DEFINER | Status cron ME |
| `get_me_cron_last_run()` | SECURITY DEFINER | Última execução cron ME |
| `get_dashboard_stats(uuid)` | SECURITY DEFINER | Estatísticas dashboard |
| `link_me_shipments_to_orders(uuid, uuid, text)` | SECURITY DEFINER | Vincula envios a pedidos |
| `increment_cta_click_count(uuid)` | SECURITY DEFINER | Incrementa clicks CTA |

---

## 9. 🚀 Ordem de Execução para Deploy

### Passo 1: Criar projeto Supabase
1. Crie um novo projeto no Supabase (ou instale self-hosted)
2. Habilite as extensões: `pg_cron`, `pg_net`, `uuid-ossp`, `pgcrypto`

### Passo 2: Executar SQL (nesta ordem)
1. `sql/02_enums.sql` + enums de Instagram (ver VPS_SETUP_COMPLETE.sql)
2. `sql/03_tables/01_core.sql` até `sql/03_tables/20_rfm.sql`
3. Tabelas Instagram (ver VPS_SETUP_COMPLETE.sql, seção 3.21)
4. `sql/04_functions.sql`
5. `sql/05_triggers.sql`
6. `sql/06_rls_policies.sql` (remover refs a tabelas inexistentes)
7. `sql/07_storage.sql`
8. `sql/09_realtime.sql`

### Passo 3: Configurar Secrets
Configure todos os secrets listados na seção 5 via Supabase Dashboard > Settings > Secrets

### Passo 4: Deploy Edge Functions
```bash
# Deploy todas as edge functions
supabase functions deploy --project-ref SEU_PROJECT_REF
```

### Passo 5: Configurar Cron Jobs
Execute `sql/08_cron_jobs.sql` substituindo:
- `{SUPABASE_URL}` → URL do seu projeto
- `{SUPABASE_ANON_KEY}` → Chave anon

### Passo 6: Configurar Auth
1. Configure email templates
2. Configure redirect URLs
3. Configure provedores OAuth (se necessário)

### Passo 7: Frontend
```bash
# Build do frontend
npm install
npm run build
# Servir com Nginx, Caddy, etc.
```

### Passo 8: Configurar variáveis de ambiente (.env)
```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-anon-key
VITE_SUPABASE_PROJECT_ID=seu-project-id
```

---

## 10. ⚠️ Diferenças Encontradas (Auditoria)

### Tabelas referenciadas no SQL mas INEXISTENTES no banco:
- `abandoned_cart_configs` - removida/nunca criada
- `abandoned_carts` - removida/nunca criada
- `abandoned_cart_executions` - removida/nunca criada
- `meta_connections` - substituída por `instagram_channels`
- `meta_conversations` - substituída por `instagram_threads`
- `meta_messages` - substituída por `instagram_messages`
- `meta_ig_comments` - substituída por `instagram_comment_queue`
- `meta_whatsapp_templates` - removida
- `meta_webhook_logs` - substituída por `instagram_webhook_deliveries`
- `instagram_accounts` - substituída por `instagram_channels`
- `instagram_settings` - substituída por `instagram_feature_flags`

### Tabelas no banco mas SEM SQL no repositório:
- Todas as 40 tabelas `instagram_*` (criadas via migrations)
- Suas policies RLS (criadas via migrations)

### Triggers no código SQL mas ausentes no banco:
- O banco mostra "no triggers" na introspection (possivelmente limitação da query)
- Todos os triggers de `sql/05_triggers.sql` devem ser aplicados

---

## 11. 📁 Estrutura de Arquivos SQL

```
sql/
├── 01_extensions.sql
├── 02_enums.sql
├── 03_tables/
│   ├── 01_core.sql
│   ├── 02_tokens.sql
│   ├── 03_integrations.sql
│   ├── 04_whatsapp.sql
│   ├── 05_loja_integrada.sql
│   ├── 06_bling.sql
│   ├── 07_melhor_envio.sql
│   ├── 08_cashback.sql
│   ├── 10_ai.sql
│   ├── 12_automations.sql
│   ├── 13_leads.sql
│   ├── 14_bulk_campaigns.sql
│   ├── 15_outbound_queue.sql
│   ├── 16_tags_and_events.sql
│   ├── 17_inboxes_and_channels.sql
│   ├── 18_webhook_events.sql
│   ├── 19_birthday.sql
│   └── 20_rfm.sql
├── 04_functions.sql
├── 05_triggers.sql
├── 06_rls_policies.sql
├── 07_storage.sql
├── 08_cron_jobs.sql
├── 09_realtime.sql
├── VPS_SETUP_COMPLETE.sql      ← SQL consolidado (novo)
├── VPS_SETUP_GUIDE.md          ← Este documento (novo)
└── MIGRATION_COMPLETE.sql      ← Versão anterior
```
