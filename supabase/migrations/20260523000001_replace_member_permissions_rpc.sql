-- Atomic replace of member_permissions for a given team member.
-- Antes: Team.tsx updatePermissionsMutation fazia DELETE + INSERT separados.
-- Se INSERT falhasse, o membro perdia todas as permissoes.

CREATE OR REPLACE FUNCTION public.replace_member_permissions(
  p_team_member_id uuid,
  p_permissions jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  perm jsonb;
BEGIN
  IF p_team_member_id IS NULL THEN
    RAISE EXCEPTION 'p_team_member_id is required';
  END IF;
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'p_permissions must be a JSON array';
  END IF;

  DELETE FROM public.member_permissions WHERE team_member_id = p_team_member_id;

  IF jsonb_array_length(p_permissions) > 0 THEN
    FOR perm IN SELECT jsonb_array_elements(p_permissions) LOOP
      INSERT INTO public.member_permissions (
        team_member_id, permission, can_view, can_edit
      )
      VALUES (
        p_team_member_id,
        (perm->>'permission')::module_permission,
        COALESCE((perm->>'can_view')::boolean, false),
        COALESCE((perm->>'can_edit')::boolean, false)
      );
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_member_permissions(uuid, jsonb) TO authenticated;
