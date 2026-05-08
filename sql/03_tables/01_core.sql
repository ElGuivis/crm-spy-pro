-- =============================================================================
-- TABELAS CORE - Tenants, Profiles, Team Members
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TENANTS (Empresas/Contas)
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL, -- Referência ao auth.users
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenants IS 'Empresas/contas principais do sistema multi-tenant';
COMMENT ON COLUMN public.tenants.owner_id IS 'ID do usuário proprietário (auth.users)';

-- -----------------------------------------------------------------------------
-- PROFILES (Perfis de Usuário)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE, -- Referência ao auth.users
  company_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Perfis adicionais dos usuários';
COMMENT ON COLUMN public.profiles.user_id IS 'ID do usuário (auth.users)';

-- -----------------------------------------------------------------------------
-- TEAM_MEMBERS (Membros da Equipe)
-- -----------------------------------------------------------------------------
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- Referência ao auth.users
  role public.team_role NOT NULL DEFAULT 'member'::team_role,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

COMMENT ON TABLE public.team_members IS 'Membros de equipe de cada tenant';

-- -----------------------------------------------------------------------------
-- MEMBER_PERMISSIONS (Permissões de Membros)
-- -----------------------------------------------------------------------------
CREATE TABLE public.member_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  permission public.module_permission NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_member_id, permission)
);

COMMENT ON TABLE public.member_permissions IS 'Permissões granulares de cada membro';

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------
CREATE INDEX idx_tenants_owner_id ON public.tenants(owner_id);
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_team_members_tenant_id ON public.team_members(tenant_id);
CREATE INDEX idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX idx_member_permissions_team_member_id ON public.member_permissions(team_member_id);
