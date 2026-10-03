-- Fecha a superficie de RPC do schema public.
--
-- Problema (auditoria 03/10/2026): todas as funcoes de public eram executaveis por `anon` (a chave anon e
-- publica, vai no bundle do site). Isso permitia, sem login: ler o CRON_SECRET via get_internal_headers(),
-- apagar contas via delete_account_data(uuid), cifrar/decifrar, gravar o segredo de cron etc. E varias
-- funcoes SECURITY DEFINER aceitavam qualquer tenant/usuario sem checar o chamador (dados de outros tenants).
--
-- Correcao em duas camadas:
--   1) privilegios: nada executavel por PUBLIC/anon; funcoes so-de-servidor tambem saem de `authenticated`.
--   2) checagem interna do chamador nas funcoes que recebem tenant/usuario (service_role e conexoes diretas
--      do banco continuam livres).

-- ───────────────────────── helpers de chamador ─────────────────────────
CREATE OR REPLACE FUNCTION public.caller_is_trusted()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  -- service_role (edge functions) ou conexao direta ao banco (cron, admin). session_user nao muda dentro de
  -- funcoes SECURITY DEFINER; pelo PostgREST ele e sempre `authenticator`.
  SELECT coalesce(auth.role(), '') = 'service_role' OR session_user IN ('postgres', 'supabase_admin');
$$;

CREATE OR REPLACE FUNCTION public.caller_is_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.caller_is_trusted() OR (auth.uid() IS NOT NULL AND auth.uid() = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.caller_has_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.caller_is_trusted() OR (
    auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.tenant_id = _tenant_id AND tm.user_id = auth.uid())
    )
  );
$$;

-- ───────────────────────── checagens dentro das funcoes ─────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(_sig text, _from text, _to text, _first_only boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  -- algumas funcoes antigas foram criadas com CRLF: normaliza para LF antes de casar os padroes
  def text := replace(pg_get_functiondef(_sig::regprocedure), E'\r', '');
  new_def text;
BEGIN
  IF _first_only THEN
    new_def := regexp_replace(def, _from, _to);
  ELSE
    new_def := replace(def, _from, _to);
  END IF;
  IF new_def = def THEN
    RAISE EXCEPTION 'patch sem efeito em %', _sig;
  END IF;
  EXECUTE new_def;
END;
$$;

-- funcoes SQL: o filtro entra na propria consulta (sem permissao => sem linhas / NULL)
SELECT pg_temp.patch_fn('public.get_tenant_token_balance(uuid)',
  'WHERE tenant_id = _tenant_id;', 'WHERE tenant_id = _tenant_id AND public.caller_has_tenant(_tenant_id);');
SELECT pg_temp.patch_fn('public.has_enough_tokens(uuid,integer)',
  'WHERE tenant_id = _tenant_id;', 'WHERE tenant_id = _tenant_id AND public.caller_has_tenant(_tenant_id);');
SELECT pg_temp.patch_fn('public.get_best_send_days(uuid)',
  'WHERE tenant_id = p_tenant_id', 'WHERE public.caller_has_tenant(p_tenant_id) AND tenant_id = p_tenant_id');
SELECT pg_temp.patch_fn('public.get_best_send_hours(uuid)',
  'WHERE tenant_id = p_tenant_id', 'WHERE public.caller_has_tenant(p_tenant_id) AND tenant_id = p_tenant_id');
SELECT pg_temp.patch_fn('public.get_user_tenants(uuid)',
  'WHERE t.owner_id = _user_id', 'WHERE public.caller_is_user(_user_id) AND t.owner_id = _user_id');
SELECT pg_temp.patch_fn('public.get_user_tenants(uuid)',
  'WHERE tm.user_id = _user_id;', 'WHERE public.caller_is_user(_user_id) AND tm.user_id = _user_id;');
SELECT pg_temp.patch_fn('public.get_revenue_attribution(uuid,integer)',
  'WHERE ec.tenant_id = p_tenant_id', 'WHERE public.caller_has_tenant(p_tenant_id)
    AND ec.tenant_id = p_tenant_id');

-- funcoes plpgsql: guarda logo apos o BEGIN do corpo
SELECT pg_temp.patch_fn('public.set_active_tenant(uuid,uuid)',
  E'\nBEGIN\n', E'\nBEGIN\n  IF NOT public.caller_is_user(_user_id) THEN\n    RETURN false;\n  END IF;\n', true);
SELECT pg_temp.patch_fn('public.add_tokens(uuid,integer,text,text,text)',
  E'\nBEGIN\n', E'\nBEGIN\n  IF NOT public.caller_has_tenant(_tenant_id) THEN\n    RAISE EXCEPTION ''forbidden'' USING ERRCODE = ''42501'';\n  END IF;\n', true);
SELECT pg_temp.patch_fn('public.deduct_tokens(uuid,integer,text,text,text)',
  E'\nBEGIN\n', E'\nBEGIN\n  IF NOT public.caller_has_tenant(_tenant_id) THEN\n    RAISE EXCEPTION ''forbidden'' USING ERRCODE = ''42501'';\n  END IF;\n', true);
SELECT pg_temp.patch_fn('public.get_dashboard_stats(uuid)',
  E'\nBEGIN\n', E'\nBEGIN\n  IF NOT public.caller_has_tenant(_tenant_id) THEN\n    RAISE EXCEPTION ''forbidden'' USING ERRCODE = ''42501'';\n  END IF;\n', true);
SELECT pg_temp.patch_fn('public.link_me_shipments_to_orders(uuid,uuid,text)',
  E'\nBEGIN\n', E'\nBEGIN\n  IF NOT (public.caller_is_trusted() OR (\n        EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = p_me_integration_id AND public.caller_has_tenant(i.tenant_id))\n    AND EXISTS (SELECT 1 FROM public.integrations i WHERE i.id = p_store_integration_id AND public.caller_has_tenant(i.tenant_id)))) THEN\n    RAISE EXCEPTION ''forbidden'' USING ERRCODE = ''42501'';\n  END IF;\n', true);

-- ───────────────────────── privilegios ─────────────────────────
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- funcoes so de servidor (edge functions com service_role, cron, triggers): fora de `authenticated` tambem
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND (
        p.prorettype = 'trigger'::regtype
        OR p.proname IN (
          'get_internal_headers', 'delete_account_data', 'delete_integration_cascade', 'leave_team_memberships',
          'cleanup_old_logs', 'cleanup_operational_logs', 'store_cron_secret', 'schedule_bulk_campaigns',
          'schedule_email_campaigns', 'trigger_rfm_calculations', 'process_churn_campaigns', 'rollup_instagram_metrics',
          'release_bot_lock', 'try_acquire_bot_lock', 'release_bulk_campaign_lock', 'try_acquire_bulk_campaign_lock',
          'add_message_to_buffer', 'clear_message_buffer', 'increment_campaign_unsubscribed', 'increment_cta_click_count',
          'increment_deep_link_conversions', 'increment_deep_link_conversations', 'map_evolution_status', 'functions_base_url'
        )
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END
$$;

-- os helpers de chamador sao usados dentro de funcoes/policies do usuario logado
GRANT EXECUTE ON FUNCTION public.caller_is_trusted(), public.caller_is_user(uuid), public.caller_has_tenant(uuid)
  TO authenticated, service_role;
