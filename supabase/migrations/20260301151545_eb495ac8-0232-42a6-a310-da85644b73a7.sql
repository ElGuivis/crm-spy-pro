
-- Drop Meta and Instagram tables (cascade handles FK deps)
DROP TABLE IF EXISTS public.instagram_messages CASCADE;
DROP TABLE IF EXISTS public.instagram_settings CASCADE;
DROP TABLE IF EXISTS public.instagram_accounts CASCADE;
DROP TABLE IF EXISTS public.meta_webhook_logs CASCADE;
DROP TABLE IF EXISTS public.meta_whatsapp_templates CASCADE;
DROP TABLE IF EXISTS public.meta_ig_comments CASCADE;
DROP TABLE IF EXISTS public.meta_messages CASCADE;
DROP TABLE IF EXISTS public.meta_conversations CASCADE;
DROP TABLE IF EXISTS public.meta_connections CASCADE;
