-- Add human_transfer_column_id to ai_agents table
ALTER TABLE public.ai_agents 
ADD COLUMN human_transfer_column_id uuid REFERENCES public.kanban_columns(id) ON DELETE SET NULL;

-- Add target_column_id to interactive_buttons jsonb structure (no migration needed, just documentation)
-- The interactive_buttons column already stores JSONB, we'll add target_column_id to button objects when action = 'transfer_to_human'

COMMENT ON COLUMN public.ai_agents.human_transfer_column_id IS 'Kanban column to move conversation when customer requests human transfer via keywords';