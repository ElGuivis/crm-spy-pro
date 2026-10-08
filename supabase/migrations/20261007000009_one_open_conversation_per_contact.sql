-- Um contato so pode ter UMA conversa aberta por origem (organic / automation).
-- Antes nao havia trava: duas mensagens do mesmo cliente chegando juntas (ex.: "oi" + "bom dia") abriam duas
-- conversas (e, no contato novo, uma das chamadas falhava com 500 e a mensagem se perdia).
-- O codigo (wa-webhook-conversation-manager, automation-conversation) trata o 23505 reaproveitando a conversa que ficou.
CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_one_open_per_contact_source
  ON public.conversations (tenant_id, contact_id, source)
  WHERE closed_at IS NULL AND status IN ('bot', 'open', 'pending');
