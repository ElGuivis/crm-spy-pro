CREATE OR REPLACE FUNCTION public.delete_account_data(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owned_tenant_id uuid;
  _is_owner boolean := false;
  _logs text[] := ARRAY[]::text[];
BEGIN
  -- Check if user owns a tenant
  SELECT id INTO _owned_tenant_id
  FROM public.tenants
  WHERE owner_id = _user_id;

  _is_owner := (_owned_tenant_id IS NOT NULL);

  _logs := array_append(_logs, 'Iniciando exclusão transacional...');

  -- =========================================================
  -- STEP 1: Always remove memberships in OTHER tenants
  -- =========================================================
  IF _is_owner THEN
    -- Owner: remove from teams they don't own
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (
      SELECT id FROM public.team_members
      WHERE user_id = _user_id AND tenant_id != _owned_tenant_id
    );
    DELETE FROM public.team_members
    WHERE user_id = _user_id AND tenant_id != _owned_tenant_id;
    _logs := array_append(_logs, 'Removido de equipes externas');
  ELSE
    -- Member-only: remove from ALL teams
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (
      SELECT id FROM public.team_members WHERE user_id = _user_id
    );
    DELETE FROM public.team_members WHERE user_id = _user_id;
    _logs := array_append(_logs, 'Removido de todas as equipes');
  END IF;

  -- =========================================================
  -- STEP 2: If owner, delete the owned tenant (CASCADE handles 90+ tables)
  -- =========================================================
  IF _is_owner THEN
    DELETE FROM public.bling_webhook_events WHERE tenant_id = _owned_tenant_id;
    _logs := array_append(_logs, 'Webhook events limpos');

    DELETE FROM public.ai_assistant_configs 
    WHERE default_ai_agent_id IN (
      SELECT id FROM public.ai_agents WHERE tenant_id = _owned_tenant_id
    );
    _logs := array_append(_logs, 'AI configs limpos');

    DELETE FROM public.tenants WHERE id = _owned_tenant_id;
    _logs := array_append(_logs, 'Tenant e dados cascateados excluídos');
  END IF;

  -- =========================================================
  -- STEP 3: Always clean up profile and oauth
  -- =========================================================
  DELETE FROM public.profiles WHERE user_id = _user_id;
  _logs := array_append(_logs, 'Perfil excluído');

  DELETE FROM public.oauth_states WHERE user_id = _user_id;

  _logs := array_append(_logs, '✅ Dados excluídos com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'was_owner', _is_owner,
    'tenant_id', _owned_tenant_id,
    'logs', to_jsonb(_logs)
  );
END;
$function$;