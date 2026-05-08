-- Add column to track when we're awaiting phone input from LID contacts
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS awaiting_phone_input BOOLEAN DEFAULT false;