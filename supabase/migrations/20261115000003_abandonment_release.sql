-- Liberar um abandono que o fluxo nao atenderia (anterior a ativacao do fluxo ou antigo demais).
-- 15/11/2026: carrinho do Antony (11:34) ficou fora porque o fluxo ligou as 13:21; mudar enabled_at puxaria
-- outros abandonos antigos e mudar event_at nao adianta (a captura regrava a cada 10 min).
-- O abandonment-processor aceita released_at como alternativa ao corte por data e conta as etapas a partir da
-- liberacao (1a etapa na hora, as demais no intervalo normal).
ALTER TABLE public.li_abandonment_campaigns ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_li_abandonment_released
  ON public.li_abandonment_campaigns (tenant_id, kind)
  WHERE released_at IS NOT NULL AND flow_status = 'open';

-- Chamado pela tela (Recuperacao LI -> Capturados). So a empresa do usuario logado; so abandono em aberto, com contato e ainda na loja.
CREATE OR REPLACE FUNCTION public.release_abandonment(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant_id(auth.uid());
  v_rows int;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'nao autenticado' USING ERRCODE = '42501';
  END IF;
  UPDATE public.li_abandonment_campaigns
     SET released_at = now()
   WHERE id = p_id
     AND tenant_id = v_tenant
     AND flow_status = 'open'
     AND gone_at IS NULL
     AND released_at IS NULL
     AND (recipient_email IS NOT NULL OR recipient_phone IS NOT NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_abandonment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_abandonment(uuid) TO authenticated, service_role;
