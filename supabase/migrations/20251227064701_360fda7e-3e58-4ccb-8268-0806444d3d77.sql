
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
