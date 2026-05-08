
-- Fix 1: Add missing values to instagram_outbox_status enum
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'retry';
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'sending';
ALTER TYPE instagram_outbox_status ADD VALUE IF NOT EXISTS 'dead';

-- Fix 2: Add missing values to instagram_message_direction enum
ALTER TYPE instagram_message_direction ADD VALUE IF NOT EXISTS 'inbound';
ALTER TYPE instagram_message_direction ADD VALUE IF NOT EXISTS 'outbound';
