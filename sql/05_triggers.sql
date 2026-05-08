-- =============================================================================
-- TRIGGERS DO BANCO DE DADOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TRIGGER: Novo usuário -> criar profile e tenant
-- NOTA: Este trigger é executado na tabela auth.users (gerenciada pelo Supabase)
-- -----------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- TRIGGER: Novo tenant -> inicializar tokens
-- -----------------------------------------------------------------------------
CREATE TRIGGER on_tenant_created
  AFTER INSERT ON public.tenants
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_tenant_tokens();

-- -----------------------------------------------------------------------------
-- TRIGGERS: Atualização automática de updated_at
-- -----------------------------------------------------------------------------

-- Core
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tokens
CREATE TRIGGER update_tenant_tokens_updated_at
  BEFORE UPDATE ON public.tenant_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Integrations
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_integrations_updated_at
  BEFORE UPDATE ON public.email_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();

-- WhatsApp/Conversas
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kanban_columns_updated_at
  BEFORE UPDATE ON public.kanban_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quick_replies_updated_at
  BEFORE UPDATE ON public.quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Loja Integrada
CREATE TRIGGER update_li_customers_updated_at
  BEFORE UPDATE ON public.li_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();

CREATE TRIGGER update_li_orders_updated_at_local
  BEFORE UPDATE ON public.li_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_li_products_updated_at
  BEFORE UPDATE ON public.li_products
  FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();

CREATE TRIGGER update_li_sync_jobs_updated_at
  BEFORE UPDATE ON public.li_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();

CREATE TRIGGER update_li_sync_state_updated_at
  BEFORE UPDATE ON public.li_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bling
CREATE TRIGGER update_bling_connections_updated_at
  BEFORE UPDATE ON public.bling_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_customers_updated_at
  BEFORE UPDATE ON public.bling_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_orders_updated_at
  BEFORE UPDATE ON public.bling_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_products_updated_at
  BEFORE UPDATE ON public.bling_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_sync_jobs_updated_at
  BEFORE UPDATE ON public.bling_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_code_mappings_updated_at
  BEFORE UPDATE ON public.bling_code_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_situacoes_updated_at
  BEFORE UPDATE ON public.bling_situacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Melhor Envio
CREATE TRIGGER update_melhor_envio_tokens_updated_at
  BEFORE UPDATE ON public.melhor_envio_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_me_shipments_updated_at
  BEFORE UPDATE ON public.me_shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_me_sync_jobs_updated_at
  BEFORE UPDATE ON public.me_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_me_auto_sync_configs_updated_at
  BEFORE UPDATE ON public.me_auto_sync_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cashback
CREATE TRIGGER update_cashback_configs_updated_at
  BEFORE UPDATE ON public.cashback_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cashback_reminders_updated_at
  BEFORE UPDATE ON public.cashback_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();

-- AI
CREATE TRIGGER update_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_assistant_configs_updated_at
  BEFORE UPDATE ON public.ai_assistant_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_ai_credentials_updated_at
  BEFORE UPDATE ON public.tenant_ai_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_provider_health_updated_at
  BEFORE UPDATE ON public.ai_provider_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Meta
CREATE TRIGGER update_meta_connections_updated_at
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meta_conversations_updated_at
  BEFORE UPDATE ON public.meta_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_instagram_accounts_updated_at
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_instagram_settings_updated_at
  BEFORE UPDATE ON public.instagram_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Automations
CREATE TRIGGER update_auto_messages_updated_at
  BEFORE UPDATE ON public.auto_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_hours_updated_at
  BEFORE UPDATE ON public.business_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_order_notification_configs_updated_at
  BEFORE UPDATE ON public.order_notification_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_order_notification_status_rules_updated_at
  BEFORE UPDATE ON public.order_notification_status_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_queue_updated_at
  BEFORE UPDATE ON public.message_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leads
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_receptionist_configs_updated_at
  BEFORE UPDATE ON public.receptionist_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bulk Campaigns
CREATE TRIGGER update_bulk_campaigns_updated_at
  BEFORE UPDATE ON public.bulk_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inboxes e Channels
CREATE TRIGGER update_whatsapp_channels_updated_at
  BEFORE UPDATE ON public.whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inboxes_updated_at
  BEFORE UPDATE ON public.inboxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Birthday
CREATE TRIGGER update_birthday_configs_updated_at
  BEFORE UPDATE ON public.birthday_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RFM
CREATE TRIGGER update_rfm_snapshots_updated_at
  BEFORE UPDATE ON public.customer_rfm_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_crfm_category_updated_at
  BEFORE UPDATE ON public.customer_rfm_category_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rfm_audiences_updated_at
  BEFORE UPDATE ON public.rfm_audiences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
