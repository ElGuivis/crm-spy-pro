-- Notificação de status do pedido: sem duplicidade e como mensagem transacional.
-- Aplicar com: psql --single-transaction -v ON_ERROR_STOP=1 -f <este arquivo>

-- 1) Um envio por (regra, pedido, canal): a reserva no banco impede duas execuções simultâneas de mandar a mesma mensagem.
--    O código já confere antes de reservar; o índice fecha a corrida entre duas execuções ao mesmo tempo.
--    (a tabela estava vazia em 12/11/2026; se houver duplicados antigos, remova-os antes de criar o índice)
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_notif_exec_rule_order_channel
  ON public.order_notification_executions (rule_id, order_number, channel);

-- 2) 'order_status' é transacional: respeita supressão e bloqueio de telefone, mas não entra no limite diário por pessoa.
CREATE OR REPLACE FUNCTION public.get_contact_blockers(p_tenant_id uuid, p_emails text[], p_phones text[], p_purpose text)
 RETURNS TABLE(contact_key text, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean := true; v_cap integer := 3; v_gap integer := 24;
  v_exempt boolean := p_purpose IN ('cashback', 'birthday', 'cashback_reminder', 'order_status');
  v_broadcast boolean := p_purpose IN ('campaign', 'bulk');
  v_emails text[] := COALESCE(p_emails, ARRAY[]::text[]);
  v_phones text[] := COALESCE(p_phones, ARRAY[]::text[]);
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT cp.enabled, cp.daily_cap, cp.broadcast_gap_hours INTO v_enabled, v_cap, v_gap FROM public.contact_policies cp WHERE cp.tenant_id = p_tenant_id;
  v_enabled := COALESCE(v_enabled, true); v_cap := COALESCE(v_cap, 3); v_gap := COALESCE(v_gap, 24);

  RETURN QUERY
  SELECT e, 'suppressed'::text FROM unnest(v_emails) e
    WHERE EXISTS (SELECT 1 FROM public.email_suppression_list s WHERE s.tenant_id = p_tenant_id AND lower(s.email) = e AND s.reason IN ('unsubscribed', 'bounced', 'complained', 'invalid', 'blocked'))
  UNION ALL
  SELECT ph, 'blocked'::text FROM unnest(v_phones) ph
    WHERE EXISTS (SELECT 1 FROM public.contact_blocks b WHERE b.tenant_id = p_tenant_id AND regexp_replace(b.phone_e164, '\D', '', 'g') = ph)
  UNION ALL
  SELECT k, 'daily_cap'::text FROM unnest(v_emails || v_phones) k
    WHERE v_enabled AND NOT v_exempt
      AND (SELECT count(*) FROM public.customer_touches t WHERE t.tenant_id = p_tenant_id AND t.sent_at >= now() - interval '24 hours' AND (t.email = k OR t.phone = k)) >= v_cap
  UNION ALL
  SELECT k, 'priority_gap'::text FROM unnest(v_emails || v_phones) k
    WHERE v_enabled AND v_broadcast AND v_gap > 0
      AND EXISTS (SELECT 1 FROM public.customer_touches t WHERE t.tenant_id = p_tenant_id AND t.sent_at >= now() - make_interval(hours => v_gap)
                    AND t.purpose NOT IN ('campaign', 'bulk') AND (t.email = k OR t.phone = k));
END;
$function$;
