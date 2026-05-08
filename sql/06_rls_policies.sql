-- =============================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Função auxiliar para verificar tenant
-- (já criada em 04_functions.sql)

-- =============================================================================
-- HABILITAR RLS EM TODAS AS TABELAS
-- =============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_situacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_code_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.melhor_envio_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.me_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.me_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.me_auto_sync_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashback_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_column_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_ai_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ig_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_status_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptionist_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.birthday_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.birthday_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_rfm_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_rfm_category_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfm_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfm_audience_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfm_alerts ENABLE ROW LEVEL SECURITY;
-- NOTA: li_sync_state e li_webhook_events já habilitados acima (linhas 33-34)

-- =============================================================================
-- POLÍTICAS PARA TABELAS CORE
-- =============================================================================

-- TENANTS
CREATE POLICY "tenants_select" ON public.tenants FOR SELECT TO authenticated
  USING (id = get_user_tenant_id(auth.uid()));

CREATE POLICY "tenants_update" ON public.tenants FOR UPDATE TO authenticated
  USING (id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), id));

-- PROFILES
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- TEAM_MEMBERS
CREATE POLICY "team_members_select" ON public.team_members FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "team_members_manage" ON public.team_members FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- MEMBER_PERMISSIONS
CREATE POLICY "member_permissions_select" ON public.member_permissions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.id = team_member_id AND tm.tenant_id = get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "member_permissions_manage" ON public.member_permissions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.id = team_member_id 
      AND tm.tenant_id = get_user_tenant_id(auth.uid())
      AND is_tenant_admin(auth.uid(), tm.tenant_id)
  ));

-- =============================================================================
-- POLÍTICAS PARA TOKENS
-- =============================================================================

CREATE POLICY "token_plans_select" ON public.token_plans FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "tenant_tokens_select" ON public.tenant_tokens FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "token_transactions_select" ON public.token_transactions FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- =============================================================================
-- POLÍTICAS PARA TABELAS COM tenant_id (padrão)
-- =============================================================================

-- INTEGRATIONS
CREATE POLICY "integrations_all" ON public.integrations FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- EMAIL_INTEGRATIONS
CREATE POLICY "email_integrations_all" ON public.email_integrations FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- KANBAN_COLUMNS
CREATE POLICY "kanban_columns_all" ON public.kanban_columns FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CONTACTS
CREATE POLICY "contacts_all" ON public.contacts FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CONVERSATIONS
CREATE POLICY "conversations_all" ON public.conversations FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- MESSAGES
CREATE POLICY "messages_all" ON public.messages FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- NOTIFICATION_SETTINGS (por tenant_id)
CREATE POLICY "notification_settings_all" ON public.notification_settings FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- QUICK_REPLIES
CREATE POLICY "quick_replies_all" ON public.quick_replies FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_CUSTOMERS
CREATE POLICY "li_customers_all" ON public.li_customers FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_ORDERS
CREATE POLICY "li_orders_all" ON public.li_orders FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_ORDER_ITEMS
CREATE POLICY "li_order_items_all" ON public.li_order_items FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_PRODUCTS
CREATE POLICY "li_products_all" ON public.li_products FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_SYNC_LOGS
CREATE POLICY "li_sync_logs_all" ON public.li_sync_logs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_SYNC_JOBS
CREATE POLICY "li_sync_jobs_all" ON public.li_sync_jobs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_SYNC_STATE
CREATE POLICY "li_sync_state_all" ON public.li_sync_state FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LI_WEBHOOK_EVENTS
CREATE POLICY "li_webhook_events_select" ON public.li_webhook_events FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_CONNECTIONS
CREATE POLICY "bling_connections_all" ON public.bling_connections FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_CUSTOMERS
CREATE POLICY "bling_customers_all" ON public.bling_customers FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_ORDERS
CREATE POLICY "bling_orders_all" ON public.bling_orders FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_ORDER_ITEMS
CREATE POLICY "bling_order_items_all" ON public.bling_order_items FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_PRODUCTS
CREATE POLICY "bling_products_all" ON public.bling_products FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_SYNC_LOGS
CREATE POLICY "bling_sync_logs_all" ON public.bling_sync_logs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_SYNC_JOBS
CREATE POLICY "bling_sync_jobs_all" ON public.bling_sync_jobs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_WEBHOOK_EVENTS
CREATE POLICY "bling_webhook_events_all" ON public.bling_webhook_events FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_SITUACOES
CREATE POLICY "bling_situacoes_all" ON public.bling_situacoes FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BLING_CODE_MAPPINGS
CREATE POLICY "bling_code_mappings_all" ON public.bling_code_mappings FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- MELHOR_ENVIO_TOKENS
CREATE POLICY "melhor_envio_tokens_all" ON public.melhor_envio_tokens FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- ME_SHIPMENTS
CREATE POLICY "me_shipments_all" ON public.me_shipments FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- ME_SYNC_JOBS
CREATE POLICY "me_sync_jobs_all" ON public.me_sync_jobs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- ME_AUTO_SYNC_CONFIGS
CREATE POLICY "me_auto_sync_configs_all" ON public.me_auto_sync_configs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CASHBACK_CONFIGS
CREATE POLICY "cashback_configs_all" ON public.cashback_configs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- GENERATED_COUPONS
CREATE POLICY "generated_coupons_all" ON public.generated_coupons FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CASHBACK_REMINDERS
CREATE POLICY "cashback_reminders_all" ON public.cashback_reminders FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CASHBACK_EXECUTIONS
CREATE POLICY "cashback_executions_all" ON public.cashback_executions FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CASHBACK_BALANCES
CREATE POLICY "cashback_balances_all" ON public.cashback_balances FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- AI_AGENTS
CREATE POLICY "ai_agents_all" ON public.ai_agents FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- AI_AGENT_COLUMN_ASSIGNMENTS
CREATE POLICY "ai_agent_column_assignments_all" ON public.ai_agent_column_assignments FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- AI_ASSISTANT_CONFIGS
CREATE POLICY "ai_assistant_configs_all" ON public.ai_assistant_configs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- TENANT_AI_CREDENTIALS
CREATE POLICY "tenant_ai_credentials_all" ON public.tenant_ai_credentials FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- AI_PROVIDER_HEALTH
CREATE POLICY "ai_provider_health_all" ON public.ai_provider_health FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- AI_USAGE_LOGS
CREATE POLICY "ai_usage_logs_all" ON public.ai_usage_logs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- META_CONNECTIONS
CREATE POLICY "meta_connections_all" ON public.meta_connections FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- META_CONVERSATIONS
CREATE POLICY "meta_conversations_all" ON public.meta_conversations FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- META_MESSAGES
CREATE POLICY "meta_messages_all" ON public.meta_messages FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- META_IG_COMMENTS
CREATE POLICY "meta_ig_comments_all" ON public.meta_ig_comments FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- META_WHATSAPP_TEMPLATES
CREATE POLICY "meta_whatsapp_templates_all" ON public.meta_whatsapp_templates FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- META_WEBHOOK_LOGS (select only, insert via service role)
CREATE POLICY "meta_webhook_logs_select" ON public.meta_webhook_logs FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- INSTAGRAM_ACCOUNTS
CREATE POLICY "instagram_accounts_all" ON public.instagram_accounts FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- INSTAGRAM_SETTINGS
CREATE POLICY "instagram_settings_all" ON public.instagram_settings FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- INSTAGRAM_MESSAGES
CREATE POLICY "instagram_messages_all" ON public.instagram_messages FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- AUTO_MESSAGES
CREATE POLICY "auto_messages_all" ON public.auto_messages FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BUSINESS_HOURS
CREATE POLICY "business_hours_all" ON public.business_hours FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- ORDER_NOTIFICATION_CONFIGS
CREATE POLICY "order_notification_configs_all" ON public.order_notification_configs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- ORDER_NOTIFICATION_STATUS_RULES
CREATE POLICY "order_notification_status_rules_all" ON public.order_notification_status_rules FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- ORDER_NOTIFICATION_EXECUTIONS
CREATE POLICY "order_notification_executions_all" ON public.order_notification_executions FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- MESSAGE_QUEUE
CREATE POLICY "message_queue_all" ON public.message_queue FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- LEADS
CREATE POLICY "leads_all" ON public.leads FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- RECEPTIONIST_CONFIGS
CREATE POLICY "receptionist_configs_all" ON public.receptionist_configs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- =============================================================================
-- POLÍTICAS PARA TABELAS NOVAS
-- =============================================================================

-- BULK_CAMPAIGNS
CREATE POLICY "bulk_campaigns_all" ON public.bulk_campaigns FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CAMPAIGN_CONTACTS
CREATE POLICY "campaign_contacts_all" ON public.campaign_contacts FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- OUTBOUND_QUEUE
CREATE POLICY "outbound_queue_all" ON public.outbound_queue FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- TAGS
CREATE POLICY "tags_all" ON public.tags FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CONVERSATION_TAGS (via join com conversations)
CREATE POLICY "conversation_tags_all" ON public.conversation_tags FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c 
    WHERE c.id = conversation_id AND c.tenant_id = get_user_tenant_id(auth.uid())
  ));

-- CONTACT_BLOCKS
CREATE POLICY "contact_blocks_all" ON public.contact_blocks FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CONVERSATION_EVENTS
CREATE POLICY "conversation_events_all" ON public.conversation_events FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- WHATSAPP_CHANNELS
CREATE POLICY "whatsapp_channels_all" ON public.whatsapp_channels FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- INBOXES
CREATE POLICY "inboxes_all" ON public.inboxes FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- OAUTH_STATES
CREATE POLICY "oauth_states_all" ON public.oauth_states FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- WEBHOOK_EVENTS (select only para auditoria)
CREATE POLICY "webhook_events_select" ON public.webhook_events FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- BIRTHDAY_CONFIGS
CREATE POLICY "birthday_configs_all" ON public.birthday_configs FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- BIRTHDAY_EXECUTIONS
CREATE POLICY "birthday_executions_all" ON public.birthday_executions FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- =============================================================================
-- POLÍTICAS PARA TABELAS RFM
-- =============================================================================

-- CUSTOMER_RFM_SNAPSHOTS
CREATE POLICY "customer_rfm_snapshots_all" ON public.customer_rfm_snapshots FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- CUSTOMER_RFM_CATEGORY_SNAPSHOTS
CREATE POLICY "customer_rfm_category_snapshots_all" ON public.customer_rfm_category_snapshots FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- RFM_AUDIENCES
CREATE POLICY "rfm_audiences_all" ON public.rfm_audiences FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- RFM_AUDIENCE_MEMBERS
CREATE POLICY "rfm_audience_members_all" ON public.rfm_audience_members FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- RFM_ALERTS
CREATE POLICY "rfm_alerts_all" ON public.rfm_alerts FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- NOTA: Políticas de li_sync_state e li_webhook_events já definidas acima (linhas 232-238)
