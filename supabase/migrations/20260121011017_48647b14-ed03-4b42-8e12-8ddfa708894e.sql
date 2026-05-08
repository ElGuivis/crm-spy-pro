-- =============================================================================
-- CORREÇÕES DO MÓDULO DE ATENDIMENTO
-- =============================================================================

-- 1. Adicionar campo last_incoming_message_id para rastrear última mensagem recebida (necessário para replies LID)
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_incoming_message_id TEXT;

-- 2. Índice para performance de last_incoming_message_id
CREATE INDEX IF NOT EXISTS idx_conversations_last_incoming_message 
ON public.conversations(last_incoming_message_id) 
WHERE last_incoming_message_id IS NOT NULL;

-- 3. Índice para ordenação de conversas por última mensagem
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at_desc 
ON public.conversations(tenant_id, last_message_at DESC NULLS LAST);

-- 4. Função atômica para adicionar mensagem ao buffer (evita race condition)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função para limpar buffer de mensagens (usada após processar)
CREATE OR REPLACE FUNCTION public.clear_message_buffer(
  _conversation_id UUID
)
RETURNS TEXT[] AS $$
DECLARE
  _buffered_ids TEXT[];
BEGIN
  -- Pegar os IDs atuais e limpar atomicamente
  UPDATE public.conversations
  SET 
    buffered_message_ids = ARRAY[]::TEXT[],
    pending_ai_response_at = NULL,
    updated_at = NOW()
  WHERE id = _conversation_id
  RETURNING buffered_message_ids INTO _buffered_ids;
  
  RETURN _buffered_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função para mapear status do Evolution API
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. Índice para busca de mensagens por whatsapp_id (usado em status updates)
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id 
ON public.messages((metadata->>'whatsapp_id'))
WHERE metadata->>'whatsapp_id' IS NOT NULL;