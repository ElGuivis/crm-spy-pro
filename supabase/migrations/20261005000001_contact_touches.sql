-- Registro unico de contatos (Fase N3): TODO envio de marketing/automacao (e-mail ou WhatsApp, de qualquer modulo) grava um "toque", e
-- todos consultam a mesma regra antes de enviar: supressao/bloqueio, limite diario por pessoa e prioridade (disparo em massa cede a quem ja
-- recebeu algo de ciclo de vida: recuperacao, boas-vindas, lembretes, reativacao). Cashback, lembrete de cashback e aniversario nao entram no limite (mas obedecem a supressao).
CREATE TABLE IF NOT EXISTS public.customer_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- chaves normalizadas: e-mail em minusculas; telefone so com digitos (55 + DDD + numero)
  email text,
  phone text,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  purpose text NOT NULL CHECK (purpose IN ('campaign', 'bulk', 'recovery', 'welcome', 'cashback', 'cashback_reminder', 'birthday', 'reactivation')),
  -- campanha, fluxo, configuracao... que enviou (so para consulta)
  module_ref text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_touches_who CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_touches_email ON public.customer_touches (tenant_id, email, sent_at DESC) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_touches_phone ON public.customer_touches (tenant_id, phone, sent_at DESC) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_touches_sent_at ON public.customer_touches (sent_at);

CREATE TABLE IF NOT EXISTS public.contact_policies (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  -- no maximo N mensagens de marketing/automacao por pessoa em 24 h (todos os canais somados)
  daily_cap integer NOT NULL DEFAULT 3 CHECK (daily_cap BETWEEN 1 AND 20),
  -- disparo em massa nao sai para quem recebeu algo de ciclo de vida nas ultimas N horas (0 = desligado)
  broadcast_gap_hours integer NOT NULL DEFAULT 24 CHECK (broadcast_gap_hours BETWEEN 0 AND 168),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant select" ON public.customer_touches;
CREATE POLICY "Tenant select" ON public.customer_touches FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant isolation" ON public.contact_policies;
CREATE POLICY "Tenant isolation" ON public.contact_policies FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid())) WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Quem NAO pode receber agora. Recebe lotes de e-mails e telefones (ja normalizados) e devolve a chave bloqueada e o motivo:
--   suppressed (lista de supressao de e-mail) | blocked (telefone bloqueado) | daily_cap | priority_gap
-- Para as chaves 'suppressed' e 'blocked' nao adianta esperar; 'daily_cap' e 'priority_gap' passam com o tempo.
CREATE OR REPLACE FUNCTION public.get_contact_blockers(p_tenant_id uuid, p_emails text[], p_phones text[], p_purpose text)
RETURNS TABLE (contact_key text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean := true; v_cap integer := 3; v_gap integer := 24;
  v_exempt boolean := p_purpose IN ('cashback', 'birthday', 'cashback_reminder');
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
$$;
REVOKE EXECUTE ON FUNCTION public.get_contact_blockers(uuid, text[], text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_blockers(uuid, text[], text[], text) TO service_role;

-- Retencao: toques com mais de 90 dias nao influenciam nenhuma regra
CREATE OR REPLACE FUNCTION public.cleanup_customer_touches()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.customer_touches WHERE sent_at < now() - interval '90 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_customer_touches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_customer_touches() TO service_role;

-- Resumo para o painel: toques por finalidade e canal nos ultimos N dias
CREATE OR REPLACE FUNCTION public.get_touch_summary(p_tenant_id uuid, p_days integer DEFAULT 7)
RETURNS TABLE (purpose text, channel text, touches integer, people integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_has_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.purpose, t.channel, count(*)::int, count(DISTINCT COALESCE(t.email, t.phone))::int
  FROM public.customer_touches t
  WHERE t.tenant_id = p_tenant_id AND t.sent_at >= now() - make_interval(days => p_days)
  GROUP BY 1, 2 ORDER BY 3 DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_touch_summary(uuid, integer) TO authenticated;

-- Semente: o que as campanhas de e-mail enviaram nos ultimos 7 dias ja conta (as regras valem desde o primeiro minuto)
INSERT INTO public.customer_touches (tenant_id, email, channel, purpose, module_ref, sent_at)
SELECT l.tenant_id, lower(btrim(l.recipient_email)), 'email',
       CASE WHEN c.flow_kind IS NULL THEN 'campaign' WHEN c.flow_kind = 'welcome' THEN 'welcome' ELSE 'recovery' END,
       l.campaign_id::text, l.sent_at
FROM public.email_campaign_logs l
LEFT JOIN public.email_campaigns c ON c.id = l.campaign_id
WHERE COALESCE(l.is_test, false) = false AND l.status IN ('delivered', 'sent') AND l.sent_at >= now() - interval '7 days' AND l.recipient_email IS NOT NULL AND l.recipient_email LIKE '%@%';
