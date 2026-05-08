-- Create auto_messages table
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
EXECUTE FUNCTION public.update_updated_at_column();