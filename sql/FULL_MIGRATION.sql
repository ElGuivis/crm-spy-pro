-- Tabela de clientes sincronizados da Loja Integrada
CREATE TABLE public.li_customers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    li_id INTEGER NOT NULL UNIQUE,
    nome TEXT,
    email TEXT,
    telefone_celular TEXT,
    telefone_principal TEXT,
    cpf TEXT,
    cnpj TEXT,
    razao_social TEXT,
    data_nascimento DATE,
    sexo TEXT,
    endereco_cep TEXT,
    endereco_logradouro TEXT,
    endereco_numero TEXT,
    endereco_complemento TEXT,
    endereco_bairro TEXT,
    endereco_cidade TEXT,
    endereco_estado TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE,
    data_modificacao TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de produtos sincronizados da Loja Integrada
CREATE TABLE public.li_products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    li_id INTEGER NOT NULL UNIQUE,
    sku TEXT,
    nome TEXT NOT NULL,
    apelido TEXT,
    descricao_completa TEXT,
    ativo BOOLEAN DEFAULT true,
    destaque BOOLEAN DEFAULT false,
    peso NUMERIC,
    altura NUMERIC,
    largura NUMERIC,
    profundidade NUMERIC,
    tipo TEXT,
    preco_cheio NUMERIC,
    preco_custo NUMERIC,
    preco_promocional NUMERIC,
    estoque_quantidade INTEGER DEFAULT 0,
    estoque_gerenciado BOOLEAN DEFAULT true,
    imagem_url TEXT,
    url TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE,
    data_modificacao TIMESTAMP WITH TIME ZONE,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de pedidos sincronizados da Loja Integrada
CREATE TABLE public.li_orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    li_id INTEGER NOT NULL UNIQUE,
    numero TEXT NOT NULL,
    situacao_id INTEGER,
    situacao_nome TEXT,
    cliente_li_id INTEGER,
    cliente_nome TEXT,
    cliente_email TEXT,
    cliente_telefone TEXT,
    valor_subtotal NUMERIC,
    valor_desconto NUMERIC,
    valor_frete NUMERIC,
    valor_total NUMERIC,
    peso_real NUMERIC,
    forma_pagamento TEXT,
    forma_envio TEXT,
    data_criacao TIMESTAMP WITH TIME ZONE,
    data_modificacao TIMESTAMP WITH TIME ZONE,
    data_expiracao TIMESTAMP WITH TIME ZONE,
    endereco_entrega_cep TEXT,
    endereco_entrega_logradouro TEXT,
    endereco_entrega_numero TEXT,
    endereco_entrega_complemento TEXT,
    endereco_entrega_bairro TEXT,
    endereco_entrega_cidade TEXT,
    endereco_entrega_estado TEXT,
    observacoes TEXT,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de itens dos pedidos
CREATE TABLE public.li_order_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.li_orders(id) ON DELETE CASCADE,
    product_li_id INTEGER,
    produto_nome TEXT,
    sku TEXT,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario NUMERIC,
    preco_subtotal NUMERIC,
    peso NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de log de sincronização
CREATE TABLE public.li_sync_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    sync_type TEXT NOT NULL, -- 'customers', 'products', 'orders', 'webhook'
    status TEXT NOT NULL, -- 'started', 'completed', 'failed'
    records_synced INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.li_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies para permitir operações (sistema interno - usar service role key)
CREATE POLICY "Allow all operations on li_customers" ON public.li_customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_products" ON public.li_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_orders" ON public.li_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_order_items" ON public.li_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on li_sync_logs" ON public.li_sync_logs FOR ALL USING (true) WITH CHECK (true);

-- Índices para performance
CREATE INDEX idx_li_customers_email ON public.li_customers(email);
CREATE INDEX idx_li_customers_li_id ON public.li_customers(li_id);
CREATE INDEX idx_li_products_sku ON public.li_products(sku);
CREATE INDEX idx_li_products_li_id ON public.li_products(li_id);
CREATE INDEX idx_li_orders_numero ON public.li_orders(numero);
CREATE INDEX idx_li_orders_li_id ON public.li_orders(li_id);
CREATE INDEX idx_li_orders_cliente_li_id ON public.li_orders(cliente_li_id);
CREATE INDEX idx_li_orders_data_criacao ON public.li_orders(data_criacao DESC);
CREATE INDEX idx_li_order_items_order_id ON public.li_order_items(order_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_li_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_li_customers_updated_at BEFORE UPDATE ON public.li_customers FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();
CREATE TRIGGER update_li_products_updated_at BEFORE UPDATE ON public.li_products FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();
CREATE TRIGGER update_li_orders_updated_at BEFORE UPDATE ON public.li_orders FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();-- Create integrations table to store tenant integration configurations
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- e.g., 'loja_integrada', 'nuvemshop', etc.
  api_key TEXT, -- encrypted API key for the integration
  status TEXT NOT NULL DEFAULT 'pending', -- 'connected', 'disconnected', 'pending', 'error'
  last_sync_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- For now, allow public access (since no auth is implemented yet)
-- This should be updated when auth is added
CREATE POLICY "Allow all operations on integrations" 
ON public.integrations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_li_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_integrations_type ON public.integrations(type);
CREATE INDEX idx_integrations_status ON public.integrations(status);-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;-- Enable REPLICA IDENTITY FULL for real-time updates with complete row data
ALTER TABLE li_sync_logs REPLICA IDENTITY FULL;

-- Add table to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE li_sync_logs;-- Create sync jobs table for robust queueing and resumption
CREATE TABLE public.li_sync_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_log_id UUID REFERENCES public.li_sync_logs(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- 'customers', 'products', 'orders'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed', 'cancelled'
  current_offset INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for efficient job lookup
CREATE INDEX idx_li_sync_jobs_status ON public.li_sync_jobs(status);
CREATE INDEX idx_li_sync_jobs_sync_log_id ON public.li_sync_jobs(sync_log_id);

-- Enable RLS (public access for edge functions)
ALTER TABLE public.li_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (edge functions use service role key)
CREATE POLICY "Allow all operations on li_sync_jobs" 
ON public.li_sync_jobs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_li_sync_jobs_updated_at
BEFORE UPDATE ON public.li_sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_li_updated_at_column();

-- Enable realtime for sync jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_sync_jobs;-- Create function to get cron job status
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
RETURNS TABLE (
  jobid bigint,
  schedule text,
  active boolean,
  jobname text
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'invoke-li-job-processor-every-5-min'
  LIMIT 1;
$$;

-- Create function to get last cron run
CREATE OR REPLACE FUNCTION public.get_cron_last_run()
RETURNS TABLE (
  runid bigint,
  job_pid integer,
  status text,
  start_time timestamp with time zone,
  end_time timestamp with time zone,
  return_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'invoke-li-job-processor-every-5-min'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$$;-- Add payment detail columns to li_orders
ALTER TABLE public.li_orders 
ADD COLUMN IF NOT EXISTS pagamento_tipo text,
ADD COLUMN IF NOT EXISTS pagamento_parcelas integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS pagamento_bandeira text,
ADD COLUMN IF NOT EXISTS pagamento_codigo text;-- Add new columns to cashback_configs table
ALTER TABLE public.cashback_configs 
ADD COLUMN IF NOT EXISTS min_purchase_value numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_discount_value numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS trigger_statuses text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS webhook_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS send_via_whatsapp boolean DEFAULT true;-- Add column for WhatsApp integration selection
ALTER TABLE public.cashback_configs 
ADD COLUMN IF NOT EXISTS whatsapp_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL;-- Add integration_id column to li_sync_logs table
ALTER TABLE public.li_sync_logs 
ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_li_sync_logs_integration_id ON public.li_sync_logs(integration_id);

-- Add integration_id to li_sync_jobs as well for consistency
ALTER TABLE public.li_sync_jobs 
ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE;

CREATE INDEX idx_li_sync_jobs_integration_id ON public.li_sync_jobs(integration_id);-- Add message template field to cashback_configs
ALTER TABLE public.cashback_configs 
ADD COLUMN message_template TEXT DEFAULT 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.';

COMMENT ON COLUMN public.cashback_configs.message_template IS 'Template da mensagem WhatsApp com placeholders: {{cliente_nome}}, {{cliente_primeiro_nome}}, {{valor_cupom}}, {{cupom}}, {{validade}}';-- Update the get_cron_job_status function to match the new cron job name
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
 RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'invoke-li-job-processor-every-5-min'
  LIMIT 1;
$function$;

-- Update the get_cron_last_run function similarly
CREATE OR REPLACE FUNCTION public.get_cron_last_run()
 RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'invoke-li-job-processor-every-5-min'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$function$;-- Update functions to use new cron job name
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
 RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'invoke-li-job-processor-every-1-min'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_cron_last_run()
 RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'invoke-li-job-processor-every-1-min'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$function$;-- Add name field to cashback_configs
ALTER TABLE public.cashback_configs
ADD COLUMN name text NOT NULL DEFAULT 'Cashback';

-- Add missing fields to generated_coupons
ALTER TABLE public.generated_coupons
ADD COLUMN customer_name text,
ADD COLUMN customer_cpf text,
ADD COLUMN coupon_value numeric;-- Create table for email SMTP integrations
CREATE TABLE public.email_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_integrations ENABLE ROW LEVEL SECURITY;

-- Create policies for access (public for now, can be restricted later)
CREATE POLICY "Allow all access to email_integrations" 
ON public.email_integrations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_email_integrations_updated_at
BEFORE UPDATE ON public.email_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_li_updated_at_column();-- Add email configuration fields to cashback_configs
ALTER TABLE public.cashback_configs
ADD COLUMN IF NOT EXISTS send_via_email boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_integration_id uuid REFERENCES public.email_integrations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS email_subject text,
ADD COLUMN IF NOT EXISTS email_body_text text,
ADD COLUMN IF NOT EXISTS email_body_html text;-- Add reminder fields to cashback_configs table
ALTER TABLE public.cashback_configs
ADD COLUMN reminder_1_enabled boolean DEFAULT false,
ADD COLUMN reminder_1_days_before integer DEFAULT 7,
ADD COLUMN reminder_1_message text DEFAULT 'Olá {{cliente_nome}}! ⏰ Seu cupom {{cupom}} de {{valor_cupom}} de desconto expira em {{dias_restantes}} dias! Não perca essa oportunidade. Válido até {{validade}}.',
ADD COLUMN reminder_2_enabled boolean DEFAULT false,
ADD COLUMN reminder_2_days_before integer DEFAULT 3,
ADD COLUMN reminder_2_message text DEFAULT 'Olá {{cliente_nome}}! 🚨 Última chance! Seu cupom {{cupom}} expira em {{dias_restantes}} dias. Use agora e garanta {{valor_cupom}} de desconto!';-- Add columns to generated_coupons for tracking usage
ALTER TABLE generated_coupons ADD COLUMN IF NOT EXISTS used_in_order_id text;
ALTER TABLE generated_coupons ADD COLUMN IF NOT EXISTS used_order_value numeric;

-- Create table for scheduled cashback reminders
CREATE TABLE public.cashback_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES generated_coupons(id) ON DELETE CASCADE,
  config_id uuid REFERENCES cashback_configs(id) ON DELETE SET NULL,
  reminder_number integer NOT NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  webhook_url text,
  webhook_payload jsonb,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for efficient querying of pending reminders
CREATE INDEX idx_cashback_reminders_pending ON cashback_reminders(scheduled_date, status) WHERE status = 'pending';
CREATE INDEX idx_cashback_reminders_coupon ON cashback_reminders(coupon_id);

-- Enable RLS on cashback_reminders
ALTER TABLE cashback_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on cashback_reminders"
ON cashback_reminders
FOR ALL
USING (true)
WITH CHECK (true);

-- Create table for cashback execution logs
CREATE TABLE public.cashback_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid REFERENCES cashback_configs(id) ON DELETE SET NULL,
  coupon_id uuid REFERENCES generated_coupons(id) ON DELETE SET NULL,
  reminder_id uuid REFERENCES cashback_reminders(id) ON DELETE SET NULL,
  order_id text,
  order_number text,
  coupon_code text,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  tokens_used integer DEFAULT 1,
  metadata jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for execution logs
CREATE INDEX idx_cashback_executions_config ON cashback_executions(config_id);
CREATE INDEX idx_cashback_executions_coupon ON cashback_executions(coupon_id);
CREATE INDEX idx_cashback_executions_action ON cashback_executions(action_type);
CREATE INDEX idx_cashback_executions_date ON cashback_executions(executed_at DESC);

-- Enable RLS on cashback_executions
ALTER TABLE cashback_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on cashback_executions"
ON cashback_executions
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at on cashback_reminders
CREATE TRIGGER update_cashback_reminders_updated_at
BEFORE UPDATE ON cashback_reminders
FOR EACH ROW
EXECUTE FUNCTION update_li_updated_at_column();-- Create enum for team member roles
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
-- Create token plans table
CREATE TABLE public.token_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  tokens integer NOT NULL,
  price numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default plans
INSERT INTO public.token_plans (name, tokens, price) VALUES
  ('Básico', 500, 49.90),
  ('Pro', 2000, 149.90),
  ('Enterprise', 10000, 499.90);

-- Create tenant token balances table
CREATE TABLE public.tenant_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  plan_id uuid REFERENCES public.token_plans(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Create token transactions table (history)
CREATE TABLE public.token_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount integer NOT NULL, -- positive for credits, negative for debits
  type text NOT NULL, -- 'credit', 'automation', 'team_member', 'message', etc.
  description text,
  reference_id text, -- ID of the related entity (automation id, member id, etc.)
  balance_after integer NOT NULL, -- balance after this transaction
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.token_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for token_plans (public read)
CREATE POLICY "Anyone can view active token plans"
ON public.token_plans FOR SELECT
USING (is_active = true);

-- RLS policies for tenant_tokens
CREATE POLICY "Tenant members can view their token balance"
ON public.tenant_tokens FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage token balance"
ON public.tenant_tokens FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- RLS policies for token_transactions
CREATE POLICY "Tenant members can view their token transactions"
ON public.token_transactions FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage token transactions"
ON public.token_transactions FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- Function to get tenant token balance
CREATE OR REPLACE FUNCTION public.get_tenant_token_balance(_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(balance, 0) FROM public.tenant_tokens WHERE tenant_id = _tenant_id;
$$;

-- Function to check if tenant has enough tokens
CREATE OR REPLACE FUNCTION public.has_enough_tokens(_tenant_id uuid, _amount integer)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(balance, 0) >= _amount FROM public.tenant_tokens WHERE tenant_id = _tenant_id;
$$;

-- Function to deduct tokens (returns true if successful, false if insufficient)
CREATE OR REPLACE FUNCTION public.deduct_tokens(
  _tenant_id uuid,
  _amount integer,
  _type text,
  _description text DEFAULT NULL,
  _reference_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance integer;
  _new_balance integer;
BEGIN
  -- Get current balance with lock
  SELECT balance INTO _current_balance
  FROM public.tenant_tokens
  WHERE tenant_id = _tenant_id
  FOR UPDATE;
  
  -- Check if tenant has tokens record
  IF _current_balance IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if enough tokens
  IF _current_balance < _amount THEN
    RETURN false;
  END IF;
  
  -- Calculate new balance
  _new_balance := _current_balance - _amount;
  
  -- Update balance
  UPDATE public.tenant_tokens
  SET balance = _new_balance, updated_at = now()
  WHERE tenant_id = _tenant_id;
  
  -- Record transaction
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, reference_id, balance_after)
  VALUES (_tenant_id, -_amount, _type, _description, _reference_id, _new_balance);
  
  RETURN true;
END;
$$;

-- Function to add tokens (for purchases, admin credits, etc.)
CREATE OR REPLACE FUNCTION public.add_tokens(
  _tenant_id uuid,
  _amount integer,
  _type text,
  _description text DEFAULT NULL,
  _reference_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance integer;
  _new_balance integer;
BEGIN
  -- Get current balance with lock, create if not exists
  SELECT balance INTO _current_balance
  FROM public.tenant_tokens
  WHERE tenant_id = _tenant_id
  FOR UPDATE;
  
  IF _current_balance IS NULL THEN
    -- Create new token record
    INSERT INTO public.tenant_tokens (tenant_id, balance)
    VALUES (_tenant_id, _amount);
    _new_balance := _amount;
  ELSE
    -- Update existing balance
    _new_balance := _current_balance + _amount;
    UPDATE public.tenant_tokens
    SET balance = _new_balance, updated_at = now()
    WHERE tenant_id = _tenant_id;
  END IF;
  
  -- Record transaction
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, reference_id, balance_after)
  VALUES (_tenant_id, _amount, _type, _description, _reference_id, _new_balance);
  
  RETURN true;
END;
$$;

-- Trigger to create token record when tenant is created
CREATE OR REPLACE FUNCTION public.handle_new_tenant_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_tokens (tenant_id, balance)
  VALUES (NEW.id, 100); -- Start with 100 free tokens
  
  -- Record the initial credit
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, balance_after)
  VALUES (NEW.id, 100, 'credit', 'Crédito inicial de boas-vindas', 100);
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_tenant_created_tokens
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant_tokens();

-- Add updated_at trigger for tenant_tokens
CREATE TRIGGER update_tenant_tokens_updated_at
  BEFORE UPDATE ON public.tenant_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Tabela de contatos/leads (vinculada a clientes existentes ou novos)
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  li_customer_id UUID REFERENCES public.li_customers(id) ON DELETE SET NULL,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

-- Tabela de conversas
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  chatwoot_conversation_id INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'bot',
  assigned_to UUID,
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de mensagens
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  chatwoot_message_id INTEGER,
  sender_type VARCHAR(20) NOT NULL,
  sender_id UUID,
  content TEXT NOT NULL,
  content_type VARCHAR(20) NOT NULL DEFAULT 'text',
  media_url TEXT,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração do AI por tenant
CREATE TABLE public.ai_assistant_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  system_prompt TEXT,
  welcome_message TEXT DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudá-lo?',
  transfer_keywords TEXT[] DEFAULT ARRAY['atendente', 'humano', 'pessoa', 'falar com alguém'],
  business_hours JSONB DEFAULT '{"enabled": false}',
  out_of_hours_message TEXT DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!',
  max_context_messages INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_contacts_tenant_phone ON public.contacts(tenant_id, phone);
CREATE INDEX idx_conversations_tenant_status ON public.conversations(tenant_id, status);
CREATE INDEX idx_conversations_contact ON public.conversations(contact_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_tenant_created ON public.messages(tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assistant_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contacts
CREATE POLICY "Tenant members can view contacts"
ON public.contacts FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage contacts"
ON public.contacts FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- RLS Policies for conversations
CREATE POLICY "Tenant members can view conversations"
ON public.conversations FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage conversations"
ON public.conversations FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- RLS Policies for messages
CREATE POLICY "Tenant members can view messages"
ON public.messages FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage messages"
ON public.messages FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- RLS Policies for ai_assistant_configs
CREATE POLICY "Tenant members can view ai_assistant_configs"
ON public.ai_assistant_configs FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage ai_assistant_configs"
ON public.ai_assistant_configs FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- Enable realtime for conversations and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_assistant_configs_updated_at
BEFORE UPDATE ON public.ai_assistant_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Create kanban_columns table
CREATE TABLE public.kanban_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'bg-blue-500',
  position INTEGER NOT NULL DEFAULT 0,
  is_default_for_new BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add kanban_column_id to conversations
ALTER TABLE public.conversations
ADD COLUMN kanban_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL;

-- Enable RLS on kanban_columns
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

-- RLS policies for kanban_columns
CREATE POLICY "Tenant members can view kanban_columns"
ON public.kanban_columns
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage kanban_columns"
ON public.kanban_columns
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND is_tenant_admin(auth.uid(), tenant_id)
);

-- Create trigger for updated_at
CREATE TRIGGER update_kanban_columns_updated_at
BEFORE UPDATE ON public.kanban_columns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_kanban_columns_tenant_position ON public.kanban_columns(tenant_id, position);
CREATE INDEX idx_conversations_kanban_column ON public.conversations(kanban_column_id);

-- Enable realtime for kanban_columns
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_columns;-- Table for AI agents that can be assigned to specific Kanban columns
CREATE TABLE public.ai_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  welcome_message TEXT,
  transfer_keywords TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1024,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to assign AI agents to specific Kanban columns
CREATE TABLE public.ai_agent_column_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(column_id, tenant_id) -- Only one agent per column per tenant
);

-- Table for notification settings
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT true,
  sound_volume NUMERIC(3,2) DEFAULT 0.5,
  desktop_notifications BOOLEAN NOT NULL DEFAULT true,
  new_message_sound TEXT DEFAULT 'default',
  new_conversation_sound TEXT DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_column_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_agents
CREATE POLICY "Users can view their tenant's AI agents"
  ON public.ai_agents FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create AI agents for their tenant"
  ON public.ai_agents FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their tenant's AI agents"
  ON public.ai_agents FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their tenant's AI agents"
  ON public.ai_agents FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- RLS policies for ai_agent_column_assignments
CREATE POLICY "Users can view their tenant's agent assignments"
  ON public.ai_agent_column_assignments FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create agent assignments for their tenant"
  ON public.ai_agent_column_assignments FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their tenant's agent assignments"
  ON public.ai_agent_column_assignments FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their tenant's agent assignments"
  ON public.ai_agent_column_assignments FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- RLS policies for notification_settings
CREATE POLICY "Users can view their tenant's notification settings"
  ON public.notification_settings FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create notification settings for their tenant"
  ON public.notification_settings FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their tenant's notification settings"
  ON public.notification_settings FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_ai_agents_updated_at
  BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_column_assignments;-- Create table for tenant AI credentials
CREATE TABLE public.tenant_ai_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'lovable' CHECK (provider IN ('lovable', 'openai', 'google')),
  api_key_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_ai_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenants can view their own AI credentials"
ON public.tenant_ai_credentials
FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can insert their own AI credentials"
ON public.tenant_ai_credentials
FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can update their own AI credentials"
ON public.tenant_ai_credentials
FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can delete their own AI credentials"
ON public.tenant_ai_credentials
FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_tenant_ai_credentials_updated_at
BEFORE UPDATE ON public.tenant_ai_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.tenant_ai_credentials IS 'Stores AI provider credentials per tenant for self-hosted deployments';-- Create table for AI usage tracking
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'lovable',
  model TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_total INTEGER GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  response_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tenants can view their own AI usage logs"
ON public.ai_usage_logs
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can insert their own AI usage logs"
ON public.ai_usage_logs
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Index for fast queries
CREATE INDEX idx_ai_usage_logs_tenant_created ON public.ai_usage_logs(tenant_id, created_at DESC);
CREATE INDEX idx_ai_usage_logs_provider ON public.ai_usage_logs(tenant_id, provider);

-- Add comment
COMMENT ON TABLE public.ai_usage_logs IS 'Tracks AI API usage per tenant for billing and analytics';-- Create abandoned_cart_configs table for automation settings
CREATE TABLE public.abandoned_cart_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Carrinho Abandonado',
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  webhook_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  message_template TEXT NOT NULL DEFAULT 'Olá {{cliente_primeiro_nome}}! 👋

Notamos que você deixou alguns produtos no carrinho. Seu pedido de {{valor_carrinho}} está esperando por você!

🛒 Finalize sua compra: {{link_checkout}}

{{cupom_texto}}

Qualquer dúvida, estamos aqui para ajudar! 😊',
  delay_minutes INTEGER NOT NULL DEFAULT 30,
  reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_delay_hours INTEGER DEFAULT 24,
  reminder_message_template TEXT,
  min_cart_value NUMERIC(10,2) DEFAULT 0,
  include_coupon BOOLEAN NOT NULL DEFAULT false,
  coupon_discount_percent INTEGER DEFAULT 10,
  coupon_duration_days INTEGER DEFAULT 3,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  email_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_subject TEXT DEFAULT 'Você esqueceu algo no carrinho! 🛒',
  email_body TEXT,
  tokens_per_execution INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create abandoned_carts table to store cart data
CREATE TABLE public.abandoned_carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.abandoned_cart_configs(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  cart_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  cart_items JSONB DEFAULT '[]'::jsonb,
  checkout_url TEXT,
  abandoned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scheduled_contact_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'reminder_sent', 'recovered', 'expired', 'cancelled')),
  first_contact_at TIMESTAMP WITH TIME ZONE,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  recovered_at TIMESTAMP WITH TIME ZONE,
  recovered_order_id TEXT,
  coupon_code TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, integration_id, external_id)
);

-- Create abandoned_cart_executions table for logging
CREATE TABLE public.abandoned_cart_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.abandoned_cart_configs(id) ON DELETE SET NULL,
  cart_id UUID REFERENCES public.abandoned_carts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('message_sent', 'reminder_sent', 'coupon_created', 'email_sent', 'cart_recovered')),
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  tokens_used INTEGER DEFAULT 0,
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.abandoned_cart_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for abandoned_cart_configs
CREATE POLICY "Users can view their tenant's abandoned cart configs"
  ON public.abandoned_cart_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned cart configs for their tenant"
  ON public.abandoned_cart_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned cart configs"
  ON public.abandoned_cart_configs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant's abandoned cart configs"
  ON public.abandoned_cart_configs FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for abandoned_carts
CREATE POLICY "Users can view their tenant's abandoned carts"
  ON public.abandoned_carts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned carts for their tenant"
  ON public.abandoned_carts FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned carts"
  ON public.abandoned_carts FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for abandoned_cart_executions
CREATE POLICY "Users can view their tenant's abandoned cart executions"
  ON public.abandoned_cart_executions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role policies for edge functions
CREATE POLICY "Service role can manage abandoned_cart_configs"
  ON public.abandoned_cart_configs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage abandoned_carts"
  ON public.abandoned_carts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage abandoned_cart_executions"
  ON public.abandoned_cart_executions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_abandoned_carts_tenant_status ON public.abandoned_carts(tenant_id, status);
CREATE INDEX idx_abandoned_carts_scheduled_contact ON public.abandoned_carts(scheduled_contact_at) WHERE status = 'pending';
CREATE INDEX idx_abandoned_cart_configs_tenant ON public.abandoned_cart_configs(tenant_id);
CREATE INDEX idx_abandoned_cart_executions_config ON public.abandoned_cart_executions(config_id);

-- Triggers for updated_at
CREATE TRIGGER update_abandoned_cart_configs_updated_at
  BEFORE UPDATE ON public.abandoned_cart_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_abandoned_carts_updated_at
  BEFORE UPDATE ON public.abandoned_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();-- Enable realtime for abandoned_carts table
ALTER PUBLICATION supabase_realtime ADD TABLE public.abandoned_carts;-- Create message queue table for retry system
CREATE TABLE public.message_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  recipient TEXT NOT NULL,
  message_content TEXT NOT NULL,
  subject TEXT,
  html_content TEXT,
  whatsapp_integration_id UUID,
  email_integration_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT,
  reference_type TEXT,
  reference_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Service role can manage message_queue"
ON public.message_queue FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Tenant members can view their message queue"
ON public.message_queue FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Index for processor query
CREATE INDEX idx_message_queue_pending ON public.message_queue (status, next_retry_at) 
WHERE status IN ('pending', 'processing');

-- Index for tenant queries
CREATE INDEX idx_message_queue_tenant ON public.message_queue (tenant_id, created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_message_queue_updated_at
BEFORE UPDATE ON public.message_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Horário de funcionamento
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=domingo, 6=sábado
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's business hours"
ON public.business_hours FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage business hours"
ON public.business_hours FOR ALL
USING (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

-- Trigger for updated_at
CREATE TRIGGER update_business_hours_updated_at
BEFORE UPDATE ON public.business_hours
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Create quick_replies table
CREATE TABLE public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  shortcut TEXT,
  usage_count INTEGER DEFAULT 0,
  is_favorite BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant quick replies"
ON public.quick_replies FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert quick replies for their tenant"
ON public.quick_replies FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant quick replies"
ON public.quick_replies FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant quick replies"
ON public.quick_replies FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_quick_replies_updated_at
BEFORE UPDATE ON public.quick_replies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Create auto_messages table
CREATE TABLE public.auto_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL, -- welcome, offline, queue, transfer, timeout
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  delay_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, message_type)
);

-- Enable RLS
ALTER TABLE public.auto_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant auto messages"
ON public.auto_messages FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert auto messages for their tenant"
ON public.auto_messages FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant auto messages"
ON public.auto_messages FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant auto messages"
ON public.auto_messages FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_auto_messages_updated_at
BEFORE UPDATE ON public.auto_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Table for order notification automation configurations
CREATE TABLE public.order_notification_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Notificação de Pedido',
  integration_id uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  whatsapp_integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_integration_id uuid REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  send_via_whatsapp boolean DEFAULT true,
  send_via_email boolean DEFAULT false,
  is_active boolean DEFAULT true,
  tokens_per_execution integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table for status-specific notification rules
CREATE TABLE public.order_notification_status_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.order_notification_configs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status_name text NOT NULL,
  status_id integer,
  is_enabled boolean DEFAULT true,
  message_template text NOT NULL,
  email_subject text,
  email_body text,
  delay_minutes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table for execution history/logs
CREATE TABLE public.order_notification_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.order_notification_configs(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES public.order_notification_status_rules(id) ON DELETE SET NULL,
  order_id text NOT NULL,
  order_number text,
  customer_phone text,
  customer_email text,
  status_name text,
  message_sent text,
  channel text DEFAULT 'whatsapp',
  status text DEFAULT 'pending',
  error_message text,
  tokens_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.order_notification_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_status_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notification_executions ENABLE ROW LEVEL SECURITY;

-- RLS policies for order_notification_configs
CREATE POLICY "Tenant admins can manage order_notification_configs"
ON public.order_notification_configs FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission, true)
);

CREATE POLICY "Tenant members can view order_notification_configs"
ON public.order_notification_configs FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission)
);

CREATE POLICY "Service role can manage order_notification_configs"
ON public.order_notification_configs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- RLS policies for order_notification_status_rules
CREATE POLICY "Tenant admins can manage order_notification_status_rules"
ON public.order_notification_status_rules FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission, true)
);

CREATE POLICY "Tenant members can view order_notification_status_rules"
ON public.order_notification_status_rules FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission)
);

CREATE POLICY "Service role can manage order_notification_status_rules"
ON public.order_notification_status_rules FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- RLS policies for order_notification_executions
CREATE POLICY "Tenant admins can manage order_notification_executions"
ON public.order_notification_executions FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission, true)
);

CREATE POLICY "Tenant members can view order_notification_executions"
ON public.order_notification_executions FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) 
  AND has_module_permission(auth.uid(), 'automations'::module_permission)
);

CREATE POLICY "Service role can manage order_notification_executions"
ON public.order_notification_executions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_order_notification_configs_tenant ON public.order_notification_configs(tenant_id);
CREATE INDEX idx_order_notification_configs_integration ON public.order_notification_configs(integration_id);
CREATE INDEX idx_order_notification_status_rules_config ON public.order_notification_status_rules(config_id);
CREATE INDEX idx_order_notification_status_rules_status ON public.order_notification_status_rules(status_name);
CREATE INDEX idx_order_notification_executions_tenant ON public.order_notification_executions(tenant_id);
CREATE INDEX idx_order_notification_executions_order ON public.order_notification_executions(order_id);
CREATE INDEX idx_order_notification_executions_created ON public.order_notification_executions(created_at DESC);-- Fix abandoned_cart_configs public exposure
-- Drop the problematic "Service role" policy that allows public access
DROP POLICY IF EXISTS "Service role can manage abandoned_cart_configs" ON public.abandoned_cart_configs;

-- Recreate user policies with explicit auth check to prevent unauthenticated access
DROP POLICY IF EXISTS "Users can view their tenant's abandoned cart configs" ON public.abandoned_cart_configs;
DROP POLICY IF EXISTS "Users can insert abandoned cart configs for their tenant" ON public.abandoned_cart_configs;
DROP POLICY IF EXISTS "Users can update their tenant's abandoned cart configs" ON public.abandoned_cart_configs;
DROP POLICY IF EXISTS "Users can delete their tenant's abandoned cart configs" ON public.abandoned_cart_configs;

CREATE POLICY "Users can view their tenant's abandoned cart configs" 
ON public.abandoned_cart_configs 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned cart configs for their tenant" 
ON public.abandoned_cart_configs 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned cart configs" 
ON public.abandoned_cart_configs 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant's abandoned cart configs" 
ON public.abandoned_cart_configs 
FOR DELETE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Fix contacts table public exposure
DROP POLICY IF EXISTS "Tenant members can view contacts" ON public.contacts;
DROP POLICY IF EXISTS "Tenant admins can manage contacts" ON public.contacts;

CREATE POLICY "Tenant members can view contacts" 
ON public.contacts 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage contacts" 
ON public.contacts 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));-- Fix all error-level RLS policy issues by adding explicit authentication requirements
-- Tables: contacts, li_customers, generated_coupons, abandoned_carts, li_orders, integrations, email_integrations, tenant_ai_credentials, messages

-- 1. Fix contacts table (already fixed in previous migration)
-- Skipping as it was already fixed

-- 2. Fix li_customers table
DROP POLICY IF EXISTS "Tenant admins can manage li_customers" ON public.li_customers;
DROP POLICY IF EXISTS "Tenant members can view li_customers" ON public.li_customers;

CREATE POLICY "Tenant admins can manage li_customers" 
ON public.li_customers 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'clients'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'clients'::module_permission, true));

CREATE POLICY "Tenant members can view li_customers" 
ON public.li_customers 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'clients'::module_permission));

-- 3. Fix generated_coupons table
DROP POLICY IF EXISTS "Tenant admins can manage generated_coupons" ON public.generated_coupons;
DROP POLICY IF EXISTS "Tenant members can view generated_coupons" ON public.generated_coupons;

CREATE POLICY "Tenant admins can manage generated_coupons" 
ON public.generated_coupons 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'coupons'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'coupons'::module_permission, true));

CREATE POLICY "Tenant members can view generated_coupons" 
ON public.generated_coupons 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'coupons'::module_permission));

-- 4. Fix abandoned_carts table
DROP POLICY IF EXISTS "Service role can manage abandoned_carts" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Users can view their tenant's abandoned carts" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Users can insert abandoned carts for their tenant" ON public.abandoned_carts;
DROP POLICY IF EXISTS "Users can update their tenant's abandoned carts" ON public.abandoned_carts;

CREATE POLICY "Users can view their tenant's abandoned carts" 
ON public.abandoned_carts 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert abandoned carts for their tenant" 
ON public.abandoned_carts 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant's abandoned carts" 
ON public.abandoned_carts 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant's abandoned carts" 
ON public.abandoned_carts 
FOR DELETE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- 5. Fix li_orders table
DROP POLICY IF EXISTS "Tenant admins can manage li_orders" ON public.li_orders;
DROP POLICY IF EXISTS "Tenant members can view li_orders" ON public.li_orders;

CREATE POLICY "Tenant admins can manage li_orders" 
ON public.li_orders 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'sales'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'sales'::module_permission, true));

CREATE POLICY "Tenant members can view li_orders" 
ON public.li_orders 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'sales'::module_permission));

-- 6. Fix integrations table
DROP POLICY IF EXISTS "Tenant admins can manage integrations" ON public.integrations;
DROP POLICY IF EXISTS "Tenant members can view integrations" ON public.integrations;

CREATE POLICY "Tenant admins can manage integrations" 
ON public.integrations 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true));

CREATE POLICY "Tenant members can view integrations" 
ON public.integrations 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission));

-- 7. Fix email_integrations table
DROP POLICY IF EXISTS "Tenant admins can manage email_integrations" ON public.email_integrations;
DROP POLICY IF EXISTS "Tenant members can view email_integrations" ON public.email_integrations;

CREATE POLICY "Tenant admins can manage email_integrations" 
ON public.email_integrations 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission, true));

CREATE POLICY "Tenant members can view email_integrations" 
ON public.email_integrations 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND has_module_permission(auth.uid(), 'integrations'::module_permission));

-- 8. Fix tenant_ai_credentials table
DROP POLICY IF EXISTS "Tenants can view their own AI credentials" ON public.tenant_ai_credentials;
DROP POLICY IF EXISTS "Tenants can insert their own AI credentials" ON public.tenant_ai_credentials;
DROP POLICY IF EXISTS "Tenants can update their own AI credentials" ON public.tenant_ai_credentials;
DROP POLICY IF EXISTS "Tenants can delete their own AI credentials" ON public.tenant_ai_credentials;

CREATE POLICY "Tenants can view their own AI credentials" 
ON public.tenant_ai_credentials 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can insert their own AI credentials" 
ON public.tenant_ai_credentials 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can update their own AI credentials" 
ON public.tenant_ai_credentials 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenants can delete their own AI credentials" 
ON public.tenant_ai_credentials 
FOR DELETE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- 9. Fix messages table
DROP POLICY IF EXISTS "Tenant admins can manage messages" ON public.messages;
DROP POLICY IF EXISTS "Tenant members can view messages" ON public.messages;

CREATE POLICY "Tenant admins can manage messages" 
ON public.messages 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can view messages" 
ON public.messages 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));-- Fix message_queue RLS policy to require authentication
DROP POLICY IF EXISTS "Service role can manage message_queue" ON public.message_queue;
DROP POLICY IF EXISTS "Tenant members can view their message queue" ON public.message_queue;

-- Recreate with proper authentication requirements
CREATE POLICY "Tenant members can view their message queue" 
ON public.message_queue 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage message queue" 
ON public.message_queue 
FOR ALL 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id))
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin(auth.uid(), tenant_id));-- 1. Update existing conversations without integration_id
UPDATE conversations 
SET integration_id = '7340b82a-2a8d-49e2-af7b-afe08f5459c0'
WHERE tenant_id = '76ec7577-43c3-41e4-935f-1f0d1102f900'
  AND integration_id IS NULL;

-- 2. Fix notification_settings RLS policies to use get_user_tenant_id (includes owner)
DROP POLICY IF EXISTS "Users can create notification settings for their tenant" ON notification_settings;
DROP POLICY IF EXISTS "Users can view their tenant's notification settings" ON notification_settings;
DROP POLICY IF EXISTS "Users can update their tenant's notification settings" ON notification_settings;

CREATE POLICY "Tenant members can view notification settings" 
ON notification_settings 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can create notification settings" 
ON notification_settings 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update notification settings" 
ON notification_settings 
FOR UPDATE 
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));-- Add data_access column to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS data_access jsonb DEFAULT '{"orders": true, "products": false, "abandoned_carts": true, "customer_details": true}'::jsonb;-- Add agent transfer rules to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN agent_transfer_rules jsonb DEFAULT '[]'::jsonb;

-- Add current AI agent tracking to conversations
ALTER TABLE conversations 
ADD COLUMN current_ai_agent_id uuid REFERENCES ai_agents(id);

-- Add comment for documentation
COMMENT ON COLUMN ai_agents.agent_transfer_rules IS 'Array of transfer rules: [{target_agent_id, keywords[], description}]';
COMMENT ON COLUMN conversations.current_ai_agent_id IS 'Currently active AI agent for this conversation (set by transfers)';-- Add interactive_buttons column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS interactive_buttons jsonb DEFAULT '[]'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN public.ai_agents.interactive_buttons IS 'Array of interactive buttons: [{id, display_text, action_type, target_agent_id, response_message}]';-- Enable RLS on ai_agents if not already enabled
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ai_agents table
CREATE POLICY "Users can view their tenant ai_agents"
ON public.ai_agents
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can create ai_agents for their tenant"
ON public.ai_agents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can update their tenant ai_agents"
ON public.ai_agents
FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);

CREATE POLICY "Users can delete their tenant ai_agents"
ON public.ai_agents
FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND
  tenant_id = get_user_tenant_id(auth.uid())
);-- Add default_ai_agent_id to ai_assistant_configs
ALTER TABLE public.ai_assistant_configs
ADD COLUMN default_ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;-- Drop existing policies that only check team_members
DROP POLICY IF EXISTS "Users can view their tenant's agent assignments" ON public.ai_agent_column_assignments;
DROP POLICY IF EXISTS "Users can create agent assignments for their tenant" ON public.ai_agent_column_assignments;
DROP POLICY IF EXISTS "Users can update their tenant's agent assignments" ON public.ai_agent_column_assignments;
DROP POLICY IF EXISTS "Users can delete their tenant's agent assignments" ON public.ai_agent_column_assignments;

-- Create new policies using get_user_tenant_id which checks both owners and team_members
CREATE POLICY "Tenant users can view agent assignments"
ON public.ai_agent_column_assignments FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can create agent assignments"
ON public.ai_agent_column_assignments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can update agent assignments"
ON public.ai_agent_column_assignments FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can delete agent assignments"
ON public.ai_agent_column_assignments FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));-- Add inactivity configuration fields to ai_assistant_configs
ALTER TABLE public.ai_assistant_configs 
ADD COLUMN IF NOT EXISTS inactivity_timeout_minutes integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS inactivity_message text DEFAULT 'Encerrando o atendimento por inatividade. Quando precisar, é só chamar novamente!';-- Create table to track AI provider health status
CREATE TABLE public.ai_provider_health (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'google', 'lovable')),
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'error', 'unknown')),
  last_error_code TEXT,
  last_error_message TEXT,
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

-- Enable RLS
ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenants can view their own provider health" 
ON public.ai_provider_health 
FOR SELECT 
USING (
  tenant_id IN (
    SELECT tenant_id FROM team_members WHERE user_id = auth.uid()
  ) OR 
  tenant_id IN (
    SELECT id FROM tenants WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Service role can manage provider health" 
ON public.ai_provider_health 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_ai_provider_health_tenant ON public.ai_provider_health(tenant_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_provider_health_updated_at
BEFORE UPDATE ON public.ai_provider_health
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Remover constraint antigo que só permite um registro por tenant
ALTER TABLE tenant_ai_credentials 
DROP CONSTRAINT IF EXISTS tenant_ai_credentials_tenant_id_key;

-- Adicionar constraint correto para permitir múltiplos provedores por tenant
ALTER TABLE tenant_ai_credentials 
ADD CONSTRAINT tenant_ai_credentials_tenant_provider_unique 
UNIQUE (tenant_id, provider);-- Remover check constraint antigo
ALTER TABLE tenant_ai_credentials 
DROP CONSTRAINT tenant_ai_credentials_provider_check;

-- Adicionar check constraint atualizado com todos os provedores
ALTER TABLE tenant_ai_credentials 
ADD CONSTRAINT tenant_ai_credentials_provider_check 
CHECK (provider IN ('lovable', 'openai', 'google', 'groq', 'mistral'));-- Add human_transfer_column_id to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN human_transfer_column_id uuid REFERENCES public.kanban_columns(id) ON DELETE SET NULL;

-- Add target_column_id to interactive_buttons jsonb structure (no migration needed, just documentation)
-- The interactive_buttons column already stores JSONB, we'll add target_column_id to button objects when action = 'transfer_to_human'

COMMENT ON COLUMN public.ai_agents.human_transfer_column_id IS 'Kanban column to move conversation when customer requests human transfer via keywords';-- Create receptionist_configs table for Virtual Receptionist functionality
CREATE TABLE public.receptionist_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Recepcionista Virtual',
  is_active BOOLEAN NOT NULL DEFAULT false,
  welcome_message TEXT NOT NULL DEFAULT 'Olá! 👋 Bem-vindo(a)! Como posso ajudá-lo(a) hoje?',
  menu_format TEXT NOT NULL DEFAULT 'buttons' CHECK (menu_format IN ('buttons', 'list')),
  list_title TEXT DEFAULT 'Escolha uma opção',
  list_button_text TEXT DEFAULT 'Ver opções',
  menu_options JSONB NOT NULL DEFAULT '[{"id": "1", "label": "Falar com atendente", "action_type": "transfer_to_human"}]'::jsonb,
  menu_trigger_keywords JSONB NOT NULL DEFAULT '["menu", "opções", "opcoes"]'::jsonb,
  human_handoff_message TEXT NOT NULL DEFAULT 'Entendido! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Enable RLS
ALTER TABLE public.receptionist_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant receptionist config"
ON public.receptionist_configs
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant receptionist config"
ON public.receptionist_configs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant receptionist config"
ON public.receptionist_configs
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant receptionist config"
ON public.receptionist_configs
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_receptionist_configs_updated_at
BEFORE UPDATE ON public.receptionist_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Update default data_access for ai_agents table with new expanded fields
ALTER TABLE ai_agents 
ALTER COLUMN data_access 
SET DEFAULT '{"customer_details": true, "orders": true, "order_items": true, "order_tracking": true, "products": false, "products_featured": false, "products_catalog": false, "abandoned_carts": true, "coupons": true, "cashback": false, "smart_search": true}'::jsonb;

-- Create cashback_balances table if not exists (for cashback feature)
CREATE TABLE IF NOT EXISTS public.cashback_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cashback_balances ENABLE ROW LEVEL SECURITY;

-- Create policy for tenant access
CREATE POLICY "Tenants can view their cashback balances"
ON public.cashback_balances
FOR SELECT
USING (tenant_id IN (SELECT get_user_tenant_id(auth.uid())));-- Add inactivity configuration columns to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS inactivity_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS inactivity_timeout_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS inactivity_target_column_id UUID DEFAULT NULL REFERENCES kanban_columns(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS inactivity_message TEXT DEFAULT 'Por inatividade estamos finalizando a conversa. Fique à vontade para mandar uma nova mensagem quando precisar!';-- Add keyword_action_rules column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS keyword_action_rules JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.ai_agents.keyword_action_rules IS 'Rules for automatic actions triggered by keywords without AI processing';-- Add message buffer fields to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS message_buffer_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS message_buffer_delay_seconds integer DEFAULT 10;

-- Add buffer tracking fields to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS pending_ai_response_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS buffered_message_ids uuid[] DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN public.ai_agents.message_buffer_enabled IS 'Whether the agent should wait to accumulate multiple messages before responding';
COMMENT ON COLUMN public.ai_agents.message_buffer_delay_seconds IS 'Seconds to wait after last message before processing buffered messages';
COMMENT ON COLUMN public.conversations.pending_ai_response_at IS 'Timestamp when buffered messages should be processed by AI';
COMMENT ON COLUMN public.conversations.buffered_message_ids IS 'Array of message IDs waiting to be processed together';

-- Create index for efficient buffer processing queries
CREATE INDEX IF NOT EXISTS idx_conversations_pending_ai_response 
ON public.conversations (pending_ai_response_at) 
WHERE pending_ai_response_at IS NOT NULL;-- Tabela para armazenar tokens OAuth do Melhor Envio
CREATE TABLE public.melhor_envio_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  environment TEXT DEFAULT 'production',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id)
);

-- RLS para melhor_envio_tokens
ALTER TABLE public.melhor_envio_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage melhor_envio_tokens"
ON public.melhor_envio_tokens
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND is_tenant_admin(auth.uid(), tenant_id)
);

CREATE POLICY "Tenant members can view melhor_envio_tokens"
ON public.melhor_envio_tokens
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Tabela para envios sincronizados do Melhor Envio
CREATE TABLE public.me_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  me_id TEXT NOT NULL,
  order_id UUID REFERENCES public.li_orders(id) ON DELETE SET NULL,
  order_number TEXT,
  protocol TEXT,
  tracking_code TEXT,
  service_name TEXT,
  carrier TEXT,
  status TEXT DEFAULT 'pending',
  price DECIMAL(10,2),
  discount DECIMAL(10,2),
  insurance_value DECIMAL(10,2),
  format TEXT,
  weight DECIMAL(10,3),
  width INTEGER,
  height INTEGER,
  length INTEGER,
  receipt BOOLEAN DEFAULT false,
  own_hand BOOLEAN DEFAULT false,
  collect BOOLEAN DEFAULT false,
  from_address JSONB,
  to_address JSONB,
  tracking_events JSONB DEFAULT '[]'::jsonb,
  last_tracking_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, me_id)
);

-- RLS para me_shipments
ALTER TABLE public.me_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can manage me_shipments"
ON public.me_shipments
FOR ALL
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND has_module_permission(auth.uid(), 'sales'::module_permission, true)
);

CREATE POLICY "Tenant members can view me_shipments"
ON public.me_shipments
FOR SELECT
USING (
  (tenant_id = get_user_tenant_id(auth.uid())) 
  AND has_module_permission(auth.uid(), 'sales'::module_permission)
);

-- Índices para performance
CREATE INDEX idx_me_shipments_tenant ON public.me_shipments(tenant_id);
CREATE INDEX idx_me_shipments_tracking ON public.me_shipments(tracking_code);
CREATE INDEX idx_me_shipments_status ON public.me_shipments(status);
CREATE INDEX idx_me_shipments_order ON public.me_shipments(order_id);
CREATE INDEX idx_me_shipments_order_number ON public.me_shipments(order_number);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_melhor_envio_tokens_updated_at
  BEFORE UPDATE ON public.melhor_envio_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_me_shipments_updated_at
  BEFORE UPDATE ON public.me_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();-- Adicionar novas colunas à tabela me_shipments para armazenar mais dados do Melhor Envio
ALTER TABLE public.me_shipments 
ADD COLUMN IF NOT EXISTS invoice jsonb,
ADD COLUMN IF NOT EXISTS volumes jsonb,
ADD COLUMN IF NOT EXISTS tags jsonb,
ADD COLUMN IF NOT EXISTS authorization_code text,
ADD COLUMN IF NOT EXISTS quote numeric,
ADD COLUMN IF NOT EXISTS products jsonb,
ADD COLUMN IF NOT EXISTS paid_at timestamptz,
ADD COLUMN IF NOT EXISTS generated_at timestamptz,
ADD COLUMN IF NOT EXISTS print_url text,
ADD COLUMN IF NOT EXISTS preview_url text,
ADD COLUMN IF NOT EXISTS delivery_min integer,
ADD COLUMN IF NOT EXISTS delivery_max integer,
ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz,
ADD COLUMN IF NOT EXISTS sender_name text,
ADD COLUMN IF NOT EXISTS receiver_name text,
ADD COLUMN IF NOT EXISTS receiver_phone text,
ADD COLUMN IF NOT EXISTS receiver_city text,
ADD COLUMN IF NOT EXISTS receiver_state text,
ADD COLUMN IF NOT EXISTS receiver_address jsonb,
ADD COLUMN IF NOT EXISTS insurance_value numeric,
ADD COLUMN IF NOT EXISTS discount numeric,
ADD COLUMN IF NOT EXISTS format text,
ADD COLUMN IF NOT EXISTS weight numeric,
ADD COLUMN IF NOT EXISTS dimensions jsonb,
ADD COLUMN IF NOT EXISTS posted_at timestamptz,
ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
ADD COLUMN IF NOT EXISTS last_sync_at timestamptz DEFAULT now();

-- Habilitar Realtime na tabela me_shipments
ALTER PUBLICATION supabase_realtime ADD TABLE public.me_shipments;-- Add external_order_number column to me_shipments
ALTER TABLE me_shipments ADD COLUMN IF NOT EXISTS external_order_number TEXT;

-- Create index for order number lookups
CREATE INDEX IF NOT EXISTS idx_me_shipments_external_order ON me_shipments(tenant_id, external_order_number);

-- Function to get Melhor Envio cron job status
CREATE OR REPLACE FUNCTION public.get_me_cron_job_status()
RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'melhor-envio-sync-hourly'
  LIMIT 1;
$$;

-- Function to get Melhor Envio cron last run
CREATE OR REPLACE FUNCTION public.get_me_cron_last_run()
RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'melhor-envio-sync-hourly'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$$;-- Add integration_id to li_orders if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'li_orders' AND column_name = 'integration_id') THEN
    ALTER TABLE public.li_orders ADD COLUMN integration_id UUID REFERENCES public.integrations(id);
  END IF;
END $$;

-- Add integration_id to li_customers if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'li_customers' AND column_name = 'integration_id') THEN
    ALTER TABLE public.li_customers ADD COLUMN integration_id UUID REFERENCES public.integrations(id);
  END IF;
END $$;

-- Add integration_id to li_products if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'li_products' AND column_name = 'integration_id') THEN
    ALTER TABLE public.li_products ADD COLUMN integration_id UUID REFERENCES public.integrations(id);
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_li_orders_integration ON public.li_orders(integration_id);
CREATE INDEX IF NOT EXISTS idx_li_customers_integration ON public.li_customers(integration_id);
CREATE INDEX IF NOT EXISTS idx_li_products_integration ON public.li_products(integration_id);

-- Populate existing records with integration_id based on tenant_id
-- Find the first loja_integrada integration for each tenant and assign it
UPDATE public.li_orders o
SET integration_id = (
  SELECT id FROM public.integrations i 
  WHERE i.tenant_id = o.tenant_id 
  AND i.type = 'loja_integrada' 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE o.integration_id IS NULL;

UPDATE public.li_customers c
SET integration_id = (
  SELECT id FROM public.integrations i 
  WHERE i.tenant_id = c.tenant_id 
  AND i.type = 'loja_integrada' 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE c.integration_id IS NULL;

UPDATE public.li_products p
SET integration_id = (
  SELECT id FROM public.integrations i 
  WHERE i.tenant_id = p.tenant_id 
  AND i.type = 'loja_integrada' 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE p.integration_id IS NULL;-- Add columns for tracking sync per type
ALTER TABLE integrations 
ADD COLUMN IF NOT EXISTS last_orders_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS last_customers_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS last_products_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS last_carts_sync_at timestamptz,
ADD COLUMN IF NOT EXISTS initial_sync_completed boolean DEFAULT false;

-- Update integrations that already have synced data
UPDATE integrations 
SET initial_sync_completed = true 
WHERE id IN (
  SELECT DISTINCT integration_id FROM li_orders WHERE integration_id IS NOT NULL
);

-- Enable realtime for integrations table
ALTER PUBLICATION supabase_realtime ADD TABLE integrations;-- Criar tabela de jobs para sincronização do Melhor Envio
CREATE TABLE IF NOT EXISTS me_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  integration_id uuid REFERENCES integrations(id),
  status text NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  current_page integer DEFAULT 1,
  total_pages integer,
  items_saved integer DEFAULT 0,
  items_total integer,
  items_linked integer DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS para me_sync_jobs
ALTER TABLE me_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant me_sync_jobs"
  ON me_sync_jobs FOR SELECT
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert me_sync_jobs for their tenant"
  ON me_sync_jobs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant me_sync_jobs"
  ON me_sync_jobs FOR UPDATE
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage me_sync_jobs"
  ON me_sync_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Habilitar Realtime para acompanhamento de progresso
ALTER PUBLICATION supabase_realtime ADD TABLE me_sync_jobs;

-- Adicionar coluna li_order_id na tabela me_shipments para vincular com pedidos da Loja Integrada
ALTER TABLE me_shipments 
ADD COLUMN IF NOT EXISTS li_order_id uuid REFERENCES li_orders(id);

-- Índice para buscas por li_order_id
CREATE INDEX IF NOT EXISTS idx_me_shipments_li_order_id 
ON me_shipments(li_order_id);

-- Índice para buscas por external_order_number
CREATE INDEX IF NOT EXISTS idx_me_shipments_external_order_number 
ON me_shipments(tenant_id, external_order_number);

-- Atualizar registros existentes vinculando com li_orders
UPDATE me_shipments ms
SET li_order_id = lo.id
FROM li_orders lo
WHERE ms.tenant_id = lo.tenant_id
  AND ms.external_order_number IS NOT NULL
  AND ms.external_order_number = lo.numero
  AND ms.li_order_id IS NULL;-- Add integration_id to cashback_configs
ALTER TABLE cashback_configs 
ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE;

-- Add integration_id to generated_coupons
ALTER TABLE generated_coupons 
ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_generated_coupons_integration_id ON generated_coupons(integration_id);
CREATE INDEX IF NOT EXISTS idx_cashback_configs_integration_id ON cashback_configs(integration_id);-- Add columns for imported coupons from Loja Integrada
ALTER TABLE generated_coupons 
ADD COLUMN IF NOT EXISTS li_coupon_id INTEGER,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'cashback',
ADD COLUMN IF NOT EXISTS coupon_type TEXT,
ADD COLUMN IF NOT EXISTS coupon_description TEXT,
ADD COLUMN IF NOT EXISTS li_data_inicio TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS li_data_fim TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS li_quantidade_uso_maximo INTEGER,
ADD COLUMN IF NOT EXISTS li_quantidade_usada INTEGER DEFAULT 0;

-- Create index for li_coupon_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_generated_coupons_li_coupon_id ON generated_coupons(li_coupon_id);

-- Create index for source to filter by origin
CREATE INDEX IF NOT EXISTS idx_generated_coupons_source ON generated_coupons(source);-- Drop existing unique constraints on li_id only
ALTER TABLE li_customers DROP CONSTRAINT IF EXISTS li_customers_li_id_key;
ALTER TABLE li_products DROP CONSTRAINT IF EXISTS li_products_li_id_key;
ALTER TABLE li_orders DROP CONSTRAINT IF EXISTS li_orders_li_id_key;

-- Create composite unique constraints on (li_id, integration_id)
CREATE UNIQUE INDEX IF NOT EXISTS li_customers_li_id_integration_id_key ON li_customers (li_id, integration_id);
CREATE UNIQUE INDEX IF NOT EXISTS li_products_li_id_integration_id_key ON li_products (li_id, integration_id);
CREATE UNIQUE INDEX IF NOT EXISTS li_orders_li_id_integration_id_key ON li_orders (li_id, integration_id);-- Create table for Instagram accounts
CREATE TABLE public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  instagram_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT,
  profile_picture_url TEXT,
  followers_count INTEGER,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  webhook_configured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, instagram_user_id)
);

-- Create table for Instagram messages
CREATE TABLE public.instagram_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  ig_message_id TEXT NOT NULL UNIQUE,
  sender_id TEXT NOT NULL,
  sender_username TEXT,
  recipient_id TEXT NOT NULL,
  message_text TEXT,
  attachment_type TEXT,
  attachment_url TEXT,
  is_from_me BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create table for Instagram settings per tenant
CREATE TABLE public.instagram_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  dm_inbox_enabled BOOLEAN DEFAULT true,
  ai_replies_enabled BOOLEAN DEFAULT false,
  ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  comment_monitoring_enabled BOOLEAN DEFAULT false,
  auto_publish_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for instagram_accounts
CREATE POLICY "Users can view their tenant instagram accounts"
ON public.instagram_accounts FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert instagram accounts for their tenant"
ON public.instagram_accounts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant instagram accounts"
ON public.instagram_accounts FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant instagram accounts"
ON public.instagram_accounts FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for instagram_messages
CREATE POLICY "Users can view their tenant instagram messages"
ON public.instagram_messages FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert instagram messages for their tenant"
ON public.instagram_messages FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS policies for instagram_settings
CREATE POLICY "Users can view their tenant instagram settings"
ON public.instagram_settings FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert instagram settings for their tenant"
ON public.instagram_settings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant instagram settings"
ON public.instagram_settings FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- Create indexes for better performance
CREATE INDEX idx_instagram_accounts_tenant ON public.instagram_accounts(tenant_id);
CREATE INDEX idx_instagram_messages_account ON public.instagram_messages(instagram_account_id);
CREATE INDEX idx_instagram_messages_conversation ON public.instagram_messages(conversation_id);

-- Trigger for updated_at
CREATE TRIGGER update_instagram_accounts_updated_at
BEFORE UPDATE ON public.instagram_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_instagram_settings_updated_at
BEFORE UPDATE ON public.instagram_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for instagram_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_messages;-- Tabela para armazenar states do OAuth (anti-CSRF)
CREATE TABLE public.oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT UNIQUE NOT NULL,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  redirect_path TEXT DEFAULT '/integrations',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- RLS: Service role only (backend access)
CREATE POLICY "Service role can manage oauth_states"
ON public.oauth_states
FOR ALL
USING (true)
WITH CHECK (true);

-- Tabela unificada para conexões Meta (Facebook, Instagram, WhatsApp)
CREATE TABLE public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  
  -- Facebook User Info
  fb_user_id TEXT,
  fb_user_name TEXT,
  
  -- Access Token (será criptografado no backend)
  fb_access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  
  -- Assets selecionados
  selected_pages JSONB DEFAULT '[]'::jsonb,
  selected_instagram JSONB DEFAULT '[]'::jsonb,
  
  -- WhatsApp Cloud API
  whatsapp JSONB DEFAULT NULL,
  
  -- Status e timestamps
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraint: um registro por tenant
  CONSTRAINT unique_tenant_meta_connection UNIQUE (tenant_id)
);

-- Enable RLS
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant meta connections"
ON public.meta_connections
FOR SELECT
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert meta connections for their tenant"
ON public.meta_connections
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta connections"
ON public.meta_connections
FOR UPDATE
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant meta connections"
ON public.meta_connections
FOR DELETE
USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_meta_connections_updated_at
BEFORE UPDATE ON public.meta_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index para performance
CREATE INDEX idx_meta_connections_tenant_id ON public.meta_connections(tenant_id);
CREATE INDEX idx_oauth_states_expires_at ON public.oauth_states(expires_at);-- Add frontend_url column to oauth_states table for correct OAuth redirects
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS frontend_url TEXT;-- Create bling_connections table
CREATE TABLE public.bling_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  status TEXT DEFAULT 'connected',
  bling_user_id TEXT,
  bling_user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create unique index on tenant_id (one connection per tenant)
CREATE UNIQUE INDEX bling_connections_tenant_id_idx ON public.bling_connections(tenant_id);

-- Enable Row Level Security
ALTER TABLE public.bling_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their tenant's bling connections" 
ON public.bling_connections 
FOR SELECT 
USING (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can insert their tenant's bling connections" 
ON public.bling_connections 
FOR INSERT 
WITH CHECK (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can update their tenant's bling connections" 
ON public.bling_connections 
FOR UPDATE 
USING (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can delete their tenant's bling connections" 
ON public.bling_connections 
FOR DELETE 
USING (tenant_id = (SELECT get_user_tenant_id(auth.uid())));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_bling_connections_updated_at
BEFORE UPDATE ON public.bling_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Adicionar coluna bling_company_id na tabela bling_connections para mapeamento tenant
ALTER TABLE bling_connections 
ADD COLUMN IF NOT EXISTS bling_company_id TEXT;

-- Criar index para busca rápida por company_id
CREATE INDEX IF NOT EXISTS idx_bling_connections_company_id 
ON bling_connections(bling_company_id);

-- Criar tabela para eventos de webhook (idempotência)
CREATE TABLE bling_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  company_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  status TEXT DEFAULT 'received',
  error TEXT NULL
);

-- RLS: apenas service role acessa (sem policies = nenhum client acessa)
ALTER TABLE bling_webhook_events ENABLE ROW LEVEL SECURITY;

-- Index para consultas por status e tenant
CREATE INDEX idx_bling_webhook_events_status ON bling_webhook_events(status);
CREATE INDEX idx_bling_webhook_events_tenant ON bling_webhook_events(tenant_id);
CREATE INDEX idx_bling_webhook_events_received ON bling_webhook_events(received_at DESC);-- =============================================
-- BLING ERP - TABELAS ISOLADAS DE DADOS
-- =============================================

-- Tabela de pedidos do Bling
CREATE TABLE public.bling_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bling_id BIGINT NOT NULL,
  numero TEXT NOT NULL,
  data_criacao TIMESTAMPTZ,
  data_modificacao TIMESTAMPTZ,
  situacao_id INTEGER,
  situacao_nome TEXT,
  cliente_id BIGINT,
  cliente_nome TEXT,
  cliente_cpf_cnpj TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  valor_total NUMERIC(12,2),
  valor_desconto NUMERIC(12,2),
  valor_frete NUMERIC(12,2),
  valor_produtos NUMERIC(12,2),
  forma_pagamento TEXT,
  forma_envio TEXT,
  observacoes TEXT,
  observacoes_internas TEXT,
  endereco_entrega JSONB,
  loja_id BIGINT,
  loja_nome TEXT,
  raw_data JSONB,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

-- Tabela de itens de pedido do Bling
CREATE TABLE public.bling_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.bling_orders(id) ON DELETE CASCADE,
  bling_id BIGINT,
  produto_id BIGINT,
  produto_nome TEXT,
  sku TEXT,
  quantidade NUMERIC(12,4),
  valor_unitario NUMERIC(12,2),
  valor_total NUMERIC(12,2),
  desconto NUMERIC(12,2),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de clientes/contatos do Bling
CREATE TABLE public.bling_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bling_id BIGINT NOT NULL,
  nome TEXT NOT NULL,
  fantasia TEXT,
  tipo_pessoa TEXT,
  cpf_cnpj TEXT,
  ie TEXT,
  email TEXT,
  telefone TEXT,
  celular TEXT,
  endereco JSONB,
  situacao TEXT,
  data_inclusao TIMESTAMPTZ,
  raw_data JSONB,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

-- Tabela de produtos do Bling
CREATE TABLE public.bling_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bling_id BIGINT NOT NULL,
  nome TEXT NOT NULL,
  codigo TEXT,
  preco NUMERIC(12,2),
  preco_custo NUMERIC(12,2),
  estoque_atual NUMERIC(12,4),
  estoque_minimo NUMERIC(12,4),
  tipo TEXT,
  situacao TEXT,
  formato TEXT,
  descricao_curta TEXT,
  descricao_completa TEXT,
  unidade TEXT,
  peso_liquido NUMERIC(12,4),
  peso_bruto NUMERIC(12,4),
  gtin TEXT,
  imagem_url TEXT,
  categoria_id BIGINT,
  categoria_nome TEXT,
  raw_data JSONB,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bling_id, integration_id)
);

-- Tabela de logs de sincronização do Bling
CREATE TABLE public.bling_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de jobs de sincronização do Bling
CREATE TABLE public.bling_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID NOT NULL REFERENCES public.bling_sync_logs(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  current_page INTEGER DEFAULT 0,
  total_count INTEGER DEFAULT 0,
  processed_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- ÍNDICES PARA PERFORMANCE
-- =============================================

-- Índices para bling_orders
CREATE INDEX idx_bling_orders_integration_id ON public.bling_orders(integration_id);
CREATE INDEX idx_bling_orders_tenant_id ON public.bling_orders(tenant_id);
CREATE INDEX idx_bling_orders_bling_id ON public.bling_orders(bling_id);
CREATE INDEX idx_bling_orders_data_criacao ON public.bling_orders(data_criacao DESC);
CREATE INDEX idx_bling_orders_situacao ON public.bling_orders(situacao_nome);
CREATE INDEX idx_bling_orders_loja_id ON public.bling_orders(loja_id);

-- Índices para bling_order_items
CREATE INDEX idx_bling_order_items_order_id ON public.bling_order_items(order_id);
CREATE INDEX idx_bling_order_items_tenant_id ON public.bling_order_items(tenant_id);

-- Índices para bling_customers
CREATE INDEX idx_bling_customers_integration_id ON public.bling_customers(integration_id);
CREATE INDEX idx_bling_customers_tenant_id ON public.bling_customers(tenant_id);
CREATE INDEX idx_bling_customers_bling_id ON public.bling_customers(bling_id);
CREATE INDEX idx_bling_customers_nome ON public.bling_customers(nome);
CREATE INDEX idx_bling_customers_cpf_cnpj ON public.bling_customers(cpf_cnpj);

-- Índices para bling_products
CREATE INDEX idx_bling_products_integration_id ON public.bling_products(integration_id);
CREATE INDEX idx_bling_products_tenant_id ON public.bling_products(tenant_id);
CREATE INDEX idx_bling_products_bling_id ON public.bling_products(bling_id);
CREATE INDEX idx_bling_products_codigo ON public.bling_products(codigo);
CREATE INDEX idx_bling_products_nome ON public.bling_products(nome);

-- Índices para bling_sync_logs
CREATE INDEX idx_bling_sync_logs_integration_id ON public.bling_sync_logs(integration_id);
CREATE INDEX idx_bling_sync_logs_tenant_id ON public.bling_sync_logs(tenant_id);
CREATE INDEX idx_bling_sync_logs_status ON public.bling_sync_logs(status);

-- Índices para bling_sync_jobs
CREATE INDEX idx_bling_sync_jobs_integration_id ON public.bling_sync_jobs(integration_id);
CREATE INDEX idx_bling_sync_jobs_tenant_id ON public.bling_sync_jobs(tenant_id);
CREATE INDEX idx_bling_sync_jobs_status ON public.bling_sync_jobs(status);
CREATE INDEX idx_bling_sync_jobs_sync_log_id ON public.bling_sync_jobs(sync_log_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS
ALTER TABLE public.bling_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bling_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Policies for bling_orders
CREATE POLICY "Users can view their tenant bling_orders"
  ON public.bling_orders FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_orders"
  ON public.bling_orders FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_orders"
  ON public.bling_orders FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_orders"
  ON public.bling_orders FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_order_items
CREATE POLICY "Users can view their tenant bling_order_items"
  ON public.bling_order_items FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_order_items"
  ON public.bling_order_items FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_order_items"
  ON public.bling_order_items FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_order_items"
  ON public.bling_order_items FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_customers
CREATE POLICY "Users can view their tenant bling_customers"
  ON public.bling_customers FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_customers"
  ON public.bling_customers FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_customers"
  ON public.bling_customers FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_customers"
  ON public.bling_customers FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_products
CREATE POLICY "Users can view their tenant bling_products"
  ON public.bling_products FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_products"
  ON public.bling_products FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_products"
  ON public.bling_products FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant bling_products"
  ON public.bling_products FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_sync_logs
CREATE POLICY "Users can view their tenant bling_sync_logs"
  ON public.bling_sync_logs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_sync_logs"
  ON public.bling_sync_logs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_sync_logs"
  ON public.bling_sync_logs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Policies for bling_sync_jobs
CREATE POLICY "Users can view their tenant bling_sync_jobs"
  ON public.bling_sync_jobs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant bling_sync_jobs"
  ON public.bling_sync_jobs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant bling_sync_jobs"
  ON public.bling_sync_jobs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================
-- TRIGGERS PARA UPDATED_AT
-- =============================================

CREATE TRIGGER update_bling_orders_updated_at
  BEFORE UPDATE ON public.bling_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_customers_updated_at
  BEFORE UPDATE ON public.bling_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_products_updated_at
  BEFORE UPDATE ON public.bling_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bling_sync_jobs_updated_at
  BEFORE UPDATE ON public.bling_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- HABILITAR REALTIME PARA TABELAS PRINCIPAIS
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bling_sync_jobs;-- Add bling_store_ids column to integrations table for storing selected Bling stores
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS bling_store_ids integer[] DEFAULT NULL;-- Adicionar novas colunas na tabela bling_orders para dados completos da API do Bling

-- Datas adicionais
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS numero_loja TEXT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS data_saida TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS data_prevista TIMESTAMP WITH TIME ZONE;

-- Valores adicionais
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS outras_despesas NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS numero_pedido_compra TEXT;

-- Categoria
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS categoria_id BIGINT;

-- Nota Fiscal vinculada
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS nota_fiscal_id BIGINT;

-- Tributacao
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS total_icms NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS total_ipi NUMERIC DEFAULT 0;

-- Vendedor
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS vendedor_id BIGINT;

-- Intermediador (Marketplace)
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS intermediador_cnpj TEXT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS intermediador_nome_usuario TEXT;

-- Taxas do Marketplace
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS taxa_comissao NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS custo_frete NUMERIC DEFAULT 0;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS valor_base NUMERIC DEFAULT 0;

-- Transporte expandido
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS frete_por_conta INTEGER;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS quantidade_volumes INTEGER;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS peso_bruto NUMERIC;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS prazo_entrega INTEGER;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS transportador_id BIGINT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS transportador_nome TEXT;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS etiqueta JSONB;
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS volumes JSONB;

-- Parcelas (array de pagamentos)
ALTER TABLE public.bling_orders ADD COLUMN IF NOT EXISTS parcelas JSONB;

-- Adicionar novas colunas na tabela bling_order_items

-- Campos adicionais dos itens
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS unidade TEXT;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS aliquota_ipi NUMERIC DEFAULT 0;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS descricao_detalhada TEXT;

-- Comissao
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS comissao_base NUMERIC DEFAULT 0;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS comissao_aliquota NUMERIC DEFAULT 0;
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS comissao_valor NUMERIC DEFAULT 0;

-- Natureza da operacao
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS natureza_operacao_id BIGINT;

-- Raw data do item para manter todos os dados
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS raw_data JSONB;-- Add additional customer fields to bling_customers table
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS data_nascimento DATE;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS sexo TEXT;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS naturalidade TEXT;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS rg TEXT;
ALTER TABLE public.bling_customers ADD COLUMN IF NOT EXISTS orgao_emissor TEXT;

-- Add index for birthday queries (useful for birthday campaigns)
CREATE INDEX IF NOT EXISTS idx_bling_customers_data_nascimento ON public.bling_customers(data_nascimento);-- Add preco_custo (cost price) column to bling_order_items
ALTER TABLE public.bling_order_items ADD COLUMN IF NOT EXISTS preco_custo numeric DEFAULT 0;
-- Conversas unificadas do Meta (separadas do Atendimento existente)
CREATE TABLE public.meta_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger')),
  asset_id TEXT NOT NULL,
  contact_ref TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar_url TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  assigned_to UUID REFERENCES public.profiles(user_id),
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Mensagens do Meta (todas as plataformas)
CREATE TABLE public.meta_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.meta_conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger')),
  asset_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_ref TEXT,
  to_ref TEXT,
  content TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'audio', 'template', 'document', 'sticker')),
  payload JSONB,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Comentários do Instagram
CREATE TABLE public.meta_ig_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ig_user_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  comment_id TEXT NOT NULL,
  parent_comment_id TEXT,
  text TEXT,
  username TEXT,
  user_id TEXT,
  timestamp TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'replied', 'hidden')),
  reply_id TEXT,
  reply_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, comment_id)
);

-- Templates do WhatsApp
CREATE TABLE public.meta_whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  waba_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT,
  status TEXT CHECK (status IN ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED')),
  components JSONB,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, waba_id, template_id)
);

-- Logs de webhook para diagnóstico
CREATE TABLE public.meta_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  channel TEXT,
  event_type TEXT,
  payload JSONB,
  error TEXT,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_meta_conversations_tenant ON public.meta_conversations(tenant_id);
CREATE INDEX idx_meta_conversations_channel ON public.meta_conversations(tenant_id, channel);
CREATE INDEX idx_meta_conversations_status ON public.meta_conversations(tenant_id, status);
CREATE INDEX idx_meta_conversations_last_message ON public.meta_conversations(tenant_id, last_message_at DESC);

CREATE INDEX idx_meta_messages_tenant ON public.meta_messages(tenant_id);
CREATE INDEX idx_meta_messages_conversation ON public.meta_messages(conversation_id);
CREATE INDEX idx_meta_messages_created ON public.meta_messages(tenant_id, created_at DESC);

CREATE INDEX idx_meta_ig_comments_tenant ON public.meta_ig_comments(tenant_id);
CREATE INDEX idx_meta_ig_comments_ig_user ON public.meta_ig_comments(tenant_id, ig_user_id);
CREATE INDEX idx_meta_ig_comments_status ON public.meta_ig_comments(tenant_id, status);

CREATE INDEX idx_meta_whatsapp_templates_tenant ON public.meta_whatsapp_templates(tenant_id);
CREATE INDEX idx_meta_webhook_logs_tenant ON public.meta_webhook_logs(tenant_id);
CREATE INDEX idx_meta_webhook_logs_created ON public.meta_webhook_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.meta_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ig_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for meta_conversations
CREATE POLICY "Users can view their tenant meta_conversations"
ON public.meta_conversations FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_conversations"
ON public.meta_conversations FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_conversations"
ON public.meta_conversations FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant meta_conversations"
ON public.meta_conversations FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_messages
CREATE POLICY "Users can view their tenant meta_messages"
ON public.meta_messages FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_messages"
ON public.meta_messages FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_messages"
ON public.meta_messages FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_ig_comments
CREATE POLICY "Users can view their tenant meta_ig_comments"
ON public.meta_ig_comments FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_ig_comments"
ON public.meta_ig_comments FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_ig_comments"
ON public.meta_ig_comments FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_whatsapp_templates
CREATE POLICY "Users can view their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant meta_whatsapp_templates"
ON public.meta_whatsapp_templates FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for meta_webhook_logs (view only for users)
CREATE POLICY "Users can view their tenant meta_webhook_logs"
ON public.meta_webhook_logs FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_meta_conversations_updated_at
BEFORE UPDATE ON public.meta_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for conversations and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_messages;
-- Add verification state columns to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS verification_state TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS verification_data JSONB DEFAULT NULL;

-- Add comment explaining the states
COMMENT ON COLUMN public.conversations.verification_state IS 'Order verification flow state: awaiting_order_number, awaiting_cpf_verification, verified, or NULL';
COMMENT ON COLUMN public.conversations.verification_data IS 'Stores verification context: {order_id, order_number, cpf_prefix, attempts}';-- Add store_integration_id to ai_agents for multi-store support
ALTER TABLE public.ai_agents 
ADD COLUMN store_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ai_agents.store_integration_id IS 'ID da integração de loja para consulta de dados (pedidos, clientes, produtos). Se NULL, usa detecção automática.';-- Adicionar colunas enriquecidas em li_orders
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS cliente_cpf_cnpj text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS codigo_rastreio text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS url_rastreio text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS data_envio timestamp with time zone;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS data_pagamento timestamp with time zone;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS cupom_desconto text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS gateway_pagamento text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS transacao_id text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS numero_nota_fiscal text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS valor_seguro numeric;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS nome_destinatario text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS telefone_destinatario text;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS envios jsonb;
ALTER TABLE li_orders ADD COLUMN IF NOT EXISTS parcelas jsonb;

-- Adicionar colunas enriquecidas em li_order_items
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS preco_custo numeric;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS preco_promocional numeric;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS desconto numeric;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS variacao text;
ALTER TABLE li_order_items ADD COLUMN IF NOT EXISTS imagem_url text;

-- Criar índices para melhorar performance de buscas
CREATE INDEX IF NOT EXISTS idx_li_orders_codigo_rastreio ON li_orders(codigo_rastreio) WHERE codigo_rastreio IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_li_orders_cliente_cpf_cnpj ON li_orders(cliente_cpf_cnpj) WHERE cliente_cpf_cnpj IS NOT NULL;-- Add order verification configuration columns to ai_agents table
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_verification_enabled boolean DEFAULT false;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_verification_mode text DEFAULT 'sequential';

-- Custom messages for each step of the verification flow
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_verification_messages jsonb DEFAULT '{
  "ask_order_number": "Por favor, informe o *número do pedido* para que eu possa consultar.",
  "ask_cpf": "Agora preciso dos *3 primeiros dígitos do CPF* cadastrado no pedido para confirmar sua identidade.",
  "ask_both": "Para consultar seu pedido, por favor informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado",
  "order_not_found": "❌ Não encontrei o pedido *#{order_number}* em nosso sistema.\n\nPor favor, verifique o número e tente novamente.",
  "cpf_wrong": "❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_",
  "cpf_max_attempts": "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um de nossos atendentes que poderá ajudá-lo.",
  "order_verified": "✅ *Pedido encontrado!*\n\n{order_details}",
  "after_verified": "Posso ajudar com mais alguma coisa sobre este pedido?"
}'::jsonb;

-- Template for order details display
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_details_template text DEFAULT '📦 *Pedido #{numero}*
📅 Data: {data_criacao}
👤 Cliente: {cliente_nome}
📊 Status: {situacao_nome}
💰 Total: R$ {valor_total}
🚚 Rastreio: {codigo_rastreio}

🛒 *Itens:*
{order_items}';

-- Kanban columns for each transfer scenario
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_not_found_column_id uuid REFERENCES kanban_columns(id);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS cpf_max_attempts_column_id uuid REFERENCES kanban_columns(id);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS after_verified_column_id uuid REFERENCES kanban_columns(id);-- Add new columns to me_shipments for enriched data
ALTER TABLE public.me_shipments 
ADD COLUMN IF NOT EXISTS sender_document text,
ADD COLUMN IF NOT EXISTS sender_email text,
ADD COLUMN IF NOT EXISTS sender_phone text,
ADD COLUMN IF NOT EXISTS receiver_email text,
ADD COLUMN IF NOT EXISTS receiver_document text,
ADD COLUMN IF NOT EXISTS receiver_note text,
ADD COLUMN IF NOT EXISTS agency_name text,
ADD COLUMN IF NOT EXISTS agency_address jsonb,
ADD COLUMN IF NOT EXISTS cte_key text,
ADD COLUMN IF NOT EXISTS contract text,
ADD COLUMN IF NOT EXISTS billed_weight numeric,
ADD COLUMN IF NOT EXISTS non_commercial boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS conciliation jsonb,
ADD COLUMN IF NOT EXISTS additional_info jsonb,
ADD COLUMN IF NOT EXISTS service_details jsonb,
ADD COLUMN IF NOT EXISTS financial_details jsonb;-- Add auto-sync configuration columns to integrations table
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_sync_interval_minutes integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS auto_sync_orders boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_customers boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_products boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_carts boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_coupons boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_sync_shipments boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS last_auto_sync_at timestamp with time zone;-- Campos individuais de intervalo por tipo de sync
ALTER TABLE public.integrations 
  ADD COLUMN IF NOT EXISTS auto_sync_orders_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_customers_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_products_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_carts_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_coupons_interval integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS auto_sync_shipments_interval integer DEFAULT 5;

-- Campos individuais de última sync por tipo
ALTER TABLE public.integrations 
  ADD COLUMN IF NOT EXISTS last_sync_orders_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_customers_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_products_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_carts_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_coupons_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_shipments_at timestamp with time zone;-- Add column to track when we're awaiting phone input from LID contacts
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS awaiting_phone_input BOOLEAN DEFAULT false;-- Add verification_type column to ai_agents table
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS 
  verification_type TEXT DEFAULT 'order';

-- Add comment
COMMENT ON COLUMN public.ai_agents.verification_type IS 'Type of verification: order (for orders/CPF) or shipping (for shipments/phone)';-- Add tracking_link_base column to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS tracking_link_base TEXT;-- Adicionar campos de captura de lead na tabela receptionist_configs
ALTER TABLE public.receptionist_configs
ADD COLUMN IF NOT EXISTS target_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS lead_capture_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS lead_capture_name_message TEXT DEFAULT 'Para um melhor atendimento, qual é o seu nome? 😊',
ADD COLUMN IF NOT EXISTS lead_capture_phone_message TEXT DEFAULT 'Obrigado, {nome}! Agora me informe seu número de telefone com DDD:',
ADD COLUMN IF NOT EXISTS lead_capture_success_message TEXT DEFAULT 'Perfeito, {nome}! Seus dados foram salvos. Agora vamos ao seu atendimento...';

-- Adicionar campos de estado de captura de lead na tabela conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS lead_capture_state TEXT,
ADD COLUMN IF NOT EXISTS lead_capture_data JSONB DEFAULT '{}';

-- Criar tabela de leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT DEFAULT 'receptionist',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_leads_tenant_id ON public.leads(tenant_id);
CREATE INDEX idx_leads_phone ON public.leads(phone);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX idx_leads_integration_id ON public.leads(integration_id);

-- Habilitar RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Política de acesso por tenant
CREATE POLICY "Tenant members can manage their leads"
  ON public.leads
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();-- Habilitar realtime para tabela de pedidos Loja Integrada
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_orders;-- Ensure Loja Integrada upserts work correctly by enforcing natural keys per integration

ALTER TABLE public.li_orders
  ADD CONSTRAINT li_orders_integration_li_id_key UNIQUE (integration_id, li_id);

ALTER TABLE public.li_customers
  ADD CONSTRAINT li_customers_integration_li_id_key UNIQUE (integration_id, li_id);

ALTER TABLE public.li_products
  ADD CONSTRAINT li_products_integration_li_id_key UNIQUE (integration_id, li_id);
-- Add cron job for Bling auto-sync (every minute)
SELECT cron.schedule(
  'invoke-bling-job-processor-every-1-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bling-job-processor',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);-- Add integration_id column to me_shipments for multi-account support
ALTER TABLE public.me_shipments 
ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_me_shipments_integration_id ON public.me_shipments(integration_id);-- Create me_auto_sync_configs table for Melhor Envio auto-sync control
CREATE TABLE IF NOT EXISTS public.me_auto_sync_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL DEFAULT 'shipments',
  is_active BOOLEAN NOT NULL DEFAULT false,
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id, sync_type)
);

-- Enable RLS
ALTER TABLE public.me_auto_sync_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete own ME auto-sync configs"
  ON public.me_auto_sync_configs FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role access for edge functions
CREATE POLICY "Service role full access to ME auto-sync configs"
  ON public.me_auto_sync_configs FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_me_auto_sync_configs_updated_at
  BEFORE UPDATE ON public.me_auto_sync_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for cron queries
CREATE INDEX idx_me_auto_sync_next_sync ON public.me_auto_sync_configs(next_sync_at) 
  WHERE is_active = true;-- Create table for Bling code mappings (order status and payment methods)
CREATE TABLE public.bling_code_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('order_status', 'payment_method')),
  original_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(integration_id, mapping_type, original_code)
);

-- Enable RLS
ALTER TABLE public.bling_code_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies using the same pattern as other tables
CREATE POLICY "bling_code_mappings_select" ON public.bling_code_mappings 
FOR SELECT TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "bling_code_mappings_insert" ON public.bling_code_mappings 
FOR INSERT TO authenticated
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "bling_code_mappings_update" ON public.bling_code_mappings 
FOR UPDATE TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "bling_code_mappings_delete" ON public.bling_code_mappings 
FOR DELETE TO authenticated
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Create index for faster lookups
CREATE INDEX idx_bling_code_mappings_lookup ON public.bling_code_mappings(integration_id, mapping_type);

-- Create trigger for updated_at
CREATE TRIGGER update_bling_code_mappings_updated_at
BEFORE UPDATE ON public.bling_code_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Enable full replica identity for li_orders to get complete data in realtime updates
ALTER TABLE public.li_orders REPLICA IDENTITY FULL;

-- Ensure li_orders is in the realtime publication (may already be added but safe to run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'li_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.li_orders;
  END IF;
END $$;-- Add column to track when status was last verified (separate from synced_at)
ALTER TABLE public.li_orders 
ADD COLUMN IF NOT EXISTS last_status_check_at TIMESTAMPTZ;

-- Create index for efficient ordering by last_status_check_at
CREATE INDEX IF NOT EXISTS idx_li_orders_last_status_check 
ON public.li_orders (integration_id, last_status_check_at NULLS FIRST)
WHERE situacao_nome NOT ILIKE '%cancelado%' 
  AND situacao_nome NOT ILIKE '%entregue%' 
  AND situacao_nome NOT ILIKE '%devolvido%';-- Continue fixing remaining RLS policies

-- 3. Fix me_sync_jobs (already has new policy, need to drop old one if exists)
DROP POLICY IF EXISTS "Users can manage their tenant me_sync_jobs" ON public.me_sync_jobs;
CREATE POLICY "Users can manage their tenant me_sync_jobs" 
ON public.me_sync_jobs FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 4. Fix oauth_states (temporary states for OAuth flow)
DROP POLICY IF EXISTS "Users can manage their own oauth_states" ON public.oauth_states;
CREATE POLICY "Users can manage their own oauth_states" 
ON public.oauth_states FOR ALL TO authenticated
USING (user_id = auth.uid());

-- 5. Fix order_notification_configs
DROP POLICY IF EXISTS "Users can view their tenant order_notification_configs" ON public.order_notification_configs;
DROP POLICY IF EXISTS "Users can manage their tenant order_notification_configs" ON public.order_notification_configs;
CREATE POLICY "Users can view their tenant order_notification_configs" 
ON public.order_notification_configs FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can manage their tenant order_notification_configs" 
ON public.order_notification_configs FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6. Fix order_notification_executions
DROP POLICY IF EXISTS "Users can view their tenant order_notification_executions" ON public.order_notification_executions;
DROP POLICY IF EXISTS "Service role can insert order_notification_executions" ON public.order_notification_executions;
CREATE POLICY "Users can view their tenant order_notification_executions" 
ON public.order_notification_executions FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can insert order_notification_executions" 
ON public.order_notification_executions FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 7. Fix order_notification_status_rules
DROP POLICY IF EXISTS "Users can view their tenant order_notification_status_rules" ON public.order_notification_status_rules;
DROP POLICY IF EXISTS "Users can manage their tenant order_notification_status_rules" ON public.order_notification_status_rules;
CREATE POLICY "Users can view their tenant order_notification_status_rules" 
ON public.order_notification_status_rules FOR SELECT TO authenticated
USING (config_id IN (SELECT id FROM public.order_notification_configs WHERE tenant_id = public.get_user_tenant_id(auth.uid())));

CREATE POLICY "Users can manage their tenant order_notification_status_rules" 
ON public.order_notification_status_rules FOR ALL TO authenticated
USING (config_id IN (SELECT id FROM public.order_notification_configs WHERE tenant_id = public.get_user_tenant_id(auth.uid())));

-- 8. Add policy to bling_webhook_events (RLS enabled but no policies)
DROP POLICY IF EXISTS "Users can view their tenant bling_webhook_events" ON public.bling_webhook_events;
DROP POLICY IF EXISTS "Allow insert bling_webhook_events" ON public.bling_webhook_events;
CREATE POLICY "Users can view their tenant bling_webhook_events" 
ON public.bling_webhook_events FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Allow webhooks to insert without auth (external webhooks)
CREATE POLICY "Allow insert bling_webhook_events" 
ON public.bling_webhook_events FOR INSERT
WITH CHECK (true);-- Remove old permissive policies that were not dropped before

DROP POLICY IF EXISTS "Service role can manage abandoned_cart_executions" ON public.abandoned_cart_executions;
DROP POLICY IF EXISTS "Service role can manage provider health" ON public.ai_provider_health;
DROP POLICY IF EXISTS "Service role can manage me_sync_jobs" ON public.me_sync_jobs;
DROP POLICY IF EXISTS "Service role can manage oauth_states" ON public.oauth_states;
DROP POLICY IF EXISTS "Service role can manage order_notification_configs" ON public.order_notification_configs;
DROP POLICY IF EXISTS "Service role can manage order_notification_executions" ON public.order_notification_executions;
DROP POLICY IF EXISTS "Service role can manage order_notification_status_rules" ON public.order_notification_status_rules;-- Adicionar campo para armazenar ID da última mensagem recebida (para reply em contatos LID)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_incoming_message_id TEXT;

COMMENT ON COLUMN public.conversations.last_incoming_message_id IS 'ID da última mensagem recebida do cliente, usado para reply em contatos @lid';-- Enriquecer tabela bling_products com todos os dados disponíveis da API

-- Dimensões completas
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS altura NUMERIC;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS largura NUMERIC;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS profundidade NUMERIC;

-- Fornecedor
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS fornecedor_nome TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS fornecedor_codigo TEXT;

-- Marca
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS marca TEXT;

-- Múltiplas imagens (array de objetos com link, tipoArmazenamento, etc)
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS imagens JSONB;

-- Variações (para produtos pai)
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS variacoes JSONB;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS produto_pai_id INTEGER;

-- Tributação
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS cest TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS origem INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS tributacao JSONB;

-- Estoque detalhado por depósito
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS estoque_depositos JSONB;

-- Campos adicionais
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS condicao INTEGER; -- 0=Não especificado, 1=Novo, 2=Usado
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS frete_gratis BOOLEAN DEFAULT false;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS producao_propria BOOLEAN DEFAULT false;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS localizacao TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS cross_docking INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS garantia INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS volumes_por_produto INTEGER;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS gtin_embalagem TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS campos_customizados JSONB;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS data_validade DATE;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS classe_fiscal TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS sob_encomenda BOOLEAN DEFAULT false;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS ean TEXT;
ALTER TABLE bling_products ADD COLUMN IF NOT EXISTS dados_nfe JSONB;

-- Índices para buscas comuns
CREATE INDEX IF NOT EXISTS idx_bling_products_fornecedor ON bling_products(fornecedor_id) WHERE fornecedor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bling_products_marca ON bling_products(marca) WHERE marca IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bling_products_ncm ON bling_products(ncm) WHERE ncm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bling_products_produto_pai ON bling_products(produto_pai_id) WHERE produto_pai_id IS NOT NULL;-- Adicionar campos para suporte a produtos pai/filho na Loja Integrada
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS produto_pai_id INTEGER;
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS imagens JSONB;
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS variacoes JSONB;
ALTER TABLE li_products ADD COLUMN IF NOT EXISTS atributos JSONB;

-- Índice para buscar filhos de um produto pai
CREATE INDEX IF NOT EXISTS idx_li_products_produto_pai 
ON li_products(integration_id, produto_pai_id);-- Add resumable sync columns to bling_sync_jobs
ALTER TABLE public.bling_sync_jobs
ADD COLUMN IF NOT EXISTS resume_page integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_pages_per_run integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_at timestamptz,
ADD COLUMN IF NOT EXISTS locked_by text;

-- Create index for efficient job processing queries
CREATE INDEX IF NOT EXISTS idx_bling_sync_jobs_processor 
ON public.bling_sync_jobs (job_type, status, integration_id) 
WHERE status IN ('pending', 'running');

-- Create index for heartbeat monitoring
CREATE INDEX IF NOT EXISTS idx_bling_sync_jobs_heartbeat 
ON public.bling_sync_jobs (last_heartbeat_at) 
WHERE status IN ('pending', 'running');-- Corrigir produto_pai_id para BIGINT
ALTER TABLE public.bling_products 
ALTER COLUMN produto_pai_id TYPE bigint USING produto_pai_id::bigint;-- Add removido column to track products in trash
ALTER TABLE public.li_products 
ADD COLUMN IF NOT EXISTS removido BOOLEAN DEFAULT false;

-- Index for filtering queries
CREATE INDEX IF NOT EXISTS idx_li_products_removido 
ON public.li_products(removido) WHERE removido = false;-- Campos fiscais/identificadores
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS gtin TEXT;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS ncm TEXT;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS mpn TEXT;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS id_externo INTEGER;

-- Campos de status
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN DEFAULT false;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS usado BOOLEAN DEFAULT false;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS sob_consulta BOOLEAN DEFAULT false;

-- Mídia
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS url_video_youtube TEXT;

-- Relacionamentos (salvos como JSONB para flexibilidade)
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS marca JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS categorias JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS grades JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS filhos JSONB;
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS seo JSONB;

-- Resource URI para referência
ALTER TABLE public.li_products ADD COLUMN IF NOT EXISTS resource_uri TEXT;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_li_products_gtin ON public.li_products(gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_li_products_ncm ON public.li_products(ncm) WHERE ncm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_li_products_id_externo ON public.li_products(id_externo) WHERE id_externo IS NOT NULL;-- =============================================================================
-- Bling Situacoes (Status) Cache Table
-- =============================================================================

CREATE TABLE public.bling_situacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  situacao_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  id_herdado INTEGER,
  cor TEXT,
  modulo_id INTEGER NOT NULL,
  modulo_nome TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(integration_id, situacao_id)
);

COMMENT ON TABLE public.bling_situacoes IS 'Cache de situações/status de pedidos do Bling';

-- Índices
CREATE INDEX idx_bling_situacoes_tenant_id ON public.bling_situacoes(tenant_id);
CREATE INDEX idx_bling_situacoes_integration_id ON public.bling_situacoes(integration_id);
CREATE INDEX idx_bling_situacoes_situacao_id ON public.bling_situacoes(situacao_id);

-- RLS
ALTER TABLE public.bling_situacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant situacoes"
  ON public.bling_situacoes FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant situacoes"
  ON public.bling_situacoes FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant situacoes"
  ON public.bling_situacoes FOR UPDATE
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access to bling_situacoes"
  ON public.bling_situacoes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);-- =============================================================================
-- CORREÇÕES DO MÓDULO DE ATENDIMENTO
-- =============================================================================

-- 1. Adicionar campo last_incoming_message_id para rastrear última mensagem recebida (necessário para replies LID)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_incoming_message_id TEXT;

-- 2. Índice para performance de last_incoming_message_id
CREATE INDEX IF NOT EXISTS idx_conversations_last_incoming_message 
ON public.conversations(last_incoming_message_id) 
WHERE last_incoming_message_id IS NOT NULL;

-- 3. Índice para ordenação de conversas por última mensagem
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at_desc 
ON public.conversations(tenant_id, last_message_at DESC NULLS LAST);

-- 4. Função atômica para adicionar mensagem ao buffer (evita race condition)
CREATE OR REPLACE FUNCTION public.add_message_to_buffer(
  _conversation_id UUID,
  _message_id TEXT,
  _delay_seconds INTEGER DEFAULT 3
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.conversations
  SET 
    buffered_message_ids = array_append(
      COALESCE(buffered_message_ids, ARRAY[]::TEXT[]), 
      _message_id
    ),
    pending_ai_response_at = COALESCE(
      pending_ai_response_at,
      NOW() + (_delay_seconds || ' seconds')::INTERVAL
    ),
    updated_at = NOW()
  WHERE id = _conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função para limpar buffer de mensagens (usada após processar)
CREATE OR REPLACE FUNCTION public.clear_message_buffer(
  _conversation_id UUID
)
RETURNS TEXT[] AS $$
DECLARE
  _buffered_ids TEXT[];
BEGIN
  -- Pegar os IDs atuais e limpar atomicamente
  UPDATE public.conversations
  SET 
    buffered_message_ids = ARRAY[]::TEXT[],
    pending_ai_response_at = NULL,
    updated_at = NOW()
  WHERE id = _conversation_id
  RETURNING buffered_message_ids INTO _buffered_ids;
  
  RETURN _buffered_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função para mapear status do Evolution API
CREATE OR REPLACE FUNCTION public.map_evolution_status(status TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE UPPER(status)
    WHEN 'PENDING' THEN 'pending'
    WHEN 'SENT' THEN 'sent'
    WHEN 'DELIVERY_ACK' THEN 'delivered'
    WHEN 'READ' THEN 'read'
    WHEN 'PLAYED' THEN 'read'
    WHEN 'FAILED' THEN 'failed'
    WHEN 'ERROR' THEN 'failed'
    ELSE LOWER(COALESCE(status, 'unknown'))
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. Índice para busca de mensagens por whatsapp_id (usado em status updates)
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id 
ON public.messages((metadata->>'whatsapp_id'))
WHERE metadata->>'whatsapp_id' IS NOT NULL;-- Corrigir search_path das funções criadas
CREATE OR REPLACE FUNCTION public.add_message_to_buffer(
  _conversation_id UUID,
  _message_id TEXT,
  _delay_seconds INTEGER DEFAULT 3
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.conversations
  SET 
    buffered_message_ids = array_append(
      COALESCE(buffered_message_ids, ARRAY[]::TEXT[]), 
      _message_id
    ),
    pending_ai_response_at = COALESCE(
      pending_ai_response_at,
      NOW() + (_delay_seconds || ' seconds')::INTERVAL
    ),
    updated_at = NOW()
  WHERE id = _conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.clear_message_buffer(
  _conversation_id UUID
)
RETURNS TEXT[] AS $$
DECLARE
  _buffered_ids TEXT[];
BEGIN
  UPDATE public.conversations
  SET 
    buffered_message_ids = ARRAY[]::TEXT[],
    pending_ai_response_at = NULL,
    updated_at = NOW()
  WHERE id = _conversation_id
  RETURNING buffered_message_ids INTO _buffered_ids;
  
  RETURN _buffered_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.map_evolution_status(status TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE UPPER(status)
    WHEN 'PENDING' THEN 'pending'
    WHEN 'SENT' THEN 'sent'
    WHEN 'DELIVERY_ACK' THEN 'delivered'
    WHEN 'READ' THEN 'read'
    WHEN 'PLAYED' THEN 'read'
    WHEN 'FAILED' THEN 'failed'
    WHEN 'ERROR' THEN 'failed'
    ELSE LOWER(COALESCE(status, 'unknown'))
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;-- Habilitar realtime para tabelas da Loja Integrada que estão faltando
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_coupons;
-- Remover tabelas da publicação realtime (sem IF EXISTS)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.li_orders;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.li_products;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.li_customers;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END$$;

-- Remover FK de contacts para li_customers
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_li_customer_id_fkey;

-- Drop tabelas antigas
DROP TABLE IF EXISTS public.li_order_items CASCADE;
DROP TABLE IF EXISTS public.li_orders CASCADE;
DROP TABLE IF EXISTS public.li_customers CASCADE;
DROP TABLE IF EXISTS public.li_products CASCADE;
DROP TABLE IF EXISTS public.li_sync_jobs CASCADE;
DROP TABLE IF EXISTS public.li_sync_logs CASCADE;

-- li_sync_state
CREATE TABLE public.li_sync_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  last_cursor TEXT,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  records_synced INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, entity_type)
);
ALTER TABLE public.li_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_sync_state_select" ON public.li_sync_state FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE POLICY "li_sync_state_all" ON public.li_sync_state FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));

-- li_webhook_events
CREATE TABLE public.li_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  payload_json JSONB,
  processed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'received',
  error TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  retry_count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.li_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_webhook_events_select" ON public.li_webhook_events FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_webhook_events_status ON public.li_webhook_events(status);
CREATE INDEX idx_li_webhook_events_integration ON public.li_webhook_events(integration_id);
CREATE INDEX idx_li_webhook_events_received ON public.li_webhook_events(received_at DESC);

-- li_customers
CREATE TABLE public.li_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_customer_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  doc TEXT,
  address_json JSONB,
  raw_json JSONB,
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_customer_id)
);
ALTER TABLE public.li_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_customers_select" ON public.li_customers FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_customers_tenant ON public.li_customers(tenant_id);
CREATE INDEX idx_li_customers_integration ON public.li_customers(integration_id);
CREATE INDEX idx_li_customers_remote_id ON public.li_customers(loja_integrada_customer_id);
CREATE INDEX idx_li_customers_doc ON public.li_customers(doc);

ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_li_customer_id_fkey 
FOREIGN KEY (li_customer_id) REFERENCES public.li_customers(id) ON DELETE SET NULL;

-- li_products
CREATE TABLE public.li_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_product_id INTEGER NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  price NUMERIC,
  promotional_price NUMERIC,
  cost_price NUMERIC,
  stock INTEGER,
  stock_managed BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  variations_json JSONB,
  image_url TEXT,
  raw_json JSONB,
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_product_id)
);
ALTER TABLE public.li_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_products_select" ON public.li_products FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_products_tenant ON public.li_products(tenant_id);
CREATE INDEX idx_li_products_integration ON public.li_products(integration_id);
CREATE INDEX idx_li_products_remote_id ON public.li_products(loja_integrada_product_id);
CREATE INDEX idx_li_products_sku ON public.li_products(sku);

-- li_orders
CREATE TABLE public.li_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_order_id INTEGER NOT NULL,
  order_number TEXT NOT NULL,
  status_id INTEGER,
  status_name TEXT,
  customer_id UUID REFERENCES public.li_customers(id) ON DELETE SET NULL,
  totals_json JSONB,
  shipping_json JSONB,
  payment_json JSONB,
  items_json JSONB,
  created_at_remote TIMESTAMP WITH TIME ZONE,
  updated_at_remote TIMESTAMP WITH TIME ZONE,
  raw_json JSONB,
  updated_at_local TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(integration_id, loja_integrada_order_id)
);
ALTER TABLE public.li_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_orders_select" ON public.li_orders FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_orders_tenant ON public.li_orders(tenant_id);
CREATE INDEX idx_li_orders_integration ON public.li_orders(integration_id);
CREATE INDEX idx_li_orders_remote_id ON public.li_orders(loja_integrada_order_id);
CREATE INDEX idx_li_orders_number ON public.li_orders(order_number);
CREATE INDEX idx_li_orders_status ON public.li_orders(tenant_id, status_name);
CREATE INDEX idx_li_orders_created ON public.li_orders(created_at_remote DESC);

-- li_order_items
CREATE TABLE public.li_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.li_orders(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  loja_integrada_product_id INTEGER,
  sku TEXT,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price NUMERIC,
  raw_json JSONB
);
ALTER TABLE public.li_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "li_order_items_select" ON public.li_order_items FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE INDEX idx_li_order_items_order ON public.li_order_items(order_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_webhook_events;
-- Update cron status functions to reference the new reconciliation cron job
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
 RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'invoke-li-reconciliation-processor-every-3-min'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_cron_last_run()
 RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'invoke-li-reconciliation-processor-every-3-min'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$function$;
-- Fix RLS policies to include tenant owners (not just team_members)
-- Using the existing get_user_tenant_id function which handles both cases

DROP POLICY IF EXISTS "li_customers_select" ON public.li_customers;
CREATE POLICY "li_customers_select" ON public.li_customers
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "li_orders_select" ON public.li_orders;
CREATE POLICY "li_orders_select" ON public.li_orders
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "li_products_select" ON public.li_products;
CREATE POLICY "li_products_select" ON public.li_products
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "li_order_items_select" ON public.li_order_items;
CREATE POLICY "li_order_items_select" ON public.li_order_items
  FOR SELECT USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Add last_offset column to track pagination position
ALTER TABLE public.li_sync_state ADD COLUMN IF NOT EXISTS last_offset integer DEFAULT 0;

-- Reset orders sync state to start fresh with resumable pagination
UPDATE public.li_sync_state 
SET last_offset = 0, last_cursor = NULL, records_synced = 0
WHERE entity_type = 'orders';
-- Add last_status_check_at column for status rotation logic in li-job-processor
ALTER TABLE public.li_orders ADD COLUMN IF NOT EXISTS last_status_check_at TIMESTAMP WITH TIME ZONE;
-- Create cron job for li-job-processor (status rotation + notification triggers)
-- Runs every 5 minutes to check for order status changes and fire automations
SELECT cron.schedule(
  'invoke-li-job-processor-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/li-job-processor',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmd0bmFzdmVya2txa2JubXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjgyMzksImV4cCI6MjA5Mzc0NDIzOX0.spmW9Cn5TqQBIjLvWSD4yDOLNtYTXhhYC1PTO-1ck8U"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- =============================================================================
-- AUTOMAÇÃO DE ANIVERSARIANTES
-- =============================================================================

-- birthday_configs: Configurações de automação de aniversário
CREATE TABLE public.birthday_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Aniversariantes',
  is_active BOOLEAN NOT NULL DEFAULT false,

  -- Cupom
  coupon_discount_percent NUMERIC NOT NULL DEFAULT 10,
  coupon_duration_days INTEGER NOT NULL DEFAULT 30,

  -- Canais
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_enabled BOOLEAN DEFAULT false,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  email_subject TEXT DEFAULT 'Feliz Aniversário! 🎂',
  email_body TEXT,

  -- Template
  message_template TEXT NOT NULL DEFAULT 'Olá {nome}! 🎂🎉 Feliz aniversário! Para comemorar, preparamos um cupom especial de {desconto}% de desconto para você! Use o código *{cupom}* e aproveite. Válido por {validade} dias!',

  -- Tokens
  tokens_per_execution INTEGER NOT NULL DEFAULT 3,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.birthday_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant birthday configs"
  ON public.birthday_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant birthday configs"
  ON public.birthday_configs FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant birthday configs"
  ON public.birthday_configs FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant birthday configs"
  ON public.birthday_configs FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- birthday_executions: Log de execuções
CREATE TABLE public.birthday_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.birthday_configs(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_source TEXT, -- 'loja_integrada' or 'bling'
  coupon_code TEXT,
  action_type TEXT NOT NULL DEFAULT 'birthday_message', -- 'birthday_message'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped'
  error_message TEXT,
  tokens_used INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.birthday_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant birthday executions"
  ON public.birthday_executions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage birthday executions"
  ON public.birthday_executions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Índices
CREATE INDEX idx_birthday_configs_tenant_id ON public.birthday_configs(tenant_id);
CREATE INDEX idx_birthday_configs_integration_id ON public.birthday_configs(integration_id);
CREATE INDEX idx_birthday_executions_tenant_id ON public.birthday_executions(tenant_id);
CREATE INDEX idx_birthday_executions_created_at ON public.birthday_executions(created_at DESC);

-- Trigger updated_at
CREATE TRIGGER update_birthday_configs_updated_at
  BEFORE UPDATE ON public.birthday_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Fix overly permissive RLS on birthday_executions
-- Drop the permissive policy and add tenant-scoped ones
DROP POLICY "Service role can manage birthday executions" ON public.birthday_executions;

CREATE POLICY "Users can insert birthday executions for their tenant"
  ON public.birthday_executions FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update birthday executions for their tenant"
  ON public.birthday_executions FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- TABELAS DE DISPAROS EM MASSA (Bulk WhatsApp Campaigns)
-- =============================================================================

-- Campanhas de disparo em massa
CREATE TABLE public.bulk_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  
  -- WhatsApp config
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  
  -- Timing
  delay_seconds INTEGER NOT NULL DEFAULT 10,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Stats
  total_contacts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  
  -- Status: draft, scheduled, processing, paused, completed, cancelled
  status TEXT NOT NULL DEFAULT 'draft',
  
  -- Tokens
  tokens_per_message INTEGER NOT NULL DEFAULT 2,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Contatos da campanha
CREATE TABLE public.campaign_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.bulk_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  
  -- Variables for template (JSON with custom fields from Excel)
  variables JSONB DEFAULT '{}',
  
  -- Status: pending, sending, sent, delivered, read, failed
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  whatsapp_message_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bulk_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bulk_campaigns
CREATE POLICY "Users can view their tenant campaigns"
  ON public.bulk_campaigns FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create campaigns for their tenant"
  ON public.bulk_campaigns FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant campaigns"
  ON public.bulk_campaigns FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant campaigns"
  ON public.bulk_campaigns FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for campaign_contacts
CREATE POLICY "Users can view their tenant campaign contacts"
  ON public.campaign_contacts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create campaign contacts for their tenant"
  ON public.campaign_contacts FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant campaign contacts"
  ON public.campaign_contacts FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant campaign contacts"
  ON public.campaign_contacts FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Indexes
CREATE INDEX idx_bulk_campaigns_tenant_id ON public.bulk_campaigns(tenant_id);
CREATE INDEX idx_bulk_campaigns_status ON public.bulk_campaigns(status);
CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts(campaign_id);
CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts(status);
CREATE INDEX idx_campaign_contacts_tenant_id ON public.campaign_contacts(tenant_id);

-- Trigger for updated_at
CREATE TRIGGER update_bulk_campaigns_updated_at
  BEFORE UPDATE ON public.bulk_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add media columns to bulk_campaigns
ALTER TABLE public.bulk_campaigns
ADD COLUMN media_url TEXT,
ADD COLUMN media_type TEXT DEFAULT 'text';

-- Create storage bucket for campaign media
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-media', 'campaign-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to campaign-media
CREATE POLICY "Authenticated users can upload campaign media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campaign-media');

-- Allow authenticated users to read campaign media
CREATE POLICY "Anyone can read campaign media"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-media');

-- Allow authenticated users to delete their campaign media
CREATE POLICY "Authenticated users can delete campaign media"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'campaign-media');

ALTER TABLE public.bulk_campaigns
ADD COLUMN delay_max_seconds INTEGER DEFAULT 360;

ALTER TABLE public.bulk_campaigns
ADD COLUMN timezone TEXT DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.bulk_campaigns
ADD COLUMN sending_schedule JSONB DEFAULT NULL;

COMMENT ON COLUMN public.bulk_campaigns.sending_schedule IS 'JSON with day-of-week sending windows, e.g. {"1":{"start":"09:00","end":"18:00"},"2":{"start":"09:00","end":"18:00"}} where keys are 0=Sun..6=Sat';

-- =============================================================================
-- FASE 1: Módulo de Atendimentos - Schema Foundation
-- =============================================================================

-- 1. WHATSAPP_CHANNELS
CREATE TABLE public.whatsapp_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('evolution', 'meta')),
  display_name TEXT NOT NULL,
  phone_e164 TEXT,
  provider_account_id TEXT, -- instance name (Evolution) or phone_number_id (Meta)
  waba_id TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected')),
  webhook_secret TEXT,
  access_token TEXT,
  metadata_json JSONB DEFAULT '{}',
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their channels"
  ON public.whatsapp_channels FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage channels"
  ON public.whatsapp_channels FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE INDEX idx_whatsapp_channels_tenant ON public.whatsapp_channels(tenant_id);

-- 2. INBOXES
CREATE TABLE public.inboxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_id UUID NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  bot_enabled BOOLEAN NOT NULL DEFAULT false,
  sla_first_response_minutes INTEGER,
  sla_resolution_minutes INTEGER,
  business_hours_json JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their inboxes"
  ON public.inboxes FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage inboxes"
  ON public.inboxes FOR ALL
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE INDEX idx_inboxes_tenant ON public.inboxes(tenant_id);
CREATE INDEX idx_inboxes_channel ON public.inboxes(channel_id);

-- 3. ALTER CONVERSATIONS - add new columns
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS inbox_id UUID REFERENCES public.inboxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_state_json JSONB,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_conversations_inbox ON public.conversations(inbox_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON public.conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON public.conversations(priority);

-- 4. ALTER MESSAGES - add new columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound', 'internal_note', 'system')),
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS error_json JSONB,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'audio', 'video', 'file', 'interactive'));

CREATE INDEX IF NOT EXISTS idx_messages_provider_msg ON public.messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON public.messages(direction);

-- 5. WEBHOOK_EVENTS
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  channel_id UUID REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  provider_message_id TEXT,
  payload_json JSONB NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed')),
  error_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view webhook events"
  ON public.webhook_events FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE UNIQUE INDEX idx_webhook_events_idempotency
  ON public.webhook_events(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX idx_webhook_events_status ON public.webhook_events(processing_status);
CREATE INDEX idx_webhook_events_tenant ON public.webhook_events(tenant_id);

-- 6. OUTBOUND_QUEUE
CREATE TABLE public.outbound_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  channel_id UUID NOT NULL REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE,
  to_phone_e164 TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view outbound queue"
  ON public.outbound_queue FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_outbound_queue_pending ON public.outbound_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_outbound_queue_tenant ON public.outbound_queue(tenant_id);

-- 7. CONVERSATION_EVENTS
CREATE TABLE public.conversation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  payload_json JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view conversation events"
  ON public.conversation_events FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_conv_events_conversation ON public.conversation_events(conversation_id);
CREATE INDEX idx_conv_events_tenant ON public.conversation_events(tenant_id);

-- 8. TAGS
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view tags"
  ON public.tags FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage tags"
  ON public.tags FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_tags_tenant ON public.tags(tenant_id);

-- 9. CONVERSATION_TAGS
CREATE TABLE public.conversation_tags (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, tag_id)
);

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view conversation tags"
  ON public.conversation_tags FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Tenant members can manage conversation tags"
  ON public.conversation_tags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
    AND c.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

-- 10. CONTACT_BLOCKS
CREATE TABLE public.contact_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_e164)
);

ALTER TABLE public.contact_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view blocks"
  ON public.contact_blocks FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage blocks"
  ON public.contact_blocks FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX idx_contact_blocks_tenant ON public.contact_blocks(tenant_id);

-- 11. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.outbound_queue;

-- 12. Update triggers for updated_at
CREATE TRIGGER update_whatsapp_channels_updated_at
  BEFORE UPDATE ON public.whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inboxes_updated_at
  BEFORE UPDATE ON public.inboxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add ai_agent_id column to inboxes table
ALTER TABLE public.inboxes ADD COLUMN ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_inboxes_ai_agent_id ON public.inboxes(ai_agent_id);
ALTER TABLE public.inboxes ADD COLUMN integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;-- Add cron job to process outbound queue every 10 seconds (minimum is 1 minute for pg_cron)
SELECT cron.schedule(
  'process-outbound-queue-every-1-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/process-outbound-queue',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzcmd0bmFzdmVya2txa2JubXpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjgyMzksImV4cCI6MjA5Mzc0NDIzOX0.spmW9Cn5TqQBIjLvWSD4yDOLNtYTXhhYC1PTO-1ck8U", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);-- Add agent_type column to distinguish chatbot (structured flow) from ai_agent (generative AI)
ALTER TABLE public.ai_agents 
ADD COLUMN IF NOT EXISTS agent_type TEXT NOT NULL DEFAULT 'chatbot';

-- Update any existing records that look like AI agents (have system_prompt but no interactive_buttons)
-- to be classified correctly. Since we can't reliably auto-detect, keep all as 'chatbot' by default
-- and let users create new ai_agents from scratch.

-- Add an index for faster filtering
CREATE INDEX IF NOT EXISTS idx_ai_agents_agent_type ON public.ai_agents (tenant_id, agent_type);

-- Add comment for clarity
COMMENT ON COLUMN public.ai_agents.agent_type IS 'chatbot = structured flow with menus/buttons; ai_agent = generative AI with system prompt training';
-- Create customer_rfm_snapshots table
CREATE TABLE public.customer_rfm_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_doc TEXT,
  last_order_date TIMESTAMPTZ,
  recency_days INTEGER,
  orders_count INTEGER,
  revenue_total NUMERIC DEFAULT 0,
  aov NUMERIC DEFAULT 0,
  avg_order_interval_days NUMERIC,
  r_score INTEGER,
  f_score INTEGER,
  m_score INTEGER,
  rfm_score TEXT,
  segment_name TEXT,
  segment_action TEXT,
  churn_risk TEXT DEFAULT 'saudavel',
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index per integration/customer/date
CREATE UNIQUE INDEX idx_rfm_integration_customer_date 
ON public.customer_rfm_snapshots(integration_id, customer_id, reference_date);

-- Index for tenant queries
CREATE INDEX idx_rfm_tenant ON public.customer_rfm_snapshots(tenant_id);
CREATE INDEX idx_rfm_segment ON public.customer_rfm_snapshots(integration_id, segment_name);

-- Enable RLS
ALTER TABLE public.customer_rfm_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own tenant RFM data"
ON public.customer_rfm_snapshots FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert own tenant RFM data"
ON public.customer_rfm_snapshots FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update own tenant RFM data"
ON public.customer_rfm_snapshots FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete own tenant RFM data"
ON public.customer_rfm_snapshots FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_rfm_snapshots_updated_at
BEFORE UPDATE ON public.customer_rfm_snapshots
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create RFM alerts table
CREATE TABLE public.rfm_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'champions_drop', 'high_value_at_risk', 'repurchase_drop', 'segment_migration'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  reference_date TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rfm_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant rfm_alerts"
  ON public.rfm_alerts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant rfm_alerts"
  ON public.rfm_alerts FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage rfm_alerts"
  ON public.rfm_alerts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_rfm_alerts_tenant_read ON public.rfm_alerts(tenant_id, is_read, created_at DESC);

-- Drop the overly permissive service role policy and replace with specific ones
DROP POLICY "Service role can manage rfm_alerts" ON public.rfm_alerts;

-- Insert policy for service role (edge functions use service_role key which bypasses RLS)
-- So we only need user-facing policies which are already created
-- Service role bypasses RLS by default, no extra policy needed

-- Table for saved RFM audience rules
CREATE TABLE public.rfm_audiences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '{}',
  member_count INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_calculated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rfm_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant rfm_audiences"
  ON public.rfm_audiences FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert their tenant rfm_audiences"
  ON public.rfm_audiences FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant rfm_audiences"
  ON public.rfm_audiences FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete their tenant rfm_audiences"
  ON public.rfm_audiences FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Table for audience members (linked to latest snapshot)
CREATE TABLE public.rfm_audience_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audience_id UUID NOT NULL REFERENCES public.rfm_audiences(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rfm_audience_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant rfm_audience_members"
  ON public.rfm_audience_members FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can manage their tenant rfm_audience_members"
  ON public.rfm_audience_members FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Indexes
CREATE INDEX idx_rfm_audiences_tenant ON public.rfm_audiences(tenant_id, integration_id);
CREATE INDEX idx_rfm_audience_members_audience ON public.rfm_audience_members(audience_id);

-- Trigger for updated_at
CREATE TRIGGER update_rfm_audiences_updated_at
  BEFORE UPDATE ON public.rfm_audiences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table for category-level RFM snapshots
CREATE TABLE public.customer_rfm_category_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_name TEXT,
  category_name TEXT NOT NULL,
  last_order_date TIMESTAMPTZ,
  recency_days INTEGER,
  orders_count INTEGER,
  revenue_total NUMERIC(12,2),
  aov NUMERIC(12,2),
  r_score INTEGER,
  f_score INTEGER,
  m_score INTEGER,
  rfm_score TEXT,
  segment_name TEXT,
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_crfm_cat_integration_date ON public.customer_rfm_category_snapshots(integration_id, reference_date);
CREATE INDEX idx_crfm_cat_category ON public.customer_rfm_category_snapshots(category_name);
CREATE INDEX idx_crfm_cat_tenant ON public.customer_rfm_category_snapshots(tenant_id);
CREATE INDEX idx_crfm_cat_segment ON public.customer_rfm_category_snapshots(segment_name);

-- RLS
ALTER TABLE public.customer_rfm_category_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view category RFM snapshots"
  ON public.customer_rfm_category_snapshots FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert category RFM snapshots"
  ON public.customer_rfm_category_snapshots FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can delete category RFM snapshots"
  ON public.customer_rfm_category_snapshots FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role policy for edge functions
CREATE POLICY "Service role full access to category RFM"
  ON public.customer_rfm_category_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_crfm_category_updated_at
  BEFORE UPDATE ON public.customer_rfm_category_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Drop the overly permissive policy
DROP POLICY "Service role full access to category RFM" ON public.customer_rfm_category_snapshots;

-- Add predictive columns to customer_rfm_snapshots
ALTER TABLE public.customer_rfm_snapshots
  ADD COLUMN IF NOT EXISTS predicted_next_purchase_date DATE,
  ADD COLUMN IF NOT EXISTS purchase_probability_7d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS purchase_probability_15d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS purchase_probability_30d NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS ideal_offer_window_start INTEGER,
  ADD COLUMN IF NOT EXISTS ideal_offer_window_end INTEGER;

-- Index for predicted date queries
CREATE INDEX IF NOT EXISTS idx_rfm_predicted_date ON public.customer_rfm_snapshots(predicted_next_purchase_date) WHERE predicted_next_purchase_date IS NOT NULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_rfm_snapshots;
-- RPC: Dashboard stats aggregated server-side (bypasses 1000 row limit)
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  _start_this_month timestamptz := date_trunc('month', now());
  _start_last_month timestamptz := date_trunc('month', now() - interval '1 month');
  _end_last_month timestamptz := date_trunc('month', now());
  _30d_ago timestamptz := now() - interval '30 days';
  _7d_ago timestamptz := now() - interval '7 days';
  
  -- Revenue vars
  _li_revenue_this_month numeric := 0;
  _li_orders_this_month bigint := 0;
  _li_revenue_last_month numeric := 0;
  _li_orders_last_month bigint := 0;
  _bling_revenue_this_month numeric := 0;
  _bling_orders_this_month bigint := 0;
  _bling_revenue_last_month numeric := 0;
  _avg_ticket numeric := 0;
  _total_revenue_this_month numeric := 0;
  _total_orders_this_month bigint := 0;
  _revenue_change numeric := 0;
  
  -- Messages
  _msgs_sent bigint := 0;
  _msgs_received bigint := 0;
  
  -- RFM summary
  _rfm_summary jsonb := '[]'::jsonb;
  
  -- Sales by day
  _sales_by_day jsonb := '[]'::jsonb;
BEGIN
  -- LI Revenue this month (ONLY effective statuses)
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0), COUNT(*)
  INTO _li_revenue_this_month, _li_orders_this_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name IN ('Pedido Entregue', 'Pedido Enviado')
    AND created_at_remote >= _start_this_month;

  -- LI Revenue last month
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0)
  INTO _li_revenue_last_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name IN ('Pedido Entregue', 'Pedido Enviado')
    AND created_at_remote >= _start_last_month
    AND created_at_remote < _end_last_month;

  -- Bling Revenue this month
  SELECT COALESCE(SUM(valor_total), 0), COUNT(*)
  INTO _bling_revenue_this_month, _bling_orders_this_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_this_month;

  -- Bling Revenue last month
  SELECT COALESCE(SUM(valor_total), 0)
  INTO _bling_revenue_last_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_last_month
    AND data_criacao < _end_last_month;

  _total_revenue_this_month := _li_revenue_this_month + _bling_revenue_this_month;
  _total_orders_this_month := _li_orders_this_month + _bling_orders_this_month;
  
  IF _total_orders_this_month > 0 THEN
    _avg_ticket := _total_revenue_this_month / _total_orders_this_month;
  END IF;

  DECLARE
    _total_last numeric := _li_revenue_last_month + _bling_revenue_last_month;
  BEGIN
    IF _total_last > 0 THEN
      _revenue_change := ROUND(((_total_revenue_this_month - _total_last) / _total_last) * 100);
    END IF;
  END;

  -- Messages last 30 days
  SELECT 
    COUNT(*) FILTER (WHERE direction = 'outgoing'),
    COUNT(*) FILTER (WHERE direction = 'incoming')
  INTO _msgs_sent, _msgs_received
  FROM messages
  WHERE tenant_id = _tenant_id
    AND created_at >= _30d_ago;

  -- RFM Summary (latest snapshot)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO _rfm_summary
  FROM (
    SELECT segment_name, COUNT(*) as count
    FROM customer_rfm_snapshots
    WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      AND reference_date = (
        SELECT MAX(reference_date) FROM customer_rfm_snapshots 
        WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      )
    GROUP BY segment_name
    ORDER BY count DESC
  ) r;

  -- Sales by day (last 30 days) - aggregated in DB
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.date), '[]'::jsonb)
  INTO _sales_by_day
  FROM (
    SELECT d::date as date, 
      COALESCE(li.revenue, 0) + COALESCE(bl.revenue, 0) as total,
      COALESCE(li.cnt, 0) + COALESCE(bl.cnt, 0) as count
    FROM generate_series(_30d_ago::date, now()::date, '1 day') d
    LEFT JOIN (
      SELECT created_at_remote::date as day, 
        SUM((totals_json->>'total')::numeric) as revenue,
        COUNT(*) as cnt
      FROM li_orders
      WHERE tenant_id = _tenant_id
        AND status_name IN ('Pedido Entregue', 'Pedido Enviado')
        AND created_at_remote >= _30d_ago
      GROUP BY day
    ) li ON li.day = d::date
    LEFT JOIN (
      SELECT data_criacao::date as day,
        SUM(valor_total) as revenue,
        COUNT(*) as cnt
      FROM bling_orders
      WHERE tenant_id = _tenant_id
        AND data_criacao >= _30d_ago
      GROUP BY day
    ) bl ON bl.day = d::date
  ) r;

  -- Top products (aggregated, no row limit)
  DECLARE
    _top_products jsonb := '[]'::jsonb;
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        -- Bling items
        SELECT produto_nome as name, COALESCE(quantidade, 0) as quantity, COALESCE(valor_total, 0) as revenue
        FROM bling_order_items WHERE tenant_id = _tenant_id
        UNION ALL
        -- LI items from effective orders only
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND o.status_name IN ('Pedido Entregue', 'Pedido Enviado')
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    result := jsonb_build_object(
      'total_revenue_this_month', _total_revenue_this_month,
      'total_orders_this_month', _total_orders_this_month,
      'revenue_change', _revenue_change,
      'avg_ticket', ROUND(_avg_ticket, 2),
      'msgs_sent_30d', _msgs_sent,
      'msgs_received_30d', _msgs_received,
      'rfm_summary', _rfm_summary,
      'sales_by_day', _sales_by_day,
      'top_products', _top_products
    );
  END;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  _start_this_month timestamptz := date_trunc('month', now());
  _start_last_month timestamptz := date_trunc('month', now() - interval '1 month');
  _end_last_month timestamptz := date_trunc('month', now());
  _30d_ago timestamptz := now() - interval '30 days';
  
  -- Revenue vars
  _li_revenue_this_month numeric := 0;
  _li_orders_this_month bigint := 0;
  _li_revenue_last_month numeric := 0;
  _bling_revenue_this_month numeric := 0;
  _bling_orders_this_month bigint := 0;
  _bling_revenue_last_month numeric := 0;
  _avg_ticket numeric := 0;
  _total_revenue_this_month numeric := 0;
  _total_orders_this_month bigint := 0;
  _revenue_change numeric := 0;
  
  -- Messages
  _msgs_sent bigint := 0;
  _msgs_received bigint := 0;
  
  -- RFM summary
  _rfm_summary jsonb := '[]'::jsonb;
  
  -- Sales by day
  _sales_by_day jsonb := '[]'::jsonb;
  
  -- Effective LI statuses array
  _effective_statuses text[] := ARRAY['Pedido Entregue', 'Pedido Enviado', 'Pedido Pago'];
BEGIN
  -- LI Revenue this month (effective statuses including Pedido Pago)
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0), COUNT(*)
  INTO _li_revenue_this_month, _li_orders_this_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name = ANY(_effective_statuses)
    AND created_at_remote >= _start_this_month;

  -- LI Revenue last month
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0)
  INTO _li_revenue_last_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name = ANY(_effective_statuses)
    AND created_at_remote >= _start_last_month
    AND created_at_remote < _end_last_month;

  -- Bling Revenue this month
  SELECT COALESCE(SUM(valor_total), 0), COUNT(*)
  INTO _bling_revenue_this_month, _bling_orders_this_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_this_month;

  -- Bling Revenue last month
  SELECT COALESCE(SUM(valor_total), 0)
  INTO _bling_revenue_last_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_last_month
    AND data_criacao < _end_last_month;

  _total_revenue_this_month := _li_revenue_this_month + _bling_revenue_this_month;
  _total_orders_this_month := _li_orders_this_month + _bling_orders_this_month;
  
  IF _total_orders_this_month > 0 THEN
    _avg_ticket := _total_revenue_this_month / _total_orders_this_month;
  END IF;

  DECLARE
    _total_last numeric := _li_revenue_last_month + _bling_revenue_last_month;
  BEGIN
    IF _total_last > 0 THEN
      _revenue_change := ROUND(((_total_revenue_this_month - _total_last) / _total_last) * 100);
    END IF;
  END;

  -- Messages last 30 days
  SELECT 
    COUNT(*) FILTER (WHERE direction = 'outgoing'),
    COUNT(*) FILTER (WHERE direction = 'incoming')
  INTO _msgs_sent, _msgs_received
  FROM messages
  WHERE tenant_id = _tenant_id
    AND created_at >= _30d_ago;

  -- RFM Summary (latest snapshot)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO _rfm_summary
  FROM (
    SELECT segment_name, COUNT(*) as count
    FROM customer_rfm_snapshots
    WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      AND reference_date = (
        SELECT MAX(reference_date) FROM customer_rfm_snapshots 
        WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      )
    GROUP BY segment_name
    ORDER BY count DESC
  ) r;

  -- Sales by day (last 30 days) - combined LI + Bling
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.date), '[]'::jsonb)
  INTO _sales_by_day
  FROM (
    SELECT d::date as date, 
      COALESCE(li.revenue, 0) + COALESCE(bl.revenue, 0) as total,
      COALESCE(li.cnt, 0) + COALESCE(bl.cnt, 0) as count
    FROM generate_series(_30d_ago::date, now()::date, '1 day') d
    LEFT JOIN (
      SELECT created_at_remote::date as day, 
        SUM((totals_json->>'total')::numeric) as revenue,
        COUNT(*) as cnt
      FROM li_orders
      WHERE tenant_id = _tenant_id
        AND status_name = ANY(_effective_statuses)
        AND created_at_remote >= _30d_ago
      GROUP BY day
    ) li ON li.day = d::date
    LEFT JOIN (
      SELECT data_criacao::date as day,
        SUM(valor_total) as revenue,
        COUNT(*) as cnt
      FROM bling_orders
      WHERE tenant_id = _tenant_id
        AND data_criacao >= _30d_ago
      GROUP BY day
    ) bl ON bl.day = d::date
  ) r;

  -- Top products (this month only, from effective orders)
  DECLARE
    _top_products jsonb := '[]'::jsonb;
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        -- Bling items from this month
        SELECT boi.produto_nome as name, COALESCE(boi.quantidade, 0) as quantity, COALESCE(boi.valor_total, 0) as revenue
        FROM bling_order_items boi
        JOIN bling_orders bo ON bo.id = boi.order_id
        WHERE boi.tenant_id = _tenant_id
          AND bo.data_criacao >= _start_this_month
        UNION ALL
        -- LI items from effective orders this month
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND o.status_name = ANY(_effective_statuses)
          AND o.created_at_remote >= _start_this_month
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    result := jsonb_build_object(
      'total_revenue_this_month', _total_revenue_this_month,
      'total_orders_this_month', _total_orders_this_month,
      'revenue_change', _revenue_change,
      'avg_ticket', ROUND(_avg_ticket, 2),
      'msgs_sent_30d', _msgs_sent,
      'msgs_received_30d', _msgs_received,
      'rfm_summary', _rfm_summary,
      'sales_by_day', _sales_by_day,
      'top_products', _top_products
    );
  END;

  RETURN result;
END;
$function$;

-- Fix 1: Remove overly permissive SELECT policy on melhor_envio_tokens
-- The admin-only ALL policy already covers admin access
DROP POLICY IF EXISTS "Tenant members can view melhor_envio_tokens" ON public.melhor_envio_tokens;

-- Fix 2: Secure campaign-media storage bucket with tenant isolation

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'campaign-media';

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can read campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload campaign media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete campaign media" ON storage.objects;

-- Create tenant-isolated policies
CREATE POLICY "Users can read their tenant campaign media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = (SELECT get_user_tenant_id(auth.uid())::text)
);

CREATE POLICY "Users can upload to their tenant campaign media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = (SELECT get_user_tenant_id(auth.uid())::text)
);

CREATE POLICY "Users can delete their tenant campaign media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'campaign-media'
  AND (storage.foldername(name))[1] = (SELECT get_user_tenant_id(auth.uid())::text)
);
-- Fix: Replace overly permissive INSERT policy on bling_webhook_events
-- Webhook events are inserted by edge functions using service_role (which bypasses RLS),
-- so the public INSERT policy with WITH CHECK (true) is unnecessary and a security risk.
DROP POLICY IF EXISTS "Allow insert bling_webhook_events" ON public.bling_webhook_events;ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS owner_name TEXT;-- Add cursor_data column to me_sync_jobs for date-windowing pagination
ALTER TABLE public.me_sync_jobs 
ADD COLUMN IF NOT EXISTS cursor_data jsonb DEFAULT '{}'::jsonb;
-- Add store_integration_id to integrations table (links ME integration to a store)
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS store_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.integrations.store_integration_id IS 'Para integrações de envio (melhor_envio): qual loja está vinculada';

CREATE INDEX IF NOT EXISTS idx_integrations_store_integration_id ON public.integrations(store_integration_id);

-- Add bling_order_id to me_shipments for linking to Bling orders
ALTER TABLE public.me_shipments 
ADD COLUMN IF NOT EXISTS bling_order_id UUID REFERENCES public.bling_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_me_shipments_bling_order_id ON public.me_shipments(bling_order_id);
ALTER TABLE public.integrations ADD COLUMN IF NOT EXISTS store_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION public.link_me_shipments_to_orders(
  p_me_integration_id UUID,
  p_store_integration_id UUID,
  p_store_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked INTEGER := 0;
  v_total INTEGER := 0;
  v_already_linked INTEGER := 0;
BEGIN
  -- Count total
  SELECT COUNT(*) INTO v_total FROM me_shipments WHERE integration_id = p_me_integration_id;

  IF p_store_type = 'loja_integrada' THEN
    -- Count already linked
    SELECT COUNT(*) INTO v_already_linked FROM me_shipments 
    WHERE integration_id = p_me_integration_id AND li_order_id IS NOT NULL;

    -- Batch update
    WITH matched AS (
      UPDATE me_shipments ms
      SET li_order_id = lo.id
      FROM li_orders lo
      WHERE lo.integration_id = p_store_integration_id
        AND lo.order_number = ms.external_order_number
        AND ms.integration_id = p_me_integration_id
        AND ms.li_order_id IS NULL
        AND ms.external_order_number IS NOT NULL
      RETURNING ms.id
    )
    SELECT COUNT(*) INTO v_linked FROM matched;

  ELSIF p_store_type = 'bling' THEN
    SELECT COUNT(*) INTO v_already_linked FROM me_shipments 
    WHERE integration_id = p_me_integration_id AND bling_order_id IS NOT NULL;

    WITH matched AS (
      UPDATE me_shipments ms
      SET bling_order_id = bo.id
      FROM bling_orders bo
      WHERE bo.integration_id = p_store_integration_id
        AND bo.numero = ms.external_order_number
        AND ms.integration_id = p_me_integration_id
        AND ms.bling_order_id IS NULL
        AND ms.external_order_number IS NOT NULL
      RETURNING ms.id
    )
    SELECT COUNT(*) INTO v_linked FROM matched;
  END IF;

  RETURN json_build_object(
    'linked_now', v_linked,
    'already_linked', v_already_linked,
    'total', v_total
  );
END;
$$;
SELECT cron.schedule(
  'bulk-li-status-update-cron',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/bulk-status-update-li',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
    ),
    body := '{"me_integration_id":"fda0a34d-a04d-4d62-9811-818654b7237d","store_integration_id":"b5f095dd-175a-48ed-b550-eb9559a12182","target_status":"delivered","limit":9}'::jsonb
  );
  $$
);ALTER PUBLICATION supabase_realtime ADD TABLE public.li_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
-- Set all auto_sync columns to default true
ALTER TABLE public.integrations
  ALTER COLUMN auto_sync_enabled SET DEFAULT true,
  ALTER COLUMN auto_sync_orders SET DEFAULT true,
  ALTER COLUMN auto_sync_customers SET DEFAULT true,
  ALTER COLUMN auto_sync_products SET DEFAULT true,
  ALTER COLUMN auto_sync_carts SET DEFAULT true,
  ALTER COLUMN auto_sync_coupons SET DEFAULT true,
  ALTER COLUMN auto_sync_shipments SET DEFAULT true;

-- Activate all existing integrations
UPDATE public.integrations SET
  auto_sync_enabled = true,
  auto_sync_orders = true,
  auto_sync_customers = true,
  auto_sync_products = true,
  auto_sync_carts = true,
  auto_sync_coupons = true,
  auto_sync_shipments = true
WHERE auto_sync_enabled IS NOT TRUE
   OR auto_sync_orders IS NOT TRUE
   OR auto_sync_customers IS NOT TRUE
   OR auto_sync_products IS NOT TRUE
   OR auto_sync_carts IS NOT TRUE
   OR auto_sync_coupons IS NOT TRUE
   OR auto_sync_shipments IS NOT TRUE;

-- Activate all ME auto-sync configs
UPDATE public.me_auto_sync_configs SET is_active = true WHERE is_active = false;

-- Drop abandoned cart tables (feature was removed)
DROP TABLE IF EXISTS public.abandoned_cart_executions CASCADE;
DROP TABLE IF EXISTS public.abandoned_carts CASCADE;
DROP TABLE IF EXISTS public.abandoned_cart_configs CASCADE;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS ai_provider TEXT;ALTER TABLE public.tenant_ai_credentials ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Ensure only one default per tenant via a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_ai_credentials_one_default 
ON public.tenant_ai_credentials (tenant_id) WHERE is_default = true;-- Fix handle_new_user trigger to skip tenant creation for team members
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, company_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'company_name');
  
  -- Only create tenant if NOT a team member
  IF (NEW.raw_user_meta_data ->> 'is_team_member')::boolean IS NOT TRUE THEN
    IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
      INSERT INTO public.tenants (owner_id, name)
      VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Minha Empresa'));
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Clean up spurious tenants created for team members
DELETE FROM public.tenants t
WHERE EXISTS (
  SELECT 1 FROM public.team_members tm
  WHERE tm.user_id = t.owner_id
  AND tm.tenant_id != t.id
);
-- Fix: Allow all tenant members (not just admins) to manage conversations
DROP POLICY IF EXISTS "Tenant admins can manage conversations" ON conversations;
CREATE POLICY "Tenant members can manage conversations"
  ON conversations FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Fix: Allow all tenant members to manage messages (send, insert system messages)
DROP POLICY IF EXISTS "Tenant admins can manage messages" ON messages;
CREATE POLICY "Tenant members can manage messages"
  ON messages FOR ALL
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

-- Fix: Allow all tenant members to insert conversation events
DROP POLICY IF EXISTS "Tenant members can view conversation events" ON conversation_events;
CREATE POLICY "Tenant members can manage conversation events"
  ON conversation_events FOR ALL
  USING (tenant_id = get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
UPDATE me_sync_jobs SET status = 'failed', error_message = 'Cleaned up stuck job', completed_at = now() WHERE status = 'running' AND created_at < now() - interval '1 hour';
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  _start_this_month timestamptz := date_trunc('month', now());
  _start_last_month timestamptz := date_trunc('month', now() - interval '1 month');
  _end_last_month timestamptz := date_trunc('month', now());
  _30d_ago timestamptz := now() - interval '30 days';
  
  -- Revenue vars
  _li_revenue_this_month numeric := 0;
  _li_orders_this_month bigint := 0;
  _li_revenue_last_month numeric := 0;
  _bling_revenue_this_month numeric := 0;
  _bling_orders_this_month bigint := 0;
  _bling_revenue_last_month numeric := 0;
  _avg_ticket numeric := 0;
  _total_revenue_this_month numeric := 0;
  _total_orders_this_month bigint := 0;
  _revenue_change numeric := 0;
  
  -- Messages
  _msgs_sent bigint := 0;
  _msgs_received bigint := 0;
  
  -- RFM summary
  _rfm_summary jsonb := '[]'::jsonb;
  
  -- Sales by day
  _sales_by_day jsonb := '[]'::jsonb;
  
  -- Delivered counts
  _me_delivered_this_month bigint := 0;
  _me_delivered_30d bigint := 0;
  
  -- Effective LI statuses array
  _effective_statuses text[] := ARRAY['Pedido Entregue', 'Pedido Enviado', 'Pedido Pago'];
BEGIN
  -- LI Revenue this month (effective statuses including Pedido Pago)
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0), COUNT(*)
  INTO _li_revenue_this_month, _li_orders_this_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name = ANY(_effective_statuses)
    AND created_at_remote >= _start_this_month;

  -- LI Revenue last month
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0)
  INTO _li_revenue_last_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name = ANY(_effective_statuses)
    AND created_at_remote >= _start_last_month
    AND created_at_remote < _end_last_month;

  -- Bling Revenue this month
  SELECT COALESCE(SUM(valor_total), 0), COUNT(*)
  INTO _bling_revenue_this_month, _bling_orders_this_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_this_month;

  -- Bling Revenue last month
  SELECT COALESCE(SUM(valor_total), 0)
  INTO _bling_revenue_last_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_last_month
    AND data_criacao < _end_last_month;

  _total_revenue_this_month := _li_revenue_this_month + _bling_revenue_this_month;
  _total_orders_this_month := _li_orders_this_month + _bling_orders_this_month;
  
  IF _total_orders_this_month > 0 THEN
    _avg_ticket := _total_revenue_this_month / _total_orders_this_month;
  END IF;

  DECLARE
    _total_last numeric := _li_revenue_last_month + _bling_revenue_last_month;
  BEGIN
    IF _total_last > 0 THEN
      _revenue_change := ROUND(((_total_revenue_this_month - _total_last) / _total_last) * 100);
    END IF;
  END;

  -- Messages last 30 days
  SELECT 
    COUNT(*) FILTER (WHERE direction = 'outgoing'),
    COUNT(*) FILTER (WHERE direction = 'incoming')
  INTO _msgs_sent, _msgs_received
  FROM messages
  WHERE tenant_id = _tenant_id
    AND created_at >= _30d_ago;

  -- RFM Summary (latest snapshot)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO _rfm_summary
  FROM (
    SELECT segment_name, COUNT(*) as count
    FROM customer_rfm_snapshots
    WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      AND reference_date = (
        SELECT MAX(reference_date) FROM customer_rfm_snapshots 
        WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      )
    GROUP BY segment_name
    ORDER BY count DESC
  ) r;

  -- Sales by day (last 30 days) - combined LI + Bling
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.date), '[]'::jsonb)
  INTO _sales_by_day
  FROM (
    SELECT d::date as date, 
      COALESCE(li.revenue, 0) + COALESCE(bl.revenue, 0) as total,
      COALESCE(li.cnt, 0) + COALESCE(bl.cnt, 0) as count
    FROM generate_series(_30d_ago::date, now()::date, '1 day') d
    LEFT JOIN (
      SELECT created_at_remote::date as day, 
        SUM((totals_json->>'total')::numeric) as revenue,
        COUNT(*) as cnt
      FROM li_orders
      WHERE tenant_id = _tenant_id
        AND status_name = ANY(_effective_statuses)
        AND created_at_remote >= _30d_ago
      GROUP BY day
    ) li ON li.day = d::date
    LEFT JOIN (
      SELECT data_criacao::date as day,
        SUM(valor_total) as revenue,
        COUNT(*) as cnt
      FROM bling_orders
      WHERE tenant_id = _tenant_id
        AND data_criacao >= _30d_ago
      GROUP BY day
    ) bl ON bl.day = d::date
  ) r;

  -- ME delivered counts
  SELECT COUNT(*) INTO _me_delivered_this_month
  FROM me_shipments
  WHERE tenant_id = _tenant_id AND status = 'delivered' AND delivered_at >= _start_this_month;
  
  SELECT COUNT(*) INTO _me_delivered_30d
  FROM me_shipments
  WHERE tenant_id = _tenant_id AND status = 'delivered' AND delivered_at >= _30d_ago;

  -- Top products (this month, with 30d fallback)
  DECLARE
    _top_products jsonb := '[]'::jsonb;
    _top_products_30d jsonb := '[]'::jsonb;
  BEGIN
    -- This month
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        SELECT boi.produto_nome as name, COALESCE(boi.quantidade, 0) as quantity, COALESCE(boi.valor_total, 0) as revenue
        FROM bling_order_items boi
        JOIN bling_orders bo ON bo.id = boi.order_id
        WHERE boi.tenant_id = _tenant_id
          AND bo.data_criacao >= _start_this_month
        UNION ALL
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND o.status_name = ANY(_effective_statuses)
          AND o.created_at_remote >= _start_this_month
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    -- Last 30 days (fallback)
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products_30d
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        SELECT boi.produto_nome as name, COALESCE(boi.quantidade, 0) as quantity, COALESCE(boi.valor_total, 0) as revenue
        FROM bling_order_items boi
        JOIN bling_orders bo ON bo.id = boi.order_id
        WHERE boi.tenant_id = _tenant_id
          AND bo.data_criacao >= _30d_ago
        UNION ALL
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND o.status_name = ANY(_effective_statuses)
          AND o.created_at_remote >= _30d_ago
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    result := jsonb_build_object(
      'total_revenue_this_month', _total_revenue_this_month,
      'total_orders_this_month', _total_orders_this_month,
      'revenue_change', _revenue_change,
      'avg_ticket', ROUND(_avg_ticket, 2),
      'msgs_sent_30d', _msgs_sent,
      'msgs_received_30d', _msgs_received,
      'rfm_summary', _rfm_summary,
      'sales_by_day', _sales_by_day,
      'top_products', _top_products,
      'top_products_30d', _top_products_30d,
      'me_delivered_this_month', _me_delivered_this_month,
      'me_delivered_30d', _me_delivered_30d
    );
  END;

  RETURN result;
END;
$function$

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
-- =============================================================================
-- INSTAGRAM MODULE - PHASE 1: OPERATIONAL BASE
-- =============================================================================

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- ENUM: instagram channel status
-- =============================================================================
CREATE TYPE public.instagram_channel_status AS ENUM (
  'connected', 'expiring', 'expired', 'error', 'disconnected'
);

CREATE TYPE public.instagram_thread_status AS ENUM (
  'open', 'pending', 'bot_active', 'human_active', 'paused', 'closed', 'spam', 'blocked'
);

CREATE TYPE public.instagram_message_direction AS ENUM ('incoming', 'outgoing');

CREATE TYPE public.instagram_delivery_status AS ENUM (
  'pending', 'sent', 'delivered', 'read', 'failed'
);

CREATE TYPE public.instagram_outbox_status AS ENUM (
  'queued', 'processing', 'sent', 'failed', 'dead_letter'
);

-- =============================================================================
-- TABLE: instagram_channels
-- =============================================================================
CREATE TABLE public.instagram_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ig_user_id TEXT NOT NULL,
  instagram_username TEXT,
  access_token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  token_refresh_at TIMESTAMPTZ,
  status public.instagram_channel_status NOT NULL DEFAULT 'disconnected',
  webhook_verified BOOLEAN NOT NULL DEFAULT false,
  app_mode TEXT NOT NULL DEFAULT 'development',
  default_locale TEXT DEFAULT 'pt_BR',
  default_timezone TEXT DEFAULT 'America/Sao_Paulo',
  last_sync_at TIMESTAMPTZ,
  last_healthcheck_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_channels ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_channels_tenant ON public.instagram_channels(tenant_id);
CREATE UNIQUE INDEX idx_ig_channels_ig_user ON public.instagram_channels(ig_user_id);

CREATE TRIGGER update_instagram_channels_updated_at
  BEFORE UPDATE ON public.instagram_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
CREATE POLICY "Tenant members can view instagram channels"
  ON public.instagram_channels FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage instagram channels"
  ON public.instagram_channels FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id));

-- =============================================================================
-- TABLE: instagram_channel_capabilities
-- =============================================================================
CREATE TABLE public.instagram_channel_capabilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  comments BOOLEAN NOT NULL DEFAULT false,
  private_replies BOOLEAN NOT NULL DEFAULT false,
  story_reply BOOLEAN NOT NULL DEFAULT false,
  story_mention BOOLEAN NOT NULL DEFAULT false,
  live_comments BOOLEAN NOT NULL DEFAULT false,
  welcome_ads BOOLEAN NOT NULL DEFAULT false,
  ice_breakers BOOLEAN NOT NULL DEFAULT false,
  persistent_menu BOOLEAN NOT NULL DEFAULT false,
  follow_to_dm BOOLEAN NOT NULL DEFAULT false,
  share_to_dm BOOLEAN NOT NULL DEFAULT false,
  content_publish BOOLEAN NOT NULL DEFAULT false,
  insights BOOLEAN NOT NULL DEFAULT false,
  moderation BOOLEAN NOT NULL DEFAULT false,
  raw_capabilities JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_channel_capabilities ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_ig_capabilities_channel ON public.instagram_channel_capabilities(channel_id);
CREATE INDEX idx_ig_capabilities_tenant ON public.instagram_channel_capabilities(tenant_id);

CREATE TRIGGER update_instagram_channel_capabilities_updated_at
  BEFORE UPDATE ON public.instagram_channel_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram capabilities"
  ON public.instagram_channel_capabilities FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant admins can manage instagram capabilities"
  ON public.instagram_channel_capabilities FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.is_tenant_admin(auth.uid(), tenant_id));

-- =============================================================================
-- TABLE: instagram_contacts
-- =============================================================================
CREATE TABLE public.instagram_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  igsid TEXT NOT NULL,
  instagram_username TEXT,
  display_name TEXT,
  profile_pic_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_user_interaction_at TIMESTAMPTZ,
  standard_window_expires_at TIMESTAMPTZ,
  human_window_expires_at TIMESTAMPTZ,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  source_first_entry TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_contacts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_ig_contacts_channel_igsid ON public.instagram_contacts(channel_id, igsid);
CREATE INDEX idx_ig_contacts_tenant ON public.instagram_contacts(tenant_id);
CREATE INDEX idx_ig_contacts_channel ON public.instagram_contacts(channel_id);
CREATE INDEX idx_ig_contacts_username ON public.instagram_contacts(instagram_username);

CREATE TRIGGER update_instagram_contacts_updated_at
  BEFORE UPDATE ON public.instagram_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram contacts"
  ON public.instagram_contacts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage instagram contacts"
  ON public.instagram_contacts FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- TABLE: instagram_threads
-- =============================================================================
CREATE TABLE public.instagram_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  provider_thread_id TEXT,
  thread_status public.instagram_thread_status NOT NULL DEFAULT 'open',
  current_mode TEXT NOT NULL DEFAULT 'bot',
  assigned_user_id UUID,
  entrypoint_type TEXT,
  entrypoint_ref TEXT,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_threads ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_threads_tenant ON public.instagram_threads(tenant_id);
CREATE INDEX idx_ig_threads_channel ON public.instagram_threads(channel_id);
CREATE INDEX idx_ig_threads_contact ON public.instagram_threads(contact_id);
CREATE INDEX idx_ig_threads_status ON public.instagram_threads(thread_status);
CREATE INDEX idx_ig_threads_last_msg ON public.instagram_threads(last_message_at DESC);

CREATE TRIGGER update_instagram_threads_updated_at
  BEFORE UPDATE ON public.instagram_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram threads"
  ON public.instagram_threads FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage instagram threads"
  ON public.instagram_threads FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- TABLE: instagram_messages
-- =============================================================================
CREATE TABLE public.instagram_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES public.instagram_threads(id) ON DELETE CASCADE,
  provider_message_id TEXT,
  direction public.instagram_message_direction NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  text_body TEXT,
  media_url TEXT,
  payload JSONB,
  sent_by_user_id UUID,
  delivery_status public.instagram_delivery_status NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_messages_thread ON public.instagram_messages(thread_id);
CREATE INDEX idx_ig_messages_tenant ON public.instagram_messages(tenant_id);
CREATE INDEX idx_ig_messages_provider_id ON public.instagram_messages(provider_message_id);
CREATE INDEX idx_ig_messages_created ON public.instagram_messages(created_at DESC);

CREATE TRIGGER update_instagram_messages_updated_at
  BEFORE UPDATE ON public.instagram_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram messages"
  ON public.instagram_messages FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage instagram messages"
  ON public.instagram_messages FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- TABLE: instagram_webhook_deliveries
-- =============================================================================
CREATE TABLE public.instagram_webhook_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID,
  channel_id UUID REFERENCES public.instagram_channels(id) ON DELETE SET NULL,
  provider_delivery_key TEXT,
  event_hash TEXT,
  signature_valid BOOLEAN,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  parse_status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_webhooks_channel ON public.instagram_webhook_deliveries(channel_id);
CREATE INDEX idx_ig_webhooks_processed ON public.instagram_webhook_deliveries(processed);
CREATE INDEX idx_ig_webhooks_hash ON public.instagram_webhook_deliveries(event_hash);
CREATE INDEX idx_ig_webhooks_created ON public.instagram_webhook_deliveries(created_at DESC);

-- Webhook deliveries: only service role (edge functions) can manage
CREATE POLICY "Service role manages webhook deliveries"
  ON public.instagram_webhook_deliveries FOR ALL
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- TABLE: instagram_event_log
-- =============================================================================
CREATE TABLE public.instagram_event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.instagram_channels(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.instagram_contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.instagram_threads(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_source TEXT,
  provider_object_id TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  normalized_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_event_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ig_events_tenant ON public.instagram_event_log(tenant_id);
CREATE INDEX idx_ig_events_channel ON public.instagram_event_log(channel_id);
CREATE INDEX idx_ig_events_type ON public.instagram_event_log(event_type);
CREATE INDEX idx_ig_events_time ON public.instagram_event_log(event_time DESC);

CREATE POLICY "Tenant members can view instagram events"
  ON public.instagram_event_log FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Event log: only service role inserts
CREATE POLICY "Service role manages event log"
  ON public.instagram_event_log FOR INSERT
  WITH CHECK (false);

-- =============================================================================
-- TABLE: instagram_outbox
-- =============================================================================
CREATE TABLE public.instagram_outbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.instagram_threads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.instagram_contacts(id) ON DELETE SET NULL,
  message_kind TEXT NOT NULL DEFAULT 'text',
  payload JSONB NOT NULL,
  send_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.instagram_outbox_status NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  provider_message_id TEXT,
  idempotency_key TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_outbox ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_ig_outbox_idempotency ON public.instagram_outbox(idempotency_key);
CREATE INDEX idx_ig_outbox_tenant ON public.instagram_outbox(tenant_id);
CREATE INDEX idx_ig_outbox_status ON public.instagram_outbox(status) WHERE status IN ('queued', 'processing');
CREATE INDEX idx_ig_outbox_send_after ON public.instagram_outbox(send_after) WHERE status = 'queued';
CREATE INDEX idx_ig_outbox_channel ON public.instagram_outbox(channel_id);

CREATE TRIGGER update_instagram_outbox_updated_at
  BEFORE UPDATE ON public.instagram_outbox
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Tenant members can view instagram outbox"
  ON public.instagram_outbox FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert into instagram outbox"
  ON public.instagram_outbox FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- =============================================================================
-- Enable realtime for key tables
-- =============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_messages;
-- Phase 2: Instagram Automation Base

-- 1. Tags
CREATE TABLE public.instagram_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, channel_id, name)
);

CREATE TABLE public.instagram_contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.instagram_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, tag_id)
);

-- 2. Flows
CREATE TABLE public.instagram_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  live_version_id uuid,
  allow_parallel_runs boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.instagram_flows(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  snapshot jsonb,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flow_id, version_number)
);

ALTER TABLE public.instagram_flows
  ADD CONSTRAINT instagram_flows_live_version_id_fkey
  FOREIGN KEY (live_version_id) REFERENCES public.instagram_flow_versions(id);

-- 3. Nodes & Edges
CREATE TABLE public.instagram_flow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE,
  node_type text NOT NULL,
  label text,
  config jsonb NOT NULL DEFAULT '{}',
  position_x double precision NOT NULL DEFAULT 0,
  position_y double precision NOT NULL DEFAULT 0,
  is_entry boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_flow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.instagram_flow_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.instagram_flow_nodes(id) ON DELETE CASCADE,
  source_handle text,
  label text,
  condition jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Runs & Steps
CREATE TABLE public.instagram_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.instagram_flows(id),
  version_id uuid NOT NULL REFERENCES public.instagram_flow_versions(id),
  thread_id uuid NOT NULL REFERENCES public.instagram_threads(id),
  contact_id uuid NOT NULL REFERENCES public.instagram_contacts(id),
  trigger_rule_id uuid,
  status text NOT NULL DEFAULT 'running',
  current_node_id uuid,
  context jsonb NOT NULL DEFAULT '{}',
  error_message text,
  paused_by_contact_rule boolean NOT NULL DEFAULT false,
  idempotency_key text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(idempotency_key)
);

CREATE TABLE public.instagram_flow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.instagram_flow_runs(id) ON DELETE CASCADE,
  node_id uuid NOT NULL,
  node_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Trigger Rules
CREATE TABLE public.instagram_trigger_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.instagram_flows(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  environment text NOT NULL DEFAULT 'production',
  throttle_mode text NOT NULL DEFAULT 'always',
  keywords text[],
  keyword_match_mode text DEFAULT 'exact',
  tag_filter_ids uuid[],
  time_filter jsonb,
  timeout_seconds integer,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Contact Pauses
CREATE TABLE public.instagram_contact_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  paused_until timestamptz,
  reason text,
  source text NOT NULL DEFAULT 'manual',
  paused_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Add fields to instagram_threads
ALTER TABLE public.instagram_threads
  ADD COLUMN IF NOT EXISTS automations_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS automation_pause_reason text,
  ADD COLUMN IF NOT EXISTS automation_pause_source text;

-- 8. Indexes
CREATE INDEX idx_ig_tags_tenant_channel ON public.instagram_tags(tenant_id, channel_id);
CREATE INDEX idx_ig_contact_tags_contact ON public.instagram_contact_tags(contact_id);
CREATE INDEX idx_ig_contact_tags_tag ON public.instagram_contact_tags(tag_id);
CREATE INDEX idx_ig_flows_tenant ON public.instagram_flows(tenant_id, channel_id);
CREATE INDEX idx_ig_flow_versions_flow ON public.instagram_flow_versions(flow_id);
CREATE INDEX idx_ig_flow_nodes_version ON public.instagram_flow_nodes(version_id);
CREATE INDEX idx_ig_flow_edges_version ON public.instagram_flow_edges(version_id);
CREATE INDEX idx_ig_flow_runs_flow ON public.instagram_flow_runs(flow_id);
CREATE INDEX idx_ig_flow_runs_thread ON public.instagram_flow_runs(thread_id);
CREATE INDEX idx_ig_flow_runs_contact ON public.instagram_flow_runs(contact_id);
CREATE INDEX idx_ig_flow_runs_status ON public.instagram_flow_runs(status);
CREATE INDEX idx_ig_flow_run_steps_run ON public.instagram_flow_run_steps(run_id);
CREATE INDEX idx_ig_trigger_rules_flow ON public.instagram_trigger_rules(flow_id);
CREATE INDEX idx_ig_trigger_rules_type ON public.instagram_trigger_rules(trigger_type, is_active);
CREATE INDEX idx_ig_contact_pauses_contact ON public.instagram_contact_pauses(contact_id, channel_id);
CREATE INDEX idx_ig_flow_runs_idemp ON public.instagram_flow_runs(idempotency_key);

-- 9. RLS
ALTER TABLE public.instagram_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_trigger_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contact_pauses ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies
CREATE POLICY "tenant_isolation" ON public.instagram_tags FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_contact_tags FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flows FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_versions FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_nodes FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_edges FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_runs FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_flow_run_steps FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_trigger_rules FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_isolation" ON public.instagram_contact_pauses FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role policies for edge functions
CREATE POLICY "service_role_all" ON public.instagram_tags FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_contact_tags FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flows FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_versions FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_nodes FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_edges FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_runs FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_flow_run_steps FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_trigger_rules FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON public.instagram_contact_pauses FOR ALL TO service_role USING (true);

-- 10. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_flow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_contact_pauses;

-- 11. Updated_at triggers
CREATE TRIGGER update_instagram_flows_updated_at BEFORE UPDATE ON public.instagram_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_instagram_trigger_rules_updated_at BEFORE UPDATE ON public.instagram_trigger_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 3: Growth Tools - New tables and columns

-- 1. instagram_deep_links
CREATE TABLE IF NOT EXISTS public.instagram_deep_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  slug TEXT NOT NULL,
  ref_key TEXT NOT NULL,
  flow_id UUID,
  metadata JSONB DEFAULT '{}',
  click_count INTEGER NOT NULL DEFAULT 0,
  conversation_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

ALTER TABLE public.instagram_deep_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_deep_links FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 2. instagram_media_watchlist
CREATE TABLE IF NOT EXISTS public.instagram_media_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  media_id TEXT,
  media_type TEXT NOT NULL DEFAULT 'post',
  watch_mode TEXT NOT NULL DEFAULT 'specific',
  keywords_include TEXT[] DEFAULT '{}',
  keywords_exclude TEXT[] DEFAULT '{}',
  reply_public_enabled BOOLEAN NOT NULL DEFAULT false,
  reply_public_variants TEXT[] DEFAULT '{}',
  private_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  private_reply_flow_id UUID,
  first_comment_only BOOLEAN NOT NULL DEFAULT false,
  delay_seconds INTEGER DEFAULT 0,
  round_robin_index INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_media_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_media_watchlist FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 3. instagram_ice_breakers
CREATE TABLE IF NOT EXISTS public.instagram_ice_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  text TEXT NOT NULL,
  flow_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_ice_breakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_ice_breakers FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 4. instagram_persistent_menu_items
CREATE TABLE IF NOT EXISTS public.instagram_persistent_menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  label TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'postback',
  action_payload TEXT,
  flow_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_persistent_menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_persistent_menu_items FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 5. instagram_ad_welcome_flows
CREATE TABLE IF NOT EXISTS public.instagram_ad_welcome_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  name TEXT NOT NULL,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  flow_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_ad_welcome_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_ad_welcome_flows FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6. instagram_comment_replies_log (idempotency for comment replies)
CREATE TABLE IF NOT EXISTS public.instagram_comment_replies_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  comment_id TEXT NOT NULL,
  reply_type TEXT NOT NULL,
  watchlist_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(comment_id, reply_type)
);

ALTER TABLE public.instagram_comment_replies_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.instagram_comment_replies_log FOR ALL USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 7. Add entrypoint columns to instagram_threads (if not exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_threads' AND column_name = 'entrypoint_type') THEN
    ALTER TABLE public.instagram_threads ADD COLUMN entrypoint_type TEXT DEFAULT 'dm';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_threads' AND column_name = 'entrypoint_ref') THEN
    ALTER TABLE public.instagram_threads ADD COLUMN entrypoint_ref TEXT;
  END IF;
END $$;

-- 8. Add entrypoint fields to instagram_contacts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'instagram_contacts' AND column_name = 'source_first_entry') THEN
    ALTER TABLE public.instagram_contacts ADD COLUMN source_first_entry TEXT DEFAULT 'dm';
  END IF;
END $$;

-- 9. Realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_deep_links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_media_watchlist;

-- Phase 4: Data Collection, CTA Links, Quick Automations, AI Flow Drafts

-- 1. Add fields to instagram_contacts
ALTER TABLE public.instagram_contacts
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_source TEXT,
  ADD COLUMN IF NOT EXISTS phone_source TEXT;

-- 2. Add fields to instagram_messages
ALTER TABLE public.instagram_messages
  ADD COLUMN IF NOT EXISTS cta_link_id UUID,
  ADD COLUMN IF NOT EXISTS cta_click_tracked BOOLEAN DEFAULT false;

-- 3. Quick automation templates
CREATE TABLE public.instagram_quick_automation_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'growth',
  description TEXT,
  required_capabilities TEXT[] DEFAULT '{}',
  template_nodes JSONB NOT NULL DEFAULT '[]',
  template_edges JSONB NOT NULL DEFAULT '[]',
  trigger_config JSONB,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- No RLS on templates - they are system-level read-only
ALTER TABLE public.instagram_quick_automation_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_read_templates" ON public.instagram_quick_automation_templates
  FOR SELECT USING (true);

-- 4. Quick automation installs
CREATE TABLE public.instagram_quick_automation_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.instagram_quick_automation_templates(id),
  flow_id UUID NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_quick_automation_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_installs" ON public.instagram_quick_automation_installs
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 5. AI flow drafts
CREATE TABLE public.instagram_ai_flow_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  objective TEXT,
  trigger_type TEXT,
  tone TEXT,
  language TEXT DEFAULT 'pt-BR',
  cta TEXT,
  data_fields TEXT[] DEFAULT '{}',
  include_handoff BOOLEAN DEFAULT false,
  generated_nodes JSONB DEFAULT '[]',
  generated_edges JSONB DEFAULT '[]',
  suggested_tags TEXT[] DEFAULT '{}',
  suggested_fields TEXT[] DEFAULT '{}',
  validation_report JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  converted_flow_id UUID
);

ALTER TABLE public.instagram_ai_flow_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ai_drafts" ON public.instagram_ai_flow_drafts
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 6. Data collection events
CREATE TABLE public.instagram_data_collection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  channel_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'flow',
  flow_id UUID,
  flow_run_id UUID,
  node_id TEXT,
  consent_given BOOLEAN DEFAULT false,
  consent_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_data_collection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_data_events" ON public.instagram_data_collection_events
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 7. CTA links
CREATE TABLE public.instagram_cta_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  ref_key TEXT,
  flow_id UUID,
  version_id UUID,
  node_id TEXT,
  click_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_cta_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_cta_links" ON public.instagram_cta_links
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 8. CTA link clicks
CREATE TABLE public.instagram_cta_link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cta_link_id UUID NOT NULL REFERENCES public.instagram_cta_links(id) ON DELETE CASCADE,
  contact_id UUID,
  thread_id UUID,
  message_id UUID,
  clicked_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_cta_link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_cta_clicks" ON public.instagram_cta_link_clicks
  FOR ALL USING (tenant_id = (SELECT public.get_user_tenant_id(auth.uid())));

-- 9. Insert seed quick automation templates
INSERT INTO public.instagram_quick_automation_templates (slug, name, category, description, required_capabilities, template_nodes, template_edges, sort_order) VALUES
('auto-dm-comment', 'Auto-DM por Comentário', 'growth', 'Envia DM automática quando alguém comenta em seu post ou reel', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Mensagem de boas-vindas","config":{"text":"Oi {{contact_name}}! Vi seu comentário 😊 Quer saber mais?"},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 1),
('lead-gen-stories', 'Gerar Leads por Stories', 'captacao', 'Captura leads quando respondem seus stories', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Agradecimento","config":{"text":"Que bom que respondeu! 🎉"},"position_x":250,"position_y":100,"is_entry":true},{"id":"ask_email","node_type":"collect_email","label":"Pedir e-mail","config":{"prompt":"Qual seu melhor e-mail para eu te enviar?","field":"email"},"position_x":250,"position_y":220,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"ask_email"}]', 2),
('welcome-followers', 'Say Hi to New Followers', 'growth', 'Envia mensagem de boas-vindas a novos seguidores', '{"follow_to_dm"}',
 '[{"id":"entry","node_type":"send_text","label":"Boas-vindas","config":{"text":"Bem-vindo(a)! 🙌 Obrigado por seguir!"},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 3),
('capture-email', 'Capturar E-mail via DM', 'captacao', 'Fluxo para capturar e-mail do contato via DM', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Pedir e-mail","config":{"text":"Gostaria de receber nossas novidades? Me envia seu melhor e-mail! 📧"},"position_x":250,"position_y":100,"is_entry":true},{"id":"collect","node_type":"collect_email","label":"Capturar e-mail","config":{"prompt":"","field":"email","confirm_before_save":true},"position_x":250,"position_y":220,"is_entry":false},{"id":"thanks","node_type":"send_text","label":"Agradecimento","config":{"text":"Perfeito! E-mail salvo com sucesso ✅"},"position_x":250,"position_y":340,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"collect"},{"source_node_id":"collect","target_node_id":"thanks"}]', 4),
('capture-phone', 'Capturar Telefone via DM', 'captacao', 'Fluxo para capturar telefone do contato via DM', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Pedir telefone","config":{"text":"Qual seu telefone com DDD para contato? 📱"},"position_x":250,"position_y":100,"is_entry":true},{"id":"collect","node_type":"collect_phone","label":"Capturar telefone","config":{"prompt":"","field":"phone"},"position_x":250,"position_y":220,"is_entry":false},{"id":"thanks","node_type":"send_text","label":"Agradecimento","config":{"text":"Telefone salvo! Obrigado 🎯"},"position_x":250,"position_y":340,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"collect"},{"source_node_id":"collect","target_node_id":"thanks"}]', 5),
('product-keyword', 'Link de Produto por Palavra-chave', 'vendas', 'Envia link de produto quando detecta palavra-chave no comentário', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Enviar link","config":{"text":"Aqui está o link do produto que você perguntou: {{product_url}}"},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 6),
('handoff-human', 'Handoff para Humano', 'atendimento', 'Transfere conversa para atendimento humano', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Aviso","config":{"text":"Vou transferir você para um atendente. Aguarde um momento! 🙋"},"position_x":250,"position_y":100,"is_entry":true},{"id":"handoff","node_type":"handoff_to_human","label":"Transferir","config":{},"position_x":250,"position_y":220,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"handoff"}]', 7),
('faq-menu', 'FAQ com Persistent Menu', 'atendimento', 'Menu de perguntas frequentes via persistent menu', '{}',
 '[{"id":"entry","node_type":"send_quick_replies","label":"Menu FAQ","config":{"text":"Como posso ajudar?","options":[{"label":"Horário"},{"label":"Preços"},{"label":"Falar com humano"}]},"position_x":250,"position_y":100,"is_entry":true}]',
 '[]', 8),
('ad-ctid-flow', 'Fluxo de Anúncio Click-to-IG Direct', 'anuncios', 'Fluxo de boas-vindas para leads vindos de anúncios', '{}',
 '[{"id":"entry","node_type":"send_text","label":"Boas-vindas Ad","config":{"text":"Oi! Vi que você clicou no nosso anúncio 🎯 Como posso ajudar?"},"position_x":250,"position_y":100,"is_entry":true},{"id":"collect_email","node_type":"collect_email","label":"Capturar e-mail","config":{"prompt":"Deixa seu e-mail que te envio mais detalhes!","field":"email"},"position_x":250,"position_y":220,"is_entry":false}]',
 '[{"source_node_id":"entry","target_node_id":"collect_email"}]', 9);

-- ========================================
-- PHASE 5: Advanced Operations
-- ========================================

-- 1. Daily metrics rollup table
CREATE TABLE public.instagram_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  -- Message metrics
  inbound_messages INT DEFAULT 0,
  outbound_messages INT DEFAULT 0,
  new_threads INT DEFAULT 0,
  -- Automation metrics
  private_replies_sent INT DEFAULT 0,
  flows_started INT DEFAULT 0,
  flows_completed INT DEFAULT 0,
  handoffs_to_human INT DEFAULT 0,
  -- Trigger metrics
  comment_triggers INT DEFAULT 0,
  story_reply_triggers INT DEFAULT 0,
  story_mention_triggers INT DEFAULT 0,
  live_comment_triggers INT DEFAULT 0,
  ad_entry_triggers INT DEFAULT 0,
  ref_url_entries INT DEFAULT 0,
  -- Failure metrics
  send_failures INT DEFAULT 0,
  -- Response time (seconds)
  avg_first_response_seconds NUMERIC,
  avg_human_mode_seconds NUMERIC,
  -- Capture metrics
  emails_captured INT DEFAULT 0,
  phones_captured INT DEFAULT 0,
  cta_clicks INT DEFAULT 0,
  pauses_count INT DEFAULT 0,
  -- Metadata
  flow_metrics JSONB DEFAULT '{}'::jsonb,
  trigger_metrics JSONB DEFAULT '{}'::jsonb,
  operator_metrics JSONB DEFAULT '{}'::jsonb,
  media_metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, metric_date)
);

ALTER TABLE public.instagram_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_metrics_daily"
  ON public.instagram_metrics_daily FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 2. Blocked users table
CREATE TABLE public.instagram_blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  igsid TEXT,
  username TEXT,
  blocked_by UUID REFERENCES auth.users(id),
  reason TEXT,
  blocked_at TIMESTAMPTZ DEFAULT now(),
  unblocked_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(channel_id, contact_id, is_active)
);

ALTER TABLE public.instagram_blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_blocked_users"
  ON public.instagram_blocked_users FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 3. Spam threads tracking
ALTER TABLE public.instagram_threads ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT false;
ALTER TABLE public.instagram_threads ADD COLUMN IF NOT EXISTS spam_marked_at TIMESTAMPTZ;
ALTER TABLE public.instagram_threads ADD COLUMN IF NOT EXISTS spam_marked_by UUID REFERENCES auth.users(id);

-- 4. Term blacklist for triage
CREATE TABLE public.instagram_term_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID,
  term TEXT NOT NULL,
  action TEXT DEFAULT 'flag' CHECK (action IN ('flag', 'hide', 'spam', 'block')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_term_blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_term_blacklist"
  ON public.instagram_term_blacklist FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 5. Content publishing table
CREATE TABLE public.instagram_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image', 'video', 'reel', 'carousel')),
  caption TEXT,
  media_urls TEXT[] DEFAULT '{}',
  cover_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  ig_media_id TEXT,
  ig_permalink TEXT,
  error_message TEXT,
  linked_flow_id UUID,
  linked_trigger_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.instagram_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_content"
  ON public.instagram_content FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6. Media insights table
CREATE TABLE public.instagram_media_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  ig_media_id TEXT NOT NULL,
  media_type TEXT,
  permalink TEXT,
  caption TEXT,
  timestamp TIMESTAMPTZ,
  -- Engagement metrics
  impressions INT DEFAULT 0,
  reach INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  saves INT DEFAULT 0,
  shares INT DEFAULT 0,
  plays INT DEFAULT 0,
  -- DM correlation
  dm_threads_generated INT DEFAULT 0,
  dm_leads_captured INT DEFAULT 0,
  -- Raw insights
  insights_raw JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, ig_media_id)
);

ALTER TABLE public.instagram_media_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_media_insights"
  ON public.instagram_media_insights FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 7. Channel-level insights
CREATE TABLE public.instagram_channel_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  insight_date DATE NOT NULL,
  followers_count INT,
  follows_count INT,
  media_count INT,
  impressions INT DEFAULT 0,
  reach INT DEFAULT 0,
  profile_views INT DEFAULT 0,
  website_clicks INT DEFAULT 0,
  email_contacts INT DEFAULT 0,
  phone_call_clicks INT DEFAULT 0,
  get_directions_clicks INT DEFAULT 0,
  audience_demographics JSONB DEFAULT '{}'::jsonb,
  online_followers JSONB DEFAULT '{}'::jsonb,
  insights_raw JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel_id, insight_date)
);

ALTER TABLE public.instagram_channel_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_channel_insights"
  ON public.instagram_channel_insights FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 8. Comment queue for moderation
CREATE TABLE public.instagram_comment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL,
  ig_comment_id TEXT NOT NULL UNIQUE,
  ig_media_id TEXT,
  parent_comment_id TEXT,
  commenter_igsid TEXT,
  commenter_username TEXT,
  text TEXT,
  is_hidden BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  moderation_status TEXT DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'hidden', 'deleted')),
  flagged_terms TEXT[],
  replied_publicly BOOLEAN DEFAULT false,
  replied_privately BOOLEAN DEFAULT false,
  media_type TEXT,
  is_live_comment BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  moderated_at TIMESTAMPTZ,
  moderated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.instagram_comment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on instagram_comment_queue"
  ON public.instagram_comment_queue FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_comment_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instagram_metrics_daily;

-- Phase 6: Fix - Create capabilities columns on instagram_channels instead
ALTER TABLE public.instagram_channels 
  ADD COLUMN IF NOT EXISTS supports_follow_to_dm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_share_to_dm BOOLEAN DEFAULT false;

-- Fix 1: Add missing values to instagram_outbox_status enum
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'retry';
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'dead';

-- Fix 2: Add missing values to instagram_message_direction enum
ALTER TYPE instagram_message_direction ADD VALUE IF NOT EXISTS 'inbound';
ALTER TYPE instagram_message_direction ADD VALUE IF NOT EXISTS 'outbound';

-- BUG 1: Fix outbox default from 'queued' to 'pending' (code always uses 'pending')
ALTER TABLE public.instagram_outbox 
  ALTER COLUMN status SET DEFAULT 'pending'::instagram_outbox_status;

-- BUG 2: Drop broken RLS policy on webhook_deliveries (qual=false is semantically wrong; service_role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service role manages webhook deliveries" ON public.instagram_webhook_deliveries;

-- Re-add a correct service_role policy for webhook_deliveries (qual=true, not false)
CREATE POLICY "Service role full access on webhook deliveries" 
  ON public.instagram_webhook_deliveries 
  FOR ALL 
  TO service_role 
  USING (true) 
  WITH CHECK (true);

-- Fix instagram_event_log RLS: drop broken public INSERT policy, add correct service_role policy
DO $$
BEGIN
  -- Drop any existing INSERT policies on instagram_event_log that use public role
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'instagram_event_log' 
    AND policyname = 'Service role can insert event logs'
  ) THEN
    DROP POLICY "Service role can insert event logs" ON public.instagram_event_log;
  END IF;

  -- Drop the broken public-role policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'instagram_event_log' 
    AND cmd = 'INSERT'
    AND roles = '{public}'
  ) THEN
    -- We need to find and drop it by name
    NULL;
  END IF;
END $$;

-- Drop ALL existing policies on instagram_event_log to start clean
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies WHERE tablename = 'instagram_event_log' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.instagram_event_log', pol.policyname);
  END LOOP;
END $$;

-- Create correct service_role full access policy
CREATE POLICY "Service role full access on event log"
  ON public.instagram_event_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Also add tenant-scoped SELECT for authenticated users
CREATE POLICY "Tenant users can read own event logs"
  ON public.instagram_event_log
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ============================================================
-- Create missing Phase 6 experimental tables
-- ============================================================

CREATE TABLE public.instagram_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  enabled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, feature_key)
);

CREATE TABLE public.instagram_follow_dm_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  welcome_text text,
  delay_seconds integer NOT NULL DEFAULT 5,
  flow_id uuid,
  once_per_user boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_share_dm_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  target_mode text NOT NULL DEFAULT 'all',
  target_media_id text,
  flow_id uuid,
  once_per_user_per_automation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_experimental_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.instagram_channels(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  execution_type text NOT NULL,
  config_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RISK FIX 1: RLS policies for ALL Instagram tables
-- ============================================================

ALTER TABLE public.instagram_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_follow_dm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_share_dm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_experimental_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_channel_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_media_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_deep_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_ice_breakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_persistent_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_ad_welcome_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_comment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_cta_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_cta_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_comment_replies_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_metrics_daily ENABLE ROW LEVEL SECURITY;

-- SELECT policies (tenant-scoped)
CREATE POLICY "tenant_select" ON public.instagram_channels FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_threads FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_contacts FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_messages FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_channel_capabilities FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_event_log FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_outbox FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_flows FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_flow_versions FOR SELECT TO authenticated USING (
  flow_id IN (SELECT id FROM public.instagram_flows WHERE channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid())))
);
CREATE POLICY "tenant_select" ON public.instagram_flow_runs FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_media_watchlist FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_deep_links FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_ice_breakers FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_persistent_menu_items FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_ad_welcome_flows FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_content FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_comment_queue FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_feature_flags FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_follow_dm_configs FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_share_dm_configs FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_select" ON public.instagram_experimental_executions FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_cta_links FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_cta_link_clicks FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_comment_replies_log FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_select" ON public.instagram_metrics_daily FOR SELECT TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);

-- INSERT policies (tables the UI writes to)
CREATE POLICY "tenant_insert" ON public.instagram_media_watchlist FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_feature_flags FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_insert" ON public.instagram_follow_dm_configs FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_share_dm_configs FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_ad_welcome_flows FOR INSERT TO authenticated WITH CHECK (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_insert" ON public.instagram_content FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- UPDATE policies
CREATE POLICY "tenant_update" ON public.instagram_media_watchlist FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_feature_flags FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tenant_update" ON public.instagram_follow_dm_configs FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_share_dm_configs FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_ad_welcome_flows FOR UPDATE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_update" ON public.instagram_content FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- DELETE policies
CREATE POLICY "tenant_delete" ON public.instagram_media_watchlist FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_delete" ON public.instagram_share_dm_configs FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_delete" ON public.instagram_ad_welcome_flows FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);
CREATE POLICY "tenant_delete" ON public.instagram_deep_links FOR DELETE TO authenticated USING (
  channel_id IN (SELECT id FROM public.instagram_channels WHERE tenant_id = public.get_user_tenant_id(auth.uid()))
);

-- ============================================================
-- RISK FIX 2: Atomic CTA click_count increment via RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_cta_click_count(p_cta_link_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE instagram_cta_links
  SET click_count = COALESCE(click_count, 0) + 1
  WHERE id = p_cta_link_id;
$$;

-- ============================================================
-- RISK FIX 5: Remove orphaned capability columns
-- ============================================================
ALTER TABLE public.instagram_channels DROP COLUMN IF EXISTS supports_follow_to_dm;
ALTER TABLE public.instagram_channels DROP COLUMN IF EXISTS supports_share_to_dm;
ALTER TABLE public.instagram_content
  ADD CONSTRAINT instagram_content_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;
-- Fix threads: set tenant_id from their channel
UPDATE instagram_threads t
SET tenant_id = c.tenant_id
FROM instagram_channels c
WHERE c.id = t.channel_id AND t.tenant_id != c.tenant_id;

-- Fix contacts: set tenant_id from their channel
UPDATE instagram_contacts ct
SET tenant_id = c.tenant_id
FROM instagram_channels c
WHERE c.id = ct.channel_id AND ct.tenant_id != c.tenant_id;

-- Fix messages: set tenant_id from their thread's channel
UPDATE instagram_messages m
SET tenant_id = c.tenant_id
FROM instagram_threads t
JOIN instagram_channels c ON c.id = t.channel_id
WHERE t.id = m.thread_id AND m.tenant_id != c.tenant_id;
SELECT cron.unschedule('melhor-envio-sync-hourly');ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{"enabled":true,"sound":true,"events":{"new_order":true,"new_message":true,"sync_error":true,"low_stock":true,"rfm_alert":true,"campaign_complete":true}}'::jsonb,
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS checklist_dismissed boolean DEFAULT false;
-- =============================================
-- FASE 6: Advanced Features Tables
-- =============================================

-- 6.1 Contact Custom Fields (schema definition per tenant)
CREATE TABLE public.contact_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  options jsonb DEFAULT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.contact_custom_fields
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.2 Contact Custom Field Values
CREATE TABLE public.contact_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.contact_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, field_id)
);

ALTER TABLE public.contact_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.contact_custom_field_values
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.3 CRM Segments (dynamic audiences)
CREATE TABLE public.crm_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_count int NOT NULL DEFAULT 0,
  last_computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.crm_segments
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.4 Tenant Webhooks
CREATE TABLE public.tenant_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.tenant_webhooks
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.5 Tenant API Keys
CREATE TABLE public.tenant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.tenant_api_keys
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.6 White Label Settings
CREATE TABLE public.tenant_whitelabel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  company_name text,
  logo_url text,
  favicon_url text,
  colors jsonb NOT NULL DEFAULT '{"primary":"#6d28d9","secondary":"#a855f7","accent":"#f59e0b","background":"#0f0f23","foreground":"#ffffff"}'::jsonb,
  custom_domain text,
  domain_verified boolean NOT NULL DEFAULT false,
  hide_branding boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_whitelabel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.tenant_whitelabel
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.7 Inbox Routing Rules
CREATE TABLE public.inbox_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL,
  condition_type text NOT NULL DEFAULT 'all',
  condition_value text,
  target_inbox_id uuid,
  target_type text NOT NULL DEFAULT 'inbox',
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inbox_routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.inbox_routing_rules
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 6.8 Contact Merges (cross-channel)
CREATE TABLE public.contact_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  primary_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  merged_contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  similarity_score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'suggested',
  merged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.contact_merges
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Create storage bucket for whitelabel assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('whitelabel-assets', 'whitelabel-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: tenant users can upload
CREATE POLICY "Tenant users can upload whitelabel assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whitelabel-assets'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

-- Storage policy: public read
CREATE POLICY "Public read whitelabel assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'whitelabel-assets');

-- Storage policy: tenant users can update/delete
CREATE POLICY "Tenant users can manage whitelabel assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'whitelabel-assets'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);
-- Fix: Restrict whatsapp_channels SELECT to admins only
DROP POLICY IF EXISTS "Tenant members can view their channels" ON public.whatsapp_channels;

CREATE POLICY "Tenant admins can view channels"
  ON public.whatsapp_channels
  FOR SELECT
  TO authenticated
  USING (is_tenant_admin(auth.uid(), tenant_id));

-- Fix: Restrict bling_connections to admins only
DROP POLICY IF EXISTS "Tenant isolation" ON public.bling_connections;

CREATE POLICY "Tenant admins can manage bling_connections"
  ON public.bling_connections
  FOR ALL
  TO authenticated
  USING (is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (is_tenant_admin(auth.uid(), tenant_id));
-- Create abandoned_cart_configs table
CREATE TABLE IF NOT EXISTS public.abandoned_cart_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  delay_minutes integer NOT NULL DEFAULT 120,
  message_template text DEFAULT 'Olá {nome}, notamos que você deixou itens no carrinho! Complete sua compra agora.',
  whatsapp_integration_id uuid REFERENCES public.integrations(id),
  coupon_enabled boolean DEFAULT false,
  coupon_discount_percent numeric DEFAULT 10,
  coupon_duration_days integer DEFAULT 7,
  max_attempts integer DEFAULT 2,
  tokens_per_execution integer DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create abandoned_carts table
CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.abandoned_cart_configs(id),
  external_id text NOT NULL,
  customer_name text,
  customer_email text,
  customer_phone text,
  cart_total numeric DEFAULT 0,
  checkout_url text,
  abandoned_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  contacted_at timestamptz,
  recovered_at timestamptz,
  recovery_order_id text,
  attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, external_id)
);

-- Create abandoned_cart_executions table
CREATE TABLE IF NOT EXISTS public.abandoned_cart_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id uuid REFERENCES public.abandoned_cart_configs(id),
  cart_id uuid REFERENCES public.abandoned_carts(id) ON DELETE CASCADE,
  action_type text NOT NULL DEFAULT 'whatsapp_reminder',
  status text NOT NULL DEFAULT 'pending',
  customer_name text,
  customer_phone text,
  customer_email text,
  coupon_code text,
  error_message text,
  tokens_used integer DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.abandoned_cart_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_executions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for abandoned_cart_configs
CREATE POLICY "Tenant members can view abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can delete abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for abandoned_carts
CREATE POLICY "Tenant members can view abandoned_carts" ON public.abandoned_carts
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can manage abandoned_carts" ON public.abandoned_carts
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Service role needs access (for edge functions)
CREATE POLICY "Service role full access on abandoned_carts" ON public.abandoned_carts
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on abandoned_cart_configs" ON public.abandoned_cart_configs
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access on abandoned_cart_executions" ON public.abandoned_cart_executions
  FOR ALL TO service_role USING (true);

-- RLS Policies for abandoned_cart_executions
CREATE POLICY "Tenant members can view abandoned_cart_executions" ON public.abandoned_cart_executions
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
-- =============================================================================
-- EMAIL MARKETING - Ajustes para FASE 1
-- =============================================================================

-- Adicionar campos faltantes em email_campaigns
ALTER TABLE public.email_campaigns
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Adicionar índice para is_archived
CREATE INDEX IF NOT EXISTS idx_email_campaigns_is_archived ON public.email_campaigns(is_archived);

-- Adicionar campo is_active em email_templates  
ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;-- =============================================================================
-- FASE 4 (Email Marketing): logs por destinatário, tokens de descadastro/tracking,
-- tags por cliente (li_customers) e estimativa real de audiência elegível.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Email campaign logs: adicionar colunas de log por destinatário
-- -----------------------------------------------------------------------------
ALTER TABLE public.email_campaign_logs
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_campaign_id ON public.email_campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_tenant_campaign ON public.email_campaign_logs(tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_recipient_email ON public.email_campaign_logs(tenant_id, recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_event_type ON public.email_campaign_logs(tenant_id, event_type);

-- -----------------------------------------------------------------------------
-- 2) Tokens por destinatário (unsubscribe + open/click tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  UNIQUE (campaign_id, recipient_email)
);

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

-- Tenant isolation (somente membros autenticados do tenant)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'email_unsubscribe_tokens' AND policyname = 'email_unsubscribe_tokens_tenant_select'
  ) THEN
    CREATE POLICY "email_unsubscribe_tokens_tenant_select"
    ON public.email_unsubscribe_tokens
    FOR SELECT
    TO authenticated
    USING (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'email_unsubscribe_tokens' AND policyname = 'email_unsubscribe_tokens_tenant_insert'
  ) THEN
    CREATE POLICY "email_unsubscribe_tokens_tenant_insert"
    ON public.email_unsubscribe_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'email_unsubscribe_tokens' AND policyname = 'email_unsubscribe_tokens_tenant_update'
  ) THEN
    CREATE POLICY "email_unsubscribe_tokens_tenant_update"
    ON public.email_unsubscribe_tokens
    FOR UPDATE
    TO authenticated
    USING (tenant_id = get_user_tenant_id(auth.uid()))
    WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_tenant_campaign ON public.email_unsubscribe_tokens(tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribe_tokens_recipient_email ON public.email_unsubscribe_tokens(tenant_id, recipient_email);

-- -----------------------------------------------------------------------------
-- 3) Tags por cliente (li_customers)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_tags (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.li_customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, tag_id)
);

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'customer_tags' AND policyname = 'customer_tags_tenant_all'
  ) THEN
    CREATE POLICY "customer_tags_tenant_all"
    ON public.customer_tags
    FOR ALL
    TO authenticated
    USING (tenant_id = get_user_tenant_id(auth.uid()))
    WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_tags_tenant_id ON public.customer_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tag_id ON public.customer_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_customer_id ON public.customer_tags(customer_id);

-- -----------------------------------------------------------------------------
-- 4) RPC de estimativa de audiência (sem simular) - retorna total, suprimidos e elegíveis
--    Formato de _audience_reference esperado:
--    - {"emails": ["a@b.com"...]} (manual)
--    - {"segment_id": "uuid"} (segment)
--    - {"filters": {"integration_id": "uuid", "tag_ids": ["uuid"...], "name_contains": "...", "email_contains": "...", "phone_contains": "...", "doc_contains": "...", "updated_from": "2026-01-01T00:00:00Z", "updated_to": "..." }}
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estimate_email_audience(
  _audience_type text,
  _audience_reference jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _seg_id uuid;
  _ref jsonb := COALESCE(_audience_reference, '{}'::jsonb);
  _filters jsonb := COALESCE(_audience_reference->'filters', '{}'::jsonb);
  _integration_id uuid;
  _tag_ids uuid[];
  _name_contains text;
  _email_contains text;
  _phone_contains text;
  _doc_contains text;
  _updated_from timestamptz;
  _updated_to timestamptz;
  _emails text[];
  _total int := 0;
  _suppressed int := 0;
BEGIN
  _tenant_id := public.get_user_tenant_id(auth.uid());
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Segmento salvo -> carrega filtros
  IF _audience_type = 'segment' THEN
    _seg_id := NULLIF(_ref->>'segment_id', '')::uuid;
    IF _seg_id IS NULL THEN
      RAISE EXCEPTION 'segment_id is required';
    END IF;

    SELECT filters INTO _filters
    FROM public.crm_segments
    WHERE id = _seg_id AND tenant_id = _tenant_id;

    IF _filters IS NULL THEN
      RAISE EXCEPTION 'segment not found';
    END IF;
  END IF;

  -- Manual list
  IF _audience_type = 'manual' THEN
    SELECT COALESCE(array_agg(value::text), ARRAY[]::text[])
    INTO _emails
    FROM jsonb_array_elements_text(COALESCE(_ref->'emails', '[]'::jsonb));

    WITH candidates AS (
      SELECT DISTINCT lower(trim(e)) AS email
      FROM unnest(_emails) e
      WHERE e IS NOT NULL AND trim(e) <> ''
    ), suppressed AS (
      SELECT count(*)::int AS cnt
      FROM candidates c
      JOIN public.email_suppression_list s
        ON s.tenant_id = _tenant_id
       AND lower(s.email) = c.email
       AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT
      (SELECT count(*)::int FROM candidates),
      (SELECT cnt FROM suppressed)
    INTO _total, _suppressed;

    RETURN jsonb_build_object(
      'total_with_email', _total,
      'suppressed', _suppressed,
      'eligible', GREATEST(_total - _suppressed, 0)
    );
  END IF;

  -- Filters (all/filters/segment)
  _integration_id := NULLIF(_filters->>'integration_id', '')::uuid;

  IF jsonb_typeof(_filters->'tag_ids') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO _tag_ids
    FROM jsonb_array_elements_text(_filters->'tag_ids');
  ELSE
    _tag_ids := NULL;
  END IF;

  _name_contains := NULLIF(_filters->>'name_contains', '');
  _email_contains := NULLIF(_filters->>'email_contains', '');
  _phone_contains := NULLIF(_filters->>'phone_contains', '');
  _doc_contains := NULLIF(_filters->>'doc_contains', '');
  _updated_from := NULLIF(_filters->>'updated_from', '')::timestamptz;
  _updated_to := NULLIF(_filters->>'updated_to', '')::timestamptz;

  WITH candidates AS (
    SELECT DISTINCT lower(c.email) AS email
    FROM public.li_customers c
    WHERE c.tenant_id = _tenant_id
      AND c.email IS NOT NULL
      AND (_integration_id IS NULL OR c.integration_id = _integration_id)
      AND (_name_contains IS NULL OR c.name ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR c.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR c.phone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR c.doc ILIKE '%' || _doc_contains || '%')
      AND (_updated_from IS NULL OR c.updated_at_local >= _updated_from)
      AND (_updated_to IS NULL OR c.updated_at_local <= _updated_to)
      AND (
        _tag_ids IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.customer_tags ct
          WHERE ct.tenant_id = _tenant_id
            AND ct.customer_id = c.id
            AND ct.tag_id = ANY(_tag_ids)
        )
      )
  ), suppressed AS (
    SELECT count(*)::int AS cnt
    FROM candidates cand
    JOIN public.email_suppression_list s
      ON s.tenant_id = _tenant_id
     AND lower(s.email) = cand.email
     AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
  )
  SELECT
    (SELECT count(*)::int FROM candidates),
    (SELECT cnt FROM suppressed)
  INTO _total, _suppressed;

  RETURN jsonb_build_object(
    'total_with_email', _total,
    'suppressed', _suppressed,
    'eligible', GREATEST(_total - _suppressed, 0)
  );
END;
$$;
-- Ensure email_campaign_logs has event_type and event_data columns (added in Phase 4 but verifying)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_campaign_logs' AND column_name='event_type'
  ) THEN
    ALTER TABLE public.email_campaign_logs ADD COLUMN event_type text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_campaign_logs' AND column_name='event_data'
  ) THEN
    ALTER TABLE public.email_campaign_logs ADD COLUMN event_data jsonb;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.estimate_email_audience(_audience_type text, _audience_reference jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id uuid;
  _seg_id uuid;
  _rfm_audience_id uuid;
  _ref jsonb := COALESCE(_audience_reference, '{}'::jsonb);
  _filters jsonb := COALESCE(_audience_reference->'filters', '{}'::jsonb);
  _integration_id uuid;
  _tag_ids uuid[];
  _name_contains text;
  _email_contains text;
  _phone_contains text;
  _doc_contains text;
  _updated_from timestamptz;
  _updated_to timestamptz;
  _emails text[];
  _total int := 0;
  _suppressed int := 0;
BEGIN
  _tenant_id := public.get_user_tenant_id(auth.uid());
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  -- Segmento salvo -> carrega filtros
  IF _audience_type = 'segment' THEN
    _seg_id := NULLIF(_ref->>'segment_id', '')::uuid;
    IF _seg_id IS NULL THEN
      RAISE EXCEPTION 'segment_id is required';
    END IF;

    SELECT filters INTO _filters
    FROM public.crm_segments
    WHERE id = _seg_id AND tenant_id = _tenant_id;

    IF _filters IS NULL THEN
      RAISE EXCEPTION 'segment not found';
    END IF;
  END IF;

  -- RFM Audience
  IF _audience_type = 'rfm' THEN
    _rfm_audience_id := NULLIF(_ref->>'rfm_audience_id', '')::uuid;
    IF _rfm_audience_id IS NULL THEN
      RAISE EXCEPTION 'rfm_audience_id is required';
    END IF;

    -- Get emails from RFM audience members via snapshots
    WITH rfm_emails AS (
      SELECT DISTINCT lower(trim(COALESCE(
        s.customer_email,
        s.customer_data->>'email'
      ))) AS email
      FROM public.rfm_audience_members am
      JOIN public.customer_rfm_snapshots s ON s.id = am.snapshot_id
      WHERE am.audience_id = _rfm_audience_id
        AND am.tenant_id = _tenant_id
        AND (s.customer_email IS NOT NULL OR s.customer_data->>'email' IS NOT NULL)
    ), suppressed AS (
      SELECT count(*)::int AS cnt
      FROM rfm_emails e
      JOIN public.email_suppression_list sl
        ON sl.tenant_id = _tenant_id
       AND lower(sl.email) = e.email
       AND sl.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT
      (SELECT count(*)::int FROM rfm_emails WHERE email IS NOT NULL AND email <> ''),
      (SELECT cnt FROM suppressed)
    INTO _total, _suppressed;

    RETURN jsonb_build_object(
      'total_with_email', _total,
      'suppressed', _suppressed,
      'eligible', GREATEST(_total - _suppressed, 0)
    );
  END IF;

  -- Manual list
  IF _audience_type = 'manual' THEN
    SELECT COALESCE(array_agg(value::text), ARRAY[]::text[])
    INTO _emails
    FROM jsonb_array_elements_text(COALESCE(_ref->'emails', '[]'::jsonb));

    WITH candidates AS (
      SELECT DISTINCT lower(trim(e)) AS email
      FROM unnest(_emails) e
      WHERE e IS NOT NULL AND trim(e) <> ''
    ), suppressed AS (
      SELECT count(*)::int AS cnt
      FROM candidates c
      JOIN public.email_suppression_list s
        ON s.tenant_id = _tenant_id
       AND lower(s.email) = c.email
       AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT
      (SELECT count(*)::int FROM candidates),
      (SELECT cnt FROM suppressed)
    INTO _total, _suppressed;

    RETURN jsonb_build_object(
      'total_with_email', _total,
      'suppressed', _suppressed,
      'eligible', GREATEST(_total - _suppressed, 0)
    );
  END IF;

  -- Filters (all/filters/segment)
  _integration_id := NULLIF(_filters->>'integration_id', '')::uuid;

  IF jsonb_typeof(_filters->'tag_ids') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO _tag_ids
    FROM jsonb_array_elements_text(_filters->'tag_ids');
  ELSE
    _tag_ids := NULL;
  END IF;

  _name_contains := NULLIF(_filters->>'name_contains', '');
  _email_contains := NULLIF(_filters->>'email_contains', '');
  _phone_contains := NULLIF(_filters->>'phone_contains', '');
  _doc_contains := NULLIF(_filters->>'doc_contains', '');
  _updated_from := NULLIF(_filters->>'updated_from', '')::timestamptz;
  _updated_to := NULLIF(_filters->>'updated_to', '')::timestamptz;

  WITH candidates AS (
    SELECT DISTINCT lower(c.email) AS email
    FROM public.li_customers c
    WHERE c.tenant_id = _tenant_id
      AND c.email IS NOT NULL
      AND (_integration_id IS NULL OR c.integration_id = _integration_id)
      AND (_name_contains IS NULL OR c.name ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR c.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR c.phone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR c.doc ILIKE '%' || _doc_contains || '%')
      AND (_updated_from IS NULL OR c.updated_at_local >= _updated_from)
      AND (_updated_to IS NULL OR c.updated_at_local <= _updated_to)
      AND (
        _tag_ids IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.customer_tags ct
          WHERE ct.tenant_id = _tenant_id
            AND ct.customer_id = c.id
            AND ct.tag_id = ANY(_tag_ids)
        )
      )
    UNION
    SELECT DISTINCT lower(bc.email) AS email
    FROM public.bling_customers bc
    WHERE bc.tenant_id = _tenant_id
      AND bc.email IS NOT NULL
      AND (_integration_id IS NULL OR bc.integration_id = _integration_id)
      AND (_name_contains IS NULL OR bc.nome ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR bc.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR bc.celular ILIKE '%' || _phone_contains || '%' OR bc.telefone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR bc.cpf_cnpj ILIKE '%' || _doc_contains || '%')
  ), suppressed AS (
    SELECT count(*)::int AS cnt
    FROM candidates cand
    JOIN public.email_suppression_list s
      ON s.tenant_id = _tenant_id
     AND lower(s.email) = cand.email
     AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
  )
  SELECT
    (SELECT count(*)::int FROM candidates),
    (SELECT cnt FROM suppressed)
  INTO _total, _suppressed;

  RETURN jsonb_build_object(
    'total_with_email', _total,
    'suppressed', _suppressed,
    'eligible', GREATEST(_total - _suppressed, 0)
  );
END;
$function$;CREATE OR REPLACE FUNCTION public.increment_campaign_unsubscribed(_campaign_id uuid, _tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.email_campaigns
  SET total_unsubscribed = COALESCE(total_unsubscribed, 0) + 1
  WHERE id = _campaign_id AND tenant_id = _tenant_id;
$$;CREATE OR REPLACE FUNCTION public.estimate_email_audience(_audience_type text, _audience_reference jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id uuid;
  _seg_id uuid;
  _rfm_audience_id uuid;
  _ref jsonb := COALESCE(_audience_reference, '{}'::jsonb);
  _filters jsonb := COALESCE(_audience_reference->'filters', '{}'::jsonb);
  _integration_id uuid;
  _tag_ids uuid[];
  _name_contains text;
  _email_contains text;
  _phone_contains text;
  _doc_contains text;
  _updated_from timestamptz;
  _updated_to timestamptz;
  _emails text[];
  _total int := 0;
  _suppressed int := 0;
BEGIN
  _tenant_id := public.get_user_tenant_id(auth.uid());
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF _audience_type = 'segment' THEN
    _seg_id := NULLIF(_ref->>'segment_id', '')::uuid;
    IF _seg_id IS NULL THEN
      RAISE EXCEPTION 'segment_id is required';
    END IF;
    SELECT filters INTO _filters
    FROM public.crm_segments
    WHERE id = _seg_id AND tenant_id = _tenant_id;
    IF _filters IS NULL THEN
      RAISE EXCEPTION 'segment not found';
    END IF;
  END IF;

  IF _audience_type = 'rfm' THEN
    _rfm_audience_id := NULLIF(_ref->>'rfm_audience_id', '')::uuid;
    IF _rfm_audience_id IS NULL THEN
      RAISE EXCEPTION 'rfm_audience_id is required';
    END IF;
    WITH rfm_emails AS (
      SELECT DISTINCT lower(trim(COALESCE(s.customer_email, s.customer_data->>'email'))) AS email
      FROM public.rfm_audience_members am
      JOIN public.customer_rfm_snapshots s ON s.id = am.snapshot_id
      WHERE am.audience_id = _rfm_audience_id AND am.tenant_id = _tenant_id
        AND (s.customer_email IS NOT NULL OR s.customer_data->>'email' IS NOT NULL)
    ), suppressed AS (
      SELECT count(*)::int AS cnt FROM rfm_emails e
      JOIN public.email_suppression_list sl ON sl.tenant_id = _tenant_id AND lower(sl.email) = e.email
        AND sl.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT (SELECT count(*)::int FROM rfm_emails WHERE email IS NOT NULL AND email <> ''),
           (SELECT cnt FROM suppressed) INTO _total, _suppressed;
    RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
  END IF;

  IF _audience_type = 'manual' THEN
    SELECT COALESCE(array_agg(value::text), ARRAY[]::text[]) INTO _emails
    FROM jsonb_array_elements_text(COALESCE(_ref->'emails', '[]'::jsonb));
    WITH candidates AS (
      SELECT DISTINCT lower(trim(e)) AS email FROM unnest(_emails) e WHERE e IS NOT NULL AND trim(e) <> ''
    ), suppressed AS (
      SELECT count(*)::int AS cnt FROM candidates c
      JOIN public.email_suppression_list s ON s.tenant_id = _tenant_id AND lower(s.email) = c.email
        AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT (SELECT count(*)::int FROM candidates), (SELECT cnt FROM suppressed) INTO _total, _suppressed;
    RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
  END IF;

  -- all / filters / custom / segment all use filter-based resolution
  _integration_id := NULLIF(_filters->>'integration_id', '')::uuid;
  IF jsonb_typeof(_filters->'tag_ids') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[]) INTO _tag_ids FROM jsonb_array_elements_text(_filters->'tag_ids');
  ELSE _tag_ids := NULL; END IF;
  _name_contains := NULLIF(_filters->>'name_contains', '');
  _email_contains := NULLIF(_filters->>'email_contains', '');
  _phone_contains := NULLIF(_filters->>'phone_contains', '');
  _doc_contains := NULLIF(_filters->>'doc_contains', '');
  _updated_from := NULLIF(_filters->>'updated_from', '')::timestamptz;
  _updated_to := NULLIF(_filters->>'updated_to', '')::timestamptz;

  WITH candidates AS (
    SELECT DISTINCT lower(c.email) AS email FROM public.li_customers c
    WHERE c.tenant_id = _tenant_id AND c.email IS NOT NULL
      AND (_integration_id IS NULL OR c.integration_id = _integration_id)
      AND (_name_contains IS NULL OR c.name ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR c.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR c.phone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR c.doc ILIKE '%' || _doc_contains || '%')
      AND (_updated_from IS NULL OR c.updated_at_local >= _updated_from)
      AND (_updated_to IS NULL OR c.updated_at_local <= _updated_to)
      AND (_tag_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.customer_tags ct WHERE ct.tenant_id = _tenant_id AND ct.customer_id = c.id AND ct.tag_id = ANY(_tag_ids)
      ))
    UNION
    SELECT DISTINCT lower(bc.email) AS email FROM public.bling_customers bc
    WHERE bc.tenant_id = _tenant_id AND bc.email IS NOT NULL
      AND (_integration_id IS NULL OR bc.integration_id = _integration_id)
      AND (_name_contains IS NULL OR bc.nome ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR bc.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR bc.celular ILIKE '%' || _phone_contains || '%' OR bc.telefone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR bc.cpf_cnpj ILIKE '%' || _doc_contains || '%')
  ), suppressed AS (
    SELECT count(*)::int AS cnt FROM candidates cand
    JOIN public.email_suppression_list s ON s.tenant_id = _tenant_id AND lower(s.email) = cand.email
      AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
  )
  SELECT (SELECT count(*)::int FROM candidates), (SELECT cnt FROM suppressed) INTO _total, _suppressed;

  RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
END;
$function$-- RLS policy for customer_rfm_snapshots (was missing, causing data exposure/access failure)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customer_rfm_snapshots' AND policyname = 'tenant_rfm_snapshots_select'
  ) THEN
    CREATE POLICY "tenant_rfm_snapshots_select"
      ON public.customer_rfm_snapshots
      FOR SELECT
      TO authenticated
      USING (
        integration_id IN (
          SELECT id FROM public.integrations
          WHERE tenant_id = public.get_user_tenant_id(auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customer_rfm_snapshots' AND policyname = 'service_rfm_snapshots_all'
  ) THEN
    CREATE POLICY "service_rfm_snapshots_all"
      ON public.customer_rfm_snapshots
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Restrict sensitive credential reads to admins only
-- email_integrations: restrict SELECT on sensitive fields via policy update
DO $$
BEGIN
  -- Drop overly broad policies if they exist and replace with admin-only for sensitive tables
  -- We add restrictive policies alongside existing ones using is_tenant_admin check

  -- email_integrations - only admins can read (contains smtp_password)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'email_integrations' AND policyname = 'admin_only_email_integrations_select'
  ) THEN
    -- First drop the permissive select if it allows all members
    -- We use a conditional approach: add a restrictive policy
    CREATE POLICY "admin_only_email_integrations_select"
      ON public.email_integrations
      FOR SELECT
      TO authenticated
      USING (
        public.is_tenant_admin(auth.uid(), tenant_id)
      );
  END IF;

  -- bling_connections - only admins can read (contains access_token/refresh_token)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bling_connections' AND policyname = 'admin_only_bling_connections_select'
  ) THEN
    CREATE POLICY "admin_only_bling_connections_select"
      ON public.bling_connections
      FOR SELECT
      TO authenticated
      USING (
        public.is_tenant_admin(auth.uid(), tenant_id)
      );
  END IF;

  -- tenant_ai_credentials - only admins can read (contains API keys)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tenant_ai_credentials' AND policyname = 'admin_only_ai_credentials_select'
  ) THEN
    CREATE POLICY "admin_only_ai_credentials_select"
      ON public.tenant_ai_credentials
      FOR SELECT
      TO authenticated
      USING (
        public.is_tenant_admin(auth.uid(), tenant_id)
      );
  END IF;
END $$;
-- Remove permissive SELECT policies that override admin-only restrictions on sensitive tables

-- bling_connections: drop the public/broad SELECT policy
DROP POLICY IF EXISTS "Users can view their tenant's bling connections" ON public.bling_connections;

-- email_integrations: drop the broad authenticated SELECT policy
DROP POLICY IF EXISTS "Tenant members can view email_integrations" ON public.email_integrations;

-- tenant_ai_credentials: drop the broad SELECT policy
DROP POLICY IF EXISTS "Tenants can view their own AI credentials" ON public.tenant_ai_credentials;
ALTER TABLE public.email_integrations 
  ADD COLUMN IF NOT EXISTS smtp_secure BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS smtp_tls BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS reply_to TEXT;ALTER TABLE public.email_integrations ADD COLUMN IF NOT EXISTS sender_name text;
-- 1. Create email_integration_senders table
CREATE TABLE public.email_integration_senders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.email_integrations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_integration_senders_integration ON public.email_integration_senders(integration_id);
CREATE INDEX idx_email_integration_senders_tenant ON public.email_integration_senders(tenant_id);

ALTER TABLE public.email_integration_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for email_integration_senders"
  ON public.email_integration_senders
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- 2. Add email_integration_id to email_campaigns
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS email_integration_id UUID REFERENCES public.email_integrations(id);

-- 3. Add sender_email to email_campaign_logs
ALTER TABLE public.email_campaign_logs
  ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE public.email_integrations
  ADD COLUMN IF NOT EXISTS daily_send_limit integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_sends_per_second integer DEFAULT NULL;
-- Helper function to store CRON_SECRET in vault (called once from edge function)
CREATE OR REPLACE FUNCTION public.store_cron_secret(_secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'CRON_SECRET';
  PERFORM vault.create_secret(_secret, 'CRON_SECRET', 'Used by pg_cron jobs for internal auth');
END;
$$;

-- Helper function to build auth headers for cron jobs (reads from vault at execution time)
CREATE OR REPLACE FUNCTION public.get_internal_headers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
      'missing-cron-secret'
    )
  );
$$;

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

-- Store the encryption passphrase in vault for server-side use only
SELECT vault.create_secret('__auto_generated_placeholder__', 'TENANT_DATA_ENCRYPTION_KEY', 'Symmetric key for encrypting tenant secrets at rest');

-- Helper: encrypt text using pgcrypto PGP symmetric encryption
-- Uses the key from vault, so it NEVER leaves the database
CREATE OR REPLACE FUNCTION public.encrypt_secret(_plaintext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _key text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'TENANT_DATA_ENCRYPTION_KEY'
  LIMIT 1;
  
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in vault';
  END IF;
  
  RETURN encode(pgcrypto.pgp_sym_encrypt(_plaintext, _key), 'base64');
END;
$$;

-- Helper: decrypt text using pgcrypto PGP symmetric encryption
CREATE OR REPLACE FUNCTION public.decrypt_secret(_ciphertext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _key text;
BEGIN
  IF _ciphertext IS NULL OR _ciphertext = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'TENANT_DATA_ENCRYPTION_KEY'
  LIMIT 1;
  
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in vault';
  END IF;
  
  RETURN pgcrypto.pgp_sym_decrypt(decode(_ciphertext, 'base64'), _key);
END;
$$;

-- Helper: mask a secret for display (show only last 4 chars)
CREATE OR REPLACE FUNCTION public.mask_secret(_plaintext text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _plaintext IS NULL OR length(_plaintext) < 5 THEN '••••••••'
    ELSE '••••••••' || right(_plaintext, 4)
  END;
$$;

-- Use security definer function to update the vault key
CREATE OR REPLACE FUNCTION public._init_encryption_key()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'TENANT_DATA_ENCRYPTION_KEY';
  PERFORM vault.create_secret(
    encode(extensions.gen_random_bytes(32), 'hex'), 
    'TENANT_DATA_ENCRYPTION_KEY', 
    'Symmetric key for encrypting tenant secrets at rest'
  );
END;
$$;

SELECT public._init_encryption_key();
DROP FUNCTION public._init_encryption_key();

-- Add encrypted columns for Bling
ALTER TABLE public.bling_connections ADD COLUMN IF NOT EXISTS access_token_encrypted text;
ALTER TABLE public.bling_connections ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

-- Add encrypted columns for Melhor Envio
ALTER TABLE public.melhor_envio_tokens ADD COLUMN IF NOT EXISTS access_token_encrypted text;
ALTER TABLE public.melhor_envio_tokens ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

-- Add encrypted column for SMTP
ALTER TABLE public.email_integrations ADD COLUMN IF NOT EXISTS smtp_password_encrypted text;

-- Fix encrypt_secret and decrypt_secret to use correct schema for pgcrypto
CREATE OR REPLACE FUNCTION public.encrypt_secret(_plaintext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _key text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'TENANT_DATA_ENCRYPTION_KEY'
  LIMIT 1;
  
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in vault';
  END IF;
  
  RETURN encode(extensions.pgp_sym_encrypt(_plaintext, _key), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_secret(_ciphertext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _key text;
BEGIN
  IF _ciphertext IS NULL OR _ciphertext = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'TENANT_DATA_ENCRYPTION_KEY'
  LIMIT 1;
  
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in vault';
  END IF;
  
  RETURN extensions.pgp_sym_decrypt(decode(_ciphertext, 'base64'), _key);
END;
$$;

-- Migrate existing btoa-encoded AI credentials to real encryption
DO $$
DECLARE
  _row RECORD;
  _decoded text;
BEGIN
  FOR _row IN SELECT id, api_key_encrypted FROM public.tenant_ai_credentials 
    WHERE api_key_encrypted IS NOT NULL AND api_key_encrypted != ''
  LOOP
    BEGIN
      _decoded := convert_from(decode(_row.api_key_encrypted, 'base64'), 'UTF8');
      UPDATE public.tenant_ai_credentials 
      SET api_key_encrypted = public.encrypt_secret(_decoded)
      WHERE id = _row.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping credential %: %', _row.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Encrypt existing Bling tokens
UPDATE public.bling_connections
SET access_token_encrypted = public.encrypt_secret(access_token),
    refresh_token_encrypted = public.encrypt_secret(refresh_token)
WHERE access_token IS NOT NULL AND access_token != ''
  AND (access_token_encrypted IS NULL OR access_token_encrypted = '');

-- Encrypt existing Melhor Envio tokens
UPDATE public.melhor_envio_tokens
SET access_token_encrypted = public.encrypt_secret(access_token),
    refresh_token_encrypted = public.encrypt_secret(refresh_token)
WHERE access_token IS NOT NULL AND access_token != ''
  AND (access_token_encrypted IS NULL OR access_token_encrypted = '');

-- Encrypt existing SMTP passwords
UPDATE public.email_integrations
SET smtp_password_encrypted = public.encrypt_secret(smtp_password)
WHERE smtp_password IS NOT NULL AND smtp_password != ''
  AND (smtp_password_encrypted IS NULL OR smtp_password_encrypted = '');

-- Remove API keys from integrations.metadata (was exposed via RLS to non-admin members)
UPDATE public.integrations
SET metadata = metadata - 'api_key_encrypted'
WHERE type LIKE 'ai_%' AND metadata ? 'api_key_encrypted';

-- Auto-encrypt smtp_password on insert/update via trigger
CREATE OR REPLACE FUNCTION public.encrypt_email_smtp_password()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Only encrypt if smtp_password changed and is not empty
  IF NEW.smtp_password IS NOT NULL AND NEW.smtp_password != '' THEN
    -- Only re-encrypt if password actually changed
    IF OLD IS NULL OR NEW.smtp_password IS DISTINCT FROM OLD.smtp_password THEN
      NEW.smtp_password_encrypted := public.encrypt_secret(NEW.smtp_password);
      -- Clear plaintext after encryption (transition: keep for now)
      -- NEW.smtp_password := ''; -- uncomment after full migration
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_email_smtp_password
  BEFORE INSERT OR UPDATE ON public.email_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_email_smtp_password();

-- Auto-encrypt bling tokens on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_bling_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_bling_tokens
  BEFORE INSERT OR UPDATE ON public.bling_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_bling_tokens();

-- Auto-encrypt melhor envio tokens on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_melhor_envio_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_melhor_envio_tokens
  BEFORE INSERT OR UPDATE ON public.melhor_envio_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_melhor_envio_tokens();

-- Auto-encrypt AI credentials on insert/update (prevents btoa bypass from frontend)
CREATE OR REPLACE FUNCTION public.encrypt_ai_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _test text;
BEGIN
  IF NEW.api_key_encrypted IS NOT NULL AND NEW.api_key_encrypted != '' THEN
    -- Check if already encrypted (pgcrypto produces specific header bytes)
    BEGIN
      _test := public.decrypt_secret(NEW.api_key_encrypted);
      -- If decryption succeeds, it's already encrypted — leave it
    EXCEPTION WHEN OTHERS THEN
      -- Not encrypted yet (probably btoa or plaintext) — encrypt it
      BEGIN
        -- Try to decode as base64 first (btoa legacy)
        NEW.api_key_encrypted := public.encrypt_secret(
          convert_from(decode(NEW.api_key_encrypted, 'base64'), 'UTF8')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Not valid base64, treat as plaintext
        NEW.api_key_encrypted := public.encrypt_secret(NEW.api_key_encrypted);
      END;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_ai_credentials
  BEFORE INSERT OR UPDATE ON public.tenant_ai_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_ai_credentials();
-- Step 1: Update encryption triggers to clear plaintext after encryption

-- Bling tokens trigger: clear plaintext after encrypting
CREATE OR REPLACE FUNCTION public.encrypt_bling_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
      NEW.access_token := ''; -- Clear plaintext
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
      NEW.refresh_token := ''; -- Clear plaintext
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Email SMTP password trigger: clear plaintext after encrypting
CREATE OR REPLACE FUNCTION public.encrypt_email_smtp_password()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.smtp_password IS NOT NULL AND NEW.smtp_password != '' THEN
    IF OLD IS NULL OR NEW.smtp_password IS DISTINCT FROM OLD.smtp_password THEN
      NEW.smtp_password_encrypted := public.encrypt_secret(NEW.smtp_password);
      NEW.smtp_password := ''; -- Clear plaintext
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Melhor Envio tokens trigger: clear plaintext after encrypting
CREATE OR REPLACE FUNCTION public.encrypt_melhor_envio_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
      NEW.access_token := ''; -- Clear plaintext
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
      NEW.refresh_token := ''; -- Clear plaintext
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Step 2: Clear any existing plaintext data (encrypt first if not already done)
-- Bling connections: encrypt existing plaintext tokens then clear
UPDATE bling_connections
SET 
  access_token_encrypted = CASE 
    WHEN access_token_encrypted IS NULL AND access_token != '' THEN public.encrypt_secret(access_token)
    ELSE access_token_encrypted
  END,
  refresh_token_encrypted = CASE 
    WHEN refresh_token_encrypted IS NULL AND refresh_token != '' THEN public.encrypt_secret(refresh_token)
    ELSE refresh_token_encrypted
  END,
  access_token = '',
  refresh_token = ''
WHERE access_token != '' OR refresh_token != '';

-- Email integrations: encrypt existing plaintext passwords then clear
UPDATE email_integrations
SET 
  smtp_password_encrypted = CASE 
    WHEN smtp_password_encrypted IS NULL AND smtp_password != '' THEN public.encrypt_secret(smtp_password)
    ELSE smtp_password_encrypted
  END,
  smtp_password = ''
WHERE smtp_password IS NOT NULL AND smtp_password != '';

-- Melhor Envio tokens: encrypt existing plaintext tokens then clear
UPDATE melhor_envio_tokens
SET 
  access_token_encrypted = CASE 
    WHEN access_token_encrypted IS NULL AND access_token != '' THEN public.encrypt_secret(access_token)
    ELSE access_token_encrypted
  END,
  refresh_token_encrypted = CASE 
    WHEN refresh_token_encrypted IS NULL AND refresh_token != '' THEN public.encrypt_secret(refresh_token)
    ELSE refresh_token_encrypted
  END,
  access_token = '',
  refresh_token = ''
WHERE access_token != '' OR refresh_token != '';CREATE OR REPLACE FUNCTION public.delete_account_data(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id uuid;
  _logs text[] := ARRAY[]::text[];
BEGIN
  SELECT id INTO _tenant_id
  FROM public.tenants
  WHERE owner_id = _user_id;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', _user_id;
  END IF;

  _logs := array_append(_logs, 'Iniciando exclusão transacional...');

  DELETE FROM public.member_permissions
  WHERE team_member_id IN (
    SELECT id FROM public.team_members WHERE user_id = _user_id AND tenant_id != _tenant_id
  );
  DELETE FROM public.team_members WHERE user_id = _user_id AND tenant_id != _tenant_id;
  _logs := array_append(_logs, 'Removido de equipes externas');

  DELETE FROM public.bling_webhook_events WHERE tenant_id = _tenant_id;
  _logs := array_append(_logs, 'Webhook events limpos');

  DELETE FROM public.ai_assistant_configs 
  WHERE default_ai_agent_id IN (SELECT id FROM public.ai_agents WHERE tenant_id = _tenant_id);
  _logs := array_append(_logs, 'AI configs limpos');

  DELETE FROM public.tenants WHERE id = _tenant_id;
  _logs := array_append(_logs, 'Tenant e dados cascateados excluídos');

  DELETE FROM public.profiles WHERE user_id = _user_id;
  _logs := array_append(_logs, 'Perfil excluído');

  DELETE FROM public.oauth_states WHERE user_id = _user_id;

  _logs := array_append(_logs, '✅ Dados excluídos com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', _tenant_id,
    'logs', to_jsonb(_logs)
  );
END;
$function$
-- Table for pending team invitations
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  permissions jsonb DEFAULT '[]'::jsonb,
  invite_token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

-- Index for token lookup
CREATE INDEX idx_team_invites_token ON public.team_invites(invite_token);
CREATE INDEX idx_team_invites_tenant ON public.team_invites(tenant_id);

-- RLS
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Admins can view/manage invites for their tenant
CREATE POLICY "Admins can view tenant invites"
  ON public.team_invites FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can create invites"
  ON public.team_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can update invites"
  ON public.team_invites FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can delete invites"
  ON public.team_invites FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- Dead Letter Queue (unified for all channels)
CREATE TABLE public.dead_letter_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_queue TEXT NOT NULL, -- 'outbound_queue', 'instagram_outbox', etc.
  source_item_id UUID NOT NULL,
  channel_type TEXT NOT NULL, -- 'whatsapp', 'instagram', etc.
  channel_id UUID,
  destination TEXT NOT NULL, -- phone number or IGSID
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  correlation_id TEXT,
  metadata JSONB,
  status TEXT NOT NULL DEFAULT 'dead', -- 'dead', 'retried', 'discarded'
  retried_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_dead_letter_queue_tenant ON public.dead_letter_queue(tenant_id);
CREATE INDEX idx_dead_letter_queue_status ON public.dead_letter_queue(status);
CREATE INDEX idx_dead_letter_queue_source ON public.dead_letter_queue(source_queue);
CREATE INDEX idx_dead_letter_queue_correlation ON public.dead_letter_queue(correlation_id);

ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view dead letters"
  ON public.dead_letter_queue FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- Circuit Breaker State
CREATE TABLE public.circuit_breaker_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL, -- 'evolution', 'meta', 'bling', 'melhor_envio'
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'closed', -- 'closed', 'open', 'half_open'
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_failure_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  opened_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider, tenant_id)
);

CREATE INDEX idx_circuit_breaker_tenant ON public.circuit_breaker_state(tenant_id);
CREATE INDEX idx_circuit_breaker_state ON public.circuit_breaker_state(state);

ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view circuit breaker state"
  ON public.circuit_breaker_state FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- Function metrics tracking
CREATE TABLE public.function_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  correlation_id TEXT,
  status TEXT NOT NULL DEFAULT 'ok', -- 'ok', 'error'
  duration_ms INTEGER,
  items_processed INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  items_dead INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_function_metrics_name ON public.function_metrics(function_name);
CREATE INDEX idx_function_metrics_created ON public.function_metrics(created_at);
CREATE INDEX idx_function_metrics_tenant ON public.function_metrics(tenant_id);
CREATE INDEX idx_function_metrics_status ON public.function_metrics(status);

ALTER TABLE public.function_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view function metrics"
  ON public.function_metrics FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL OR public.is_tenant_admin(auth.uid(), tenant_id)
  );
ALTER TABLE public.oauth_states ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;ALTER TABLE public.team_invites ADD COLUMN IF NOT EXISTS invite_token_hash text;
CREATE INDEX IF NOT EXISTS idx_team_invites_token_hash ON public.team_invites (invite_token_hash) WHERE invite_token_hash IS NOT NULL;-- Drop plaintext index
DROP INDEX IF EXISTS idx_team_invites_token;

-- Remove UNIQUE constraint on invite_token (it was created via UNIQUE keyword on column)
ALTER TABLE public.team_invites DROP CONSTRAINT IF EXISTS team_invites_invite_token_key;

-- Clear any remaining plaintext tokens
UPDATE public.team_invites SET invite_token = '' WHERE invite_token != '';

-- Add NOT NULL + UNIQUE to hash column for future integrity
ALTER TABLE public.team_invites ALTER COLUMN invite_token SET DEFAULT '';
ALTER TABLE public.team_invites ADD CONSTRAINT team_invites_invite_token_hash_unique UNIQUE (invite_token_hash);CREATE OR REPLACE FUNCTION public.delete_account_data(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owned_tenant_id uuid;
  _is_owner boolean := false;
  _logs text[] := ARRAY[]::text[];
BEGIN
  -- Check if user owns a tenant
  SELECT id INTO _owned_tenant_id
  FROM public.tenants
  WHERE owner_id = _user_id;

  _is_owner := (_owned_tenant_id IS NOT NULL);

  _logs := array_append(_logs, 'Iniciando exclusão transacional...');

  -- =========================================================
  -- STEP 1: Always remove memberships in OTHER tenants
  -- =========================================================
  IF _is_owner THEN
    -- Owner: remove from teams they don't own
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (
      SELECT id FROM public.team_members
      WHERE user_id = _user_id AND tenant_id != _owned_tenant_id
    );
    DELETE FROM public.team_members
    WHERE user_id = _user_id AND tenant_id != _owned_tenant_id;
    _logs := array_append(_logs, 'Removido de equipes externas');
  ELSE
    -- Member-only: remove from ALL teams
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (
      SELECT id FROM public.team_members WHERE user_id = _user_id
    );
    DELETE FROM public.team_members WHERE user_id = _user_id;
    _logs := array_append(_logs, 'Removido de todas as equipes');
  END IF;

  -- =========================================================
  -- STEP 2: If owner, delete the owned tenant (CASCADE handles 90+ tables)
  -- =========================================================
  IF _is_owner THEN
    DELETE FROM public.bling_webhook_events WHERE tenant_id = _owned_tenant_id;
    _logs := array_append(_logs, 'Webhook events limpos');

    DELETE FROM public.ai_assistant_configs 
    WHERE default_ai_agent_id IN (
      SELECT id FROM public.ai_agents WHERE tenant_id = _owned_tenant_id
    );
    _logs := array_append(_logs, 'AI configs limpos');

    DELETE FROM public.tenants WHERE id = _owned_tenant_id;
    _logs := array_append(_logs, 'Tenant e dados cascateados excluídos');
  END IF;

  -- =========================================================
  -- STEP 3: Always clean up profile and oauth
  -- =========================================================
  DELETE FROM public.profiles WHERE user_id = _user_id;
  _logs := array_append(_logs, 'Perfil excluído');

  DELETE FROM public.oauth_states WHERE user_id = _user_id;

  _logs := array_append(_logs, '✅ Dados excluídos com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'was_owner', _is_owner,
    'tenant_id', _owned_tenant_id,
    'logs', to_jsonb(_logs)
  );
END;
$function$;CREATE OR REPLACE FUNCTION public.leave_team_memberships(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _removed_count integer := 0;
  _logs text[] := ARRAY[]::text[];
BEGIN
  _logs := array_append(_logs, 'Removendo participações em equipes...');

  -- Remove permissions first
  DELETE FROM public.member_permissions
  WHERE team_member_id IN (
    SELECT id FROM public.team_members WHERE user_id = _user_id
  );

  -- Remove team memberships
  WITH deleted AS (
    DELETE FROM public.team_members WHERE user_id = _user_id RETURNING id
  )
  SELECT count(*) INTO _removed_count FROM deleted;

  _logs := array_append(_logs, format('Removido de %s equipe(s)', _removed_count));
  _logs := array_append(_logs, '✅ Saiu de todas as equipes com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'removed_count', _removed_count,
    'logs', to_jsonb(_logs)
  );
END;
$function$;-- Migrate existing plaintext ME tokens to encrypted columns and clear plaintext
-- Only processes rows that have plaintext but no encrypted version
DO $$
DECLARE
  _rec RECORD;
  _enc_access TEXT;
  _enc_refresh TEXT;
  _migrated INT := 0;
BEGIN
  FOR _rec IN
    SELECT id, access_token, refresh_token
    FROM public.melhor_envio_tokens
    WHERE (access_token IS NOT NULL AND access_token != '' AND (access_token_encrypted IS NULL OR access_token_encrypted = ''))
       OR (refresh_token IS NOT NULL AND refresh_token != '' AND (refresh_token_encrypted IS NULL OR refresh_token_encrypted = ''))
  LOOP
    _enc_access := NULL;
    _enc_refresh := NULL;

    IF _rec.access_token IS NOT NULL AND _rec.access_token != '' THEN
      _enc_access := public.encrypt_secret(_rec.access_token);
    END IF;

    IF _rec.refresh_token IS NOT NULL AND _rec.refresh_token != '' THEN
      _enc_refresh := public.encrypt_secret(_rec.refresh_token);
    END IF;

    UPDATE public.melhor_envio_tokens
    SET access_token = '',
        refresh_token = '',
        access_token_encrypted = COALESCE(_enc_access, access_token_encrypted),
        refresh_token_encrypted = COALESCE(_enc_refresh, refresh_token_encrypted),
        updated_at = now()
    WHERE id = _rec.id;

    _migrated := _migrated + 1;
  END LOOP;

  RAISE NOTICE 'Migrated % melhor_envio_tokens records to encrypted storage', _migrated;
END $$;
-- ============================================================
-- Backfill CREATE TABLE IF NOT EXISTS for 7 tables that exist
-- in production but had no migration-tracked DDL.
-- This brings FULL_MIGRATION.sql in sync with types.ts.
-- ============================================================

-- Enums (IF NOT EXISTS via DO block)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_campaign_status') THEN
    CREATE TYPE public.email_campaign_status AS ENUM ('draft','scheduled','sending','sent','paused','canceled','error');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_campaign_type') THEN
    CREATE TYPE public.email_campaign_type AS ENUM ('newsletter','promotion','relationship','automation','update');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_template_type') THEN
    CREATE TYPE public.email_template_type AS ENUM ('newsletter','promotional','reactivation','launch','relationship');
  END IF;
END $$;

-- 1. cashback_configs
CREATE TABLE IF NOT EXISTS public.cashback_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  integration_name TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Cashback',
  discount_percentage NUMERIC NOT NULL DEFAULT 5,
  coupon_duration_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT false,
  min_purchase_value NUMERIC DEFAULT NULL,
  max_discount_value NUMERIC DEFAULT NULL,
  trigger_statuses TEXT[] DEFAULT '{}',
  webhook_url TEXT DEFAULT NULL,
  send_via_whatsapp BOOLEAN DEFAULT true,
  send_via_email BOOLEAN DEFAULT false,
  whatsapp_integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  email_subject TEXT DEFAULT NULL,
  email_body_html TEXT DEFAULT NULL,
  email_body_text TEXT DEFAULT NULL,
  message_template TEXT DEFAULT NULL,
  reminder_1_enabled BOOLEAN DEFAULT false,
  reminder_1_days_before INTEGER DEFAULT NULL,
  reminder_1_message TEXT DEFAULT NULL,
  reminder_2_enabled BOOLEAN DEFAULT false,
  reminder_2_days_before INTEGER DEFAULT NULL,
  reminder_2_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cashback_configs ENABLE ROW LEVEL SECURITY;

-- 2. generated_coupons
CREATE TABLE IF NOT EXISTS public.generated_coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.cashback_configs(id) ON DELETE SET NULL,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  coupon_code TEXT NOT NULL,
  coupon_type TEXT DEFAULT NULL,
  coupon_value NUMERIC DEFAULT NULL,
  coupon_description TEXT DEFAULT NULL,
  discount_percentage NUMERIC NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  customer_name TEXT DEFAULT NULL,
  customer_email TEXT DEFAULT NULL,
  customer_phone TEXT DEFAULT NULL,
  customer_cpf TEXT DEFAULT NULL,
  order_id TEXT DEFAULT NULL,
  source TEXT DEFAULT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_in_order_id TEXT DEFAULT NULL,
  used_order_value NUMERIC DEFAULT NULL,
  li_coupon_id BIGINT DEFAULT NULL,
  li_data_inicio TEXT DEFAULT NULL,
  li_data_fim TEXT DEFAULT NULL,
  li_quantidade_uso_maximo INTEGER DEFAULT NULL,
  li_quantidade_usada INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_coupons ENABLE ROW LEVEL SECURITY;

-- 3. email_templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  template_type public.email_template_type NOT NULL DEFAULT 'newsletter',
  content_html TEXT DEFAULT NULL,
  content_json JSONB DEFAULT NULL,
  thumbnail_url TEXT DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- 4. email_campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  internal_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  reply_to TEXT DEFAULT NULL,
  preheader TEXT DEFAULT NULL,
  campaign_type public.email_campaign_type NOT NULL DEFAULT 'newsletter',
  status public.email_campaign_status NOT NULL DEFAULT 'draft',
  content_html TEXT DEFAULT NULL,
  content_json JSONB DEFAULT NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  email_integration_id UUID REFERENCES public.email_integrations(id) ON DELETE SET NULL,
  audience_type TEXT DEFAULT NULL,
  audience_reference TEXT DEFAULT NULL,
  has_unsubscribe_link BOOLEAN DEFAULT true,
  compliance_checked_at TIMESTAMPTZ DEFAULT NULL,
  scheduled_at TIMESTAMPTZ DEFAULT NULL,
  started_at TIMESTAMPTZ DEFAULT NULL,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  completed_at TIMESTAMPTZ DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  total_recipients INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_complained INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- 5. email_campaign_logs
CREATE TABLE IF NOT EXISTS public.email_campaign_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT DEFAULT NULL,
  recipient_name TEXT DEFAULT NULL,
  sender_email TEXT DEFAULT NULL,
  status TEXT DEFAULT 'pending',
  event_type TEXT NOT NULL DEFAULT 'send',
  event_data JSONB DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  is_test BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaign_logs ENABLE ROW LEVEL SECURITY;

-- 6. email_events
CREATE TABLE IF NOT EXISTS public.email_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  log_id UUID REFERENCES public.email_campaign_logs(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  link_url TEXT DEFAULT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- 7. email_suppression_list
CREATE TABLE IF NOT EXISTS public.email_suppression_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribed',
  source TEXT DEFAULT NULL,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

-- RLS policies for all 7 tables (tenant-scoped)
CREATE POLICY "Tenant isolation" ON public.cashback_configs FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.generated_coupons FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_templates FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_campaigns FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_campaign_logs FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_events FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant isolation" ON public.email_suppression_list FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cashback_configs_tenant ON public.cashback_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_coupons_tenant ON public.generated_coupons(tenant_id);
CREATE INDEX IF NOT EXISTS idx_generated_coupons_config ON public.generated_coupons(config_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON public.email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_tenant ON public.email_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_tenant ON public.email_campaign_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_logs_campaign ON public.email_campaign_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_tenant ON public.email_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON public.email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_suppression_tenant ON public.email_suppression_list(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_suppression_email ON public.email_suppression_list(tenant_id, email);

-- Backfill migration: formalize columns that exist in production but were missing from migration history
-- These columns are already in the live database (reflected in types.ts) but had no corresponding DDL.

-- ai_agents: verification_type
ALTER TABLE public.ai_agents
ADD COLUMN IF NOT EXISTS verification_type TEXT DEFAULT NULL;

-- email_integrations: sender_name
ALTER TABLE public.email_integrations
ADD COLUMN IF NOT EXISTS sender_name TEXT DEFAULT NULL;

-- profiles: checklist_dismissed, notification_prefs, onboarding_completed
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS checklist_dismissed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- team_invites: invite_token_hash
ALTER TABLE public.team_invites
ADD COLUMN IF NOT EXISTS invite_token_hash TEXT DEFAULT NULL;

-- tenant_ai_credentials: is_default
ALTER TABLE public.tenant_ai_credentials
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
