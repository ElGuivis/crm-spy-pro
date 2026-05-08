-- Create kanban_columns table
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
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_columns;