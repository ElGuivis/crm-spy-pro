
-- Add active_tenant_id to profiles for explicit tenant selection
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS active_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_tenant ON public.profiles(active_tenant_id);

-- Update get_user_tenant_id to prioritize active_tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    -- 1. Explicit active tenant (if user still has access)
    (
      SELECT p.active_tenant_id 
      FROM public.profiles p 
      WHERE p.user_id = _user_id 
        AND p.active_tenant_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p.active_tenant_id AND t.owner_id = _user_id)
          OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.tenant_id = p.active_tenant_id AND tm.user_id = _user_id)
        )
    ),
    -- 2. Fallback: tenant where user is owner
    (SELECT id FROM public.tenants WHERE owner_id = _user_id LIMIT 1),
    -- 3. Fallback: tenant via team membership
    (SELECT tenant_id FROM public.team_members WHERE user_id = _user_id LIMIT 1)
  );
$$;

-- Helper function: get all tenants a user has access to
CREATE OR REPLACE FUNCTION public.get_user_tenants(_user_id uuid)
 RETURNS TABLE(tenant_id uuid, tenant_name text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  -- Tenants owned by user
  SELECT t.id AS tenant_id, t.name AS tenant_name, 'owner'::text AS role
  FROM public.tenants t
  WHERE t.owner_id = _user_id
  UNION
  -- Tenants via team membership
  SELECT tm.tenant_id, t.name AS tenant_name, tm.role::text
  FROM public.team_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = _user_id;
$$;

-- Function to switch active tenant (validates access)
CREATE OR REPLACE FUNCTION public.set_active_tenant(_user_id uuid, _tenant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- Verify user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id AND owner_id = _user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE tenant_id = _tenant_id AND user_id = _user_id
  ) THEN
    RETURN false;
  END IF;
  
  UPDATE public.profiles
  SET active_tenant_id = _tenant_id, updated_at = now()
  WHERE user_id = _user_id;
  
  RETURN true;
END;
$$;
