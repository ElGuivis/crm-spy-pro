-- Enable REPLICA IDENTITY FULL for real-time updates with complete row data
ALTER TABLE li_sync_logs REPLICA IDENTITY FULL;

-- Add table to supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE li_sync_logs;