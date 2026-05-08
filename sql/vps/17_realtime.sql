-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_webhook_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_coupons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.integrations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_column_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_sync_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.me_shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.me_sync_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.outbound_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_rfm_snapshots;
