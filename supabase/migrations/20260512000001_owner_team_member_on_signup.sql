-- Ensure tenant owners always have a team_members record with role='admin'
-- so that: (1) they appear correctly in Team.tsx as "Administrador",
-- (2) old RLS policies checking team_members work for owners, and
-- (3) new sign-ups are never displayed as "Membro" by default.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, company_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'company_name');

  IF (NEW.raw_user_meta_data ->> 'is_team_member')::boolean IS NOT TRUE THEN
    IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
      INSERT INTO public.tenants (owner_id, name)
      VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Minha Empresa'))
      RETURNING id INTO _tenant_id;

      INSERT INTO public.team_members (tenant_id, user_id, role)
      VALUES (_tenant_id, NEW.id, 'admin');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: add existing owners who are not yet in team_members
INSERT INTO public.team_members (tenant_id, user_id, role)
SELECT t.id, t.owner_id, 'admin'
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.team_members tm
  WHERE tm.tenant_id = t.id AND tm.user_id = t.owner_id
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;
