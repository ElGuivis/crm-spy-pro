-- Notificação de status do pedido: sem duplicidade, regras que preservam o histórico e mensagem transacional.
-- Aplicar com: psql --single-transaction -v ON_ERROR_STOP=1 -f <este arquivo>

-- 1) 'kind' separa a mensagem principal do lembrete (follow-up) do mesmo pedido/status.
ALTER TABLE public.order_notification_executions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'primary';

-- 2) Um envio por (configuração, pedido, canal, tipo, status): a reserva no banco impede duas execuções simultâneas de mandar a mesma
--    mensagem. NÃO usa rule_id: o histórico não pode depender do id da regra (que mudava a cada salvamento da tela).
--    (a tabela estava vazia em 12/11/2026; se houver duplicados antigos, remova-os antes de criar o índice)
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_notif_exec_once
  ON public.order_notification_executions (config_id, order_number, channel, kind, status_name);

-- 3) Salvar as regras na tela passava por "apagar tudo e recriar": o id de cada regra mudava e o histórico (FK ON DELETE SET NULL)
--    perdia o vínculo. Agora atualiza pelo nome do status, insere o que falta e apaga só o que saiu.
CREATE OR REPLACE FUNCTION public.replace_order_notification_rules(p_config_id uuid, p_tenant_id uuid, p_rules jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r jsonb;
  v_names text[];
BEGIN
  IF p_config_id IS NULL THEN RAISE EXCEPTION 'p_config_id is required'; END IF;
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'p_tenant_id is required'; END IF;
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' THEN RAISE EXCEPTION 'p_rules must be a JSON array'; END IF;

  SELECT COALESCE(array_agg(x->>'status_name'), ARRAY[]::text[]) INTO v_names FROM jsonb_array_elements(p_rules) x;
  DELETE FROM public.order_notification_status_rules WHERE config_id = p_config_id AND NOT (status_name = ANY (v_names));

  FOR r IN SELECT jsonb_array_elements(p_rules) LOOP
    UPDATE public.order_notification_status_rules SET
      status_id = NULLIF((r->>'status_id'), '')::integer,
      is_enabled = COALESCE((r->>'is_enabled')::boolean, true),
      message_template = r->>'message_template',
      email_subject = NULLIF(r->>'email_subject', ''),
      email_body = NULLIF(r->>'email_body', ''),
      delay_minutes = COALESCE((r->>'delay_minutes')::integer, 0),
      followup_enabled = COALESCE((r->>'followup_enabled')::boolean, false),
      followup_delay_minutes = COALESCE((r->>'followup_delay_minutes')::integer, 0),
      followup_template = NULLIF(r->>'followup_template', ''),
      updated_at = now()
    WHERE config_id = p_config_id AND status_name = r->>'status_name';
    IF NOT FOUND THEN
      INSERT INTO public.order_notification_status_rules (
        config_id, tenant_id, status_name, status_id, is_enabled, message_template, email_subject, email_body, delay_minutes,
        followup_enabled, followup_delay_minutes, followup_template
      ) VALUES (
        p_config_id, p_tenant_id, r->>'status_name', NULLIF((r->>'status_id'), '')::integer, COALESCE((r->>'is_enabled')::boolean, true),
        r->>'message_template', NULLIF(r->>'email_subject', ''), NULLIF(r->>'email_body', ''), COALESCE((r->>'delay_minutes')::integer, 0),
        COALESCE((r->>'followup_enabled')::boolean, false), COALESCE((r->>'followup_delay_minutes')::integer, 0), NULLIF(r->>'followup_template', '')
      );
    END IF;
  END LOOP;
END;
$function$;

-- 4) Lembrete (follow-up): se o pedido continuar no mesmo status depois de X minutos, manda um segundo aviso (ex.: PIX sem pagar).
ALTER TABLE public.order_notification_status_rules
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_delay_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_template text;

-- 5) Janela de envio (horário de Brasília): fora dela a mensagem espera a próxima abertura. Padrão 8h às 21h.
ALTER TABLE public.order_notification_configs
  ADD COLUMN IF NOT EXISTS send_window_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS send_window_start smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS send_window_end smallint NOT NULL DEFAULT 21;
ALTER TABLE public.order_notification_configs
  DROP CONSTRAINT IF EXISTS order_notification_configs_window_chk,
  ADD CONSTRAINT order_notification_configs_window_chk CHECK (send_window_start BETWEEN 0 AND 23 AND send_window_end BETWEEN 1 AND 24 AND send_window_start < send_window_end);

-- 6) 'order_status' é transacional: respeita supressão e bloqueio de telefone, mas não entra no limite diário por pessoa.
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
