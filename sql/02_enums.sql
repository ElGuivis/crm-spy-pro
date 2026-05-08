-- =============================================================================
-- TIPOS ENUM PERSONALIZADOS
-- =============================================================================
-- Tipos ENUM usados em várias tabelas do sistema

-- Roles de membros de equipe
CREATE TYPE public.team_role AS ENUM ('owner', 'admin', 'member');

-- Permissões de módulos do sistema
CREATE TYPE public.module_permission AS ENUM (
  'dashboard',
  'sales',
  'clients',
  'conversations',
  'automations',
  'integrations',
  'settings',
  'coupons',
  'products',
  'contacts',
  'tenants'
);
