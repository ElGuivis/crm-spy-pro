-- Painel de saude do atendimento: sinais de problema que o cliente nao ve (fila parada, falha de envio, duplicidade, disjuntor).
CREATE OR REPLACE FUNCTION public.get_atendimento_health(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.caller_has_tenant(p_tenant) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'pending_handoff', (SELECT count(*) FROM conversations WHERE tenant_id = p_tenant AND status = 'pending' AND closed_at IS NULL AND assigned_to IS NULL),
    'oldest_handoff_minutes', (SELECT coalesce(floor(extract(epoch FROM now() - min(last_message_at)) / 60), 0)::int FROM conversations WHERE tenant_id = p_tenant AND status = 'pending' AND closed_at IS NULL AND assigned_to IS NULL),
    'queued_over_5min', (SELECT count(*) FROM messages WHERE tenant_id = p_tenant AND status = 'queued' AND created_at < now() - interval '5 minutes' AND created_at > now() - interval '2 days'),
    'stuck_in_queue', (SELECT count(*) FROM outbound_queue WHERE tenant_id = p_tenant AND ((status = 'processing' AND locked_at < now() - interval '10 minutes') OR (status IN ('pending','failed') AND next_retry_at < now() - interval '10 minutes'))),
    'failed_messages_24h', (SELECT count(*) FROM messages WHERE tenant_id = p_tenant AND status = 'failed' AND created_at > now() - interval '24 hours'),
    'dead_letters_24h', (SELECT count(*) FROM outbound_queue WHERE tenant_id = p_tenant AND status = 'dead' AND created_at > now() - interval '24 hours'),
    'duplicate_suspects_24h', (SELECT count(*) FROM (
        SELECT 1 FROM messages WHERE tenant_id = p_tenant AND direction = 'outbound' AND created_at > now() - interval '24 hours'
        GROUP BY conversation_id, content HAVING count(*) > 1 AND max(created_at) - min(created_at) < interval '60 seconds') d),
    'circuit_open', EXISTS (SELECT 1 FROM circuit_breaker_state WHERE tenant_id = p_tenant AND state = 'open'),
    'checked_at', now()
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.get_atendimento_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_atendimento_health(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
