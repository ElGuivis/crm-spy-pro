-- =============================================================================
-- CONFIGURAÇÃO DO SUPABASE REALTIME
-- =============================================================================

-- Habilitar realtime para tabelas de chat/mensagens
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Loja Integrada
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_webhook_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_customers;

-- Carrinho Abandonado e Cupons
ALTER PUBLICATION supabase_realtime ADD TABLE public.abandoned_carts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_coupons;

-- Contatos
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;

-- Integrations
ALTER PUBLICATION supabase_realtime ADD TABLE public.integrations;

-- Kanban
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_columns;

-- AI
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_column_assignments;

-- Bling
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_sync_jobs;

-- Melhor Envio
ALTER PUBLICATION supabase_realtime ADD TABLE public.me_shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.me_sync_jobs;

-- Meta/Instagram
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_messages;

-- Outbound Queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.outbound_queue;

-- RFM Snapshots
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_rfm_snapshots;
