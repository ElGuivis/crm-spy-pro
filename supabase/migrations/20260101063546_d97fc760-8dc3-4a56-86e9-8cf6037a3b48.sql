-- Create quick_replies table
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
EXECUTE FUNCTION public.update_updated_at_column();