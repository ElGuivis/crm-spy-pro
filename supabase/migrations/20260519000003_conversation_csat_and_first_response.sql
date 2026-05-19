-- Add first_response_at, csat columns to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS csat_score SMALLINT CHECK (csat_score BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS csat_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS csat_token UUID DEFAULT gen_random_uuid();

-- Unique index for csat_token lookups (public endpoint uses this)
CREATE UNIQUE INDEX IF NOT EXISTS conversations_csat_token_idx ON conversations (csat_token);

-- Trigger: record timestamp of first human agent reply per conversation
CREATE OR REPLACE FUNCTION public.set_first_response_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'agent' THEN
    UPDATE conversations
    SET first_response_at = NEW.created_at
    WHERE id = NEW.conversation_id
    AND first_response_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_first_response_at ON messages;
CREATE TRIGGER trg_set_first_response_at
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_first_response_at();
