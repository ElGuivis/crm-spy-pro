
-- Table for pending team invitations
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  permissions jsonb DEFAULT '[]'::jsonb,
  invite_token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

-- Index for token lookup
CREATE INDEX idx_team_invites_token ON public.team_invites(invite_token);
CREATE INDEX idx_team_invites_tenant ON public.team_invites(tenant_id);

-- RLS
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Admins can view/manage invites for their tenant
CREATE POLICY "Admins can view tenant invites"
  ON public.team_invites FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can create invites"
  ON public.team_invites FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can update invites"
  ON public.team_invites FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins can delete invites"
  ON public.team_invites FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));
