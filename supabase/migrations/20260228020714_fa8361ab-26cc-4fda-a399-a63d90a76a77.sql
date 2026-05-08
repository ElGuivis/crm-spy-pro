-- Fix handle_new_user trigger to skip tenant creation for team members
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, company_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'company_name');
  
  -- Only create tenant if NOT a team member
  IF (NEW.raw_user_meta_data ->> 'is_team_member')::boolean IS NOT TRUE THEN
    IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
      INSERT INTO public.tenants (owner_id, name)
      VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Minha Empresa'));
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Clean up spurious tenants created for team members
DELETE FROM public.tenants t
WHERE EXISTS (
  SELECT 1 FROM public.team_members tm
  WHERE tm.user_id = t.owner_id
  AND tm.tenant_id != t.id
);