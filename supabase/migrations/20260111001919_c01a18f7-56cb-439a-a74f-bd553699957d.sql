-- Enable full replica identity for li_orders to get complete data in realtime updates
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
END $$;