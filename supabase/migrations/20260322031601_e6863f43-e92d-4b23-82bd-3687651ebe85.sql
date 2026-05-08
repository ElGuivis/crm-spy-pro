CREATE OR REPLACE FUNCTION public.leave_team_memberships(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _removed_count integer := 0;
  _logs text[] := ARRAY[]::text[];
BEGIN
  _logs := array_append(_logs, 'Removendo participações em equipes...');

  -- Remove permissions first
  DELETE FROM public.member_permissions
  WHERE team_member_id IN (
    SELECT id FROM public.team_members WHERE user_id = _user_id
  );

  -- Remove team memberships
  WITH deleted AS (
    DELETE FROM public.team_members WHERE user_id = _user_id RETURNING id
  )
  SELECT count(*) INTO _removed_count FROM deleted;

  _logs := array_append(_logs, format('Removido de %s equipe(s)', _removed_count));
  _logs := array_append(_logs, '✅ Saiu de todas as equipes com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'removed_count', _removed_count,
    'logs', to_jsonb(_logs)
  );
END;
$function$;