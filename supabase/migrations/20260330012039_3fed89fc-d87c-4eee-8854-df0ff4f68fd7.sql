ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS bot_locked_until timestamptz DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.try_acquire_bot_lock(_conversation_id uuid, _lock_seconds integer DEFAULT 30)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _acquired boolean;
BEGIN
  UPDATE public.conversations
  SET bot_locked_until = now() + (_lock_seconds || ' seconds')::interval
  WHERE id = _conversation_id
    AND (bot_locked_until IS NULL OR bot_locked_until < now())
  RETURNING true INTO _acquired;
  
  RETURN COALESCE(_acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_bot_lock(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversations
  SET bot_locked_until = NULL
  WHERE id = _conversation_id;
END;
$$;