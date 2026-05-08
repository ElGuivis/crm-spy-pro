-- Corrigir search_path das funções criadas
CREATE OR REPLACE FUNCTION public.add_message_to_buffer(
  _conversation_id UUID,
  _message_id TEXT,
  _delay_seconds INTEGER DEFAULT 3
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.conversations
  SET 
    buffered_message_ids = array_append(
      COALESCE(buffered_message_ids, ARRAY[]::TEXT[]), 
      _message_id
    ),
    pending_ai_response_at = COALESCE(
      pending_ai_response_at,
      NOW() + (_delay_seconds || ' seconds')::INTERVAL
    ),
    updated_at = NOW()
  WHERE id = _conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.clear_message_buffer(
  _conversation_id UUID
)
RETURNS TEXT[] AS $$
DECLARE
  _buffered_ids TEXT[];
BEGIN
  UPDATE public.conversations
  SET 
    buffered_message_ids = ARRAY[]::TEXT[],
    pending_ai_response_at = NULL,
    updated_at = NOW()
  WHERE id = _conversation_id
  RETURNING buffered_message_ids INTO _buffered_ids;
  
  RETURN _buffered_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.map_evolution_status(status TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE UPPER(status)
    WHEN 'PENDING' THEN 'pending'
    WHEN 'SENT' THEN 'sent'
    WHEN 'DELIVERY_ACK' THEN 'delivered'
    WHEN 'READ' THEN 'read'
    WHEN 'PLAYED' THEN 'read'
    WHEN 'FAILED' THEN 'failed'
    WHEN 'ERROR' THEN 'failed'
    ELSE LOWER(COALESCE(status, 'unknown'))
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;