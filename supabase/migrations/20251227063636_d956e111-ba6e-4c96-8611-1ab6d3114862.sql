-- Create enum for team member roles
CREATE TYPE public.team_role AS ENUM ('owner', 'admin', 'member');

-- Create enum for module permissions
CREATE TYPE public.module_permission AS ENUM ('dashboard', 'sales', 'clients', 'conversations', 'automations', 'integrations', 'settings', 'coupons', 'products', 'contacts', 'tenants');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tenants table (each owner has one tenant)
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_members table (links users to tenants with roles)
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role team_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Create member_permissions table (granular permissions per member)
CREATE TABLE public.member_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id UUID REFERENCES public.team_members(id) ON DELETE CASCADE NOT NULL,
  permission module_permission NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_member_id, permission)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;

-- Function to get user's tenant_id (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- First check if user is an owner
    (SELECT id FROM public.tenants WHERE owner_id = _user_id LIMIT 1),
    -- Then check if user is a team member
    (SELECT tenant_id FROM public.team_members WHERE user_id = _user_id LIMIT 1)
  );
$$;

-- Function to check if user is owner or admin of a tenant
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_members WHERE tenant_id = _tenant_id AND user_id = _user_id AND role IN ('owner', 'admin')
  );
$$;

-- Function to check if user has permission for a module
CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id UUID, _module module_permission, _require_edit BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Owners have all permissions
    EXISTS (SELECT 1 FROM public.tenants WHERE owner_id = _user_id)
    OR
    -- Admins have all permissions
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE user_id = _user_id AND role IN ('owner', 'admin')
    )
    OR
    -- Members need explicit permission
    EXISTS (
      SELECT 1 FROM public.member_permissions mp
      JOIN public.team_members tm ON tm.id = mp.team_member_id
      WHERE tm.user_id = _user_id 
        AND mp.permission = _module
        AND mp.can_view = true
        AND (NOT _require_edit OR mp.can_edit = true)
    );
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Tenants RLS policies
CREATE POLICY "Users can view their tenant"
  ON public.tenants FOR SELECT
  USING (
    owner_id = auth.uid() OR 
    id = public.get_user_tenant_id(auth.uid())
  );

CREATE POLICY "Owners can update their tenant"
  ON public.tenants FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can create their tenant"
  ON public.tenants FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Team members RLS policies
CREATE POLICY "Tenant members can view team"
  ON public.team_members FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins can manage team members"
  ON public.team_members FOR INSERT
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can update team members"
  ON public.team_members FOR UPDATE
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can delete team members"
  ON public.team_members FOR DELETE
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- Member permissions RLS policies
CREATE POLICY "Tenant members can view permissions"
  ON public.member_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = team_member_id
      AND tm.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );

CREATE POLICY "Admins can manage permissions"
  ON public.member_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = team_member_id
      AND public.is_tenant_admin(auth.uid(), tm.tenant_id)
    )
  );

-- Trigger to create profile and tenant on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, company_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'company_name');
  
  -- Create tenant (user becomes owner) - only if not invited as team member
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
    INSERT INTO public.tenants (owner_id, name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Minha Empresa'));
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add tenant_id to existing tables
ALTER TABLE public.integrations ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.email_integrations ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.cashback_configs ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.generated_coupons ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.cashback_reminders ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.cashback_executions ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.li_customers ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.li_orders ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.li_order_items ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.li_products ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.li_sync_jobs ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.li_sync_logs ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Drop existing permissive policies and create tenant-based ones
DROP POLICY IF EXISTS "Allow all operations on integrations" ON public.integrations;
DROP POLICY IF EXISTS "Allow all operations on email_integrations" ON public.email_integrations;
DROP POLICY IF EXISTS "Allow all access to email_integrations" ON public.email_integrations;
DROP POLICY IF EXISTS "Allow all operations on cashback_configs" ON public.cashback_configs;
DROP POLICY IF EXISTS "Allow all operations on generated_coupons" ON public.generated_coupons;
DROP POLICY IF EXISTS "Allow all operations on cashback_reminders" ON public.cashback_reminders;
DROP POLICY IF EXISTS "Allow all operations on cashback_executions" ON public.cashback_executions;
DROP POLICY IF EXISTS "Allow all operations on li_customers" ON public.li_customers;
DROP POLICY IF EXISTS "Allow all operations on li_orders" ON public.li_orders;
DROP POLICY IF EXISTS "Allow all operations on li_order_items" ON public.li_order_items;
DROP POLICY IF EXISTS "Allow all operations on li_products" ON public.li_products;
DROP POLICY IF EXISTS "Allow all operations on li_sync_jobs" ON public.li_sync_jobs;
DROP POLICY IF EXISTS "Allow all operations on li_sync_logs" ON public.li_sync_logs;

-- Create new tenant-based policies for integrations
CREATE POLICY "Tenant members can view integrations"
  ON public.integrations FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations'));

CREATE POLICY "Tenant admins can manage integrations"
  ON public.integrations FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations', true));

-- Create new tenant-based policies for email_integrations
CREATE POLICY "Tenant members can view email_integrations"
  ON public.email_integrations FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations'));

CREATE POLICY "Tenant admins can manage email_integrations"
  ON public.email_integrations FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations', true));

-- Create new tenant-based policies for cashback_configs
CREATE POLICY "Tenant members can view cashback_configs"
  ON public.cashback_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'automations'));

CREATE POLICY "Tenant admins can manage cashback_configs"
  ON public.cashback_configs FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'automations', true));

-- Create new tenant-based policies for generated_coupons
CREATE POLICY "Tenant members can view generated_coupons"
  ON public.generated_coupons FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'coupons'));

CREATE POLICY "Tenant admins can manage generated_coupons"
  ON public.generated_coupons FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'coupons', true));

-- Create new tenant-based policies for cashback_reminders
CREATE POLICY "Tenant members can view cashback_reminders"
  ON public.cashback_reminders FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'automations'));

CREATE POLICY "Tenant admins can manage cashback_reminders"
  ON public.cashback_reminders FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'automations', true));

-- Create new tenant-based policies for cashback_executions
CREATE POLICY "Tenant members can view cashback_executions"
  ON public.cashback_executions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'automations'));

CREATE POLICY "Tenant admins can manage cashback_executions"
  ON public.cashback_executions FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'automations', true));

-- Create new tenant-based policies for li_customers
CREATE POLICY "Tenant members can view li_customers"
  ON public.li_customers FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'clients'));

CREATE POLICY "Tenant admins can manage li_customers"
  ON public.li_customers FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'clients', true));

-- Create new tenant-based policies for li_orders
CREATE POLICY "Tenant members can view li_orders"
  ON public.li_orders FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'sales'));

CREATE POLICY "Tenant admins can manage li_orders"
  ON public.li_orders FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'sales', true));

-- Create new tenant-based policies for li_order_items
CREATE POLICY "Tenant members can view li_order_items"
  ON public.li_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.li_orders o
      WHERE o.id = li_order_items.order_id
      AND o.tenant_id = public.get_user_tenant_id(auth.uid())
    ) AND public.has_module_permission(auth.uid(), 'sales')
  );

CREATE POLICY "Tenant admins can manage li_order_items"
  ON public.li_order_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.li_orders o
      WHERE o.id = li_order_items.order_id
      AND o.tenant_id = public.get_user_tenant_id(auth.uid())
    ) AND public.has_module_permission(auth.uid(), 'sales', true)
  );

-- Create new tenant-based policies for li_products
CREATE POLICY "Tenant members can view li_products"
  ON public.li_products FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'products'));

CREATE POLICY "Tenant admins can manage li_products"
  ON public.li_products FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'products', true));

-- Create new tenant-based policies for li_sync_jobs
CREATE POLICY "Tenant members can view li_sync_jobs"
  ON public.li_sync_jobs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations'));

CREATE POLICY "Tenant admins can manage li_sync_jobs"
  ON public.li_sync_jobs FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations', true));

-- Create new tenant-based policies for li_sync_logs
CREATE POLICY "Tenant members can view li_sync_logs"
  ON public.li_sync_logs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations'));

CREATE POLICY "Tenant admins can manage li_sync_logs"
  ON public.li_sync_logs FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_module_permission(auth.uid(), 'integrations', true));

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();