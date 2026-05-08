CREATE OR REPLACE FUNCTION public.delete_account_data(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id uuid;
  _logs text[] := ARRAY[]::text[];
BEGIN
  SELECT id INTO _tenant_id
  FROM public.tenants
  WHERE owner_id = _user_id;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', _user_id;
  END IF;

  _logs := array_append(_logs, 'Iniciando exclusão transacional...');

  DELETE FROM public.member_permissions
  WHERE team_member_id IN (
    SELECT id FROM public.team_members WHERE user_id = _user_id AND tenant_id != _tenant_id
  );
  DELETE FROM public.team_members WHERE user_id = _user_id AND tenant_id != _tenant_id;
  _logs := array_append(_logs, 'Removido de equipes externas');

  DELETE FROM public.bling_webhook_events WHERE tenant_id = _tenant_id;
  _logs := array_append(_logs, 'Webhook events limpos');

  DELETE FROM public.ai_assistant_configs 
  WHERE default_ai_agent_id IN (SELECT id FROM public.ai_agents WHERE tenant_id = _tenant_id);
  _logs := array_append(_logs, 'AI configs limpos');

  DELETE FROM public.tenants WHERE id = _tenant_id;
  _logs := array_append(_logs, 'Tenant e dados cascateados excluídos');

  DELETE FROM public.profiles WHERE user_id = _user_id;
  _logs := array_append(_logs, 'Perfil excluído');

  DELETE FROM public.oauth_states WHERE user_id = _user_id;

  _logs := array_append(_logs, '✅ Dados excluídos com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', _tenant_id,
    'logs', to_jsonb(_logs)
  );
END;
$function$