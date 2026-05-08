
-- Remove permissive SELECT policies that override admin-only restrictions on sensitive tables

-- bling_connections: drop the public/broad SELECT policy
DROP POLICY IF EXISTS "Users can view their tenant's bling connections" ON public.bling_connections;

-- email_integrations: drop the broad authenticated SELECT policy
DROP POLICY IF EXISTS "Tenant members can view email_integrations" ON public.email_integrations;

-- tenant_ai_credentials: drop the broad SELECT policy
DROP POLICY IF EXISTS "Tenants can view their own AI credentials" ON public.tenant_ai_credentials;
