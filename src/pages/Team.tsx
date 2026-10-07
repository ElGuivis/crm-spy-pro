import { useState } from 'react';
import type { Json } from "@/integrations/supabase/types";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, UserPlus, Shield, Trash2, Loader2, Clock, XCircle } from 'lucide-react';
import { InviteDialog } from '@/components/team/InviteDialog';
import { PermissionsGrid, MODULES } from '@/components/team/PermissionsGrid';

interface TeamMember {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
  user_email?: string;
}

interface TeamInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

interface MemberPermission {
  permission: string;
  can_view: boolean;
  can_edit: boolean;
}

export default function Team() {
  const { user, tenant, isOwner, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, { view: boolean; edit: boolean }>>({});

  const { data: teamMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('team_members').select('id, user_id, role, tenant_id, created_at, updated_at').order('created_at', { ascending: false });
      if (error) throw error;
      return data as TeamMember[];
    },
  });

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ['team-invites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('team_invites').select('id, email, role, status, expires_at, created_at').eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw error;
      return data as TeamInvite[];
    },
  });

  const { data: memberPermissions = [] } = useQuery<MemberPermission[]>({
    queryKey: ['member-permissions', selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return [];
      const { data, error } = await supabase.from('member_permissions').select('permission, can_view, can_edit').eq('team_member_id', selectedMember.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedMember,
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ memberId, permissions }: { memberId: string; permissions: Record<string, { view: boolean; edit: boolean }> }) => {
      const permissionsPayload = Object.entries(permissions).filter(([_, p]) => p.view || p.edit).map(([module, p]) => ({ permission: module, can_view: p.view, can_edit: p.edit }));
      const { error } = await supabase.rpc('replace_member_permissions', { p_team_member_id: memberId, p_permissions: permissionsPayload as unknown as Json });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-permissions'] });
      toast.success('Permissões atualizadas!');
      setIsPermissionsDialogOpen(false);
    },
    onError: (error: Error) => { toast.error(`Erro ao atualizar permissões: ${error.message}`); },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('team_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['team-members'] }); toast.success('Membro removido com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao remover membro: ${error.message}`); },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from('team_invites').update({ status: 'revoked' }).eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['team-invites'] }); toast.success('Convite revogado.'); },
    onError: (error: Error) => { toast.error(`Erro ao revogar convite: ${error.message}`); },
  });

  const handleOpenPermissions = (member: TeamMember) => {
    setSelectedMember(member);
    const initialPerms: Record<string, { view: boolean; edit: boolean }> = {};
    MODULES.forEach(module => {
      const existing = memberPermissions.find(p => p.permission === module.id);
      initialPerms[module.id] = { view: existing?.can_view ?? false, edit: existing?.can_edit ?? false };
    });
    setPermissions(initialPerms);
    setIsPermissionsDialogOpen(true);
  };

  const handlePermissionChange = (module: string, type: 'view' | 'edit', checked: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        view: type === 'view' ? checked : prev[module]?.view ?? false,
        edit: type === 'edit' ? checked : (type === 'view' && !checked ? false : prev[module]?.edit ?? false),
      },
    }));
  };

  const handleUpdatePermissions = async () => {
    if (!selectedMember) return;
    setIsLoading(true);
    await updatePermissionsMutation.mutateAsync({ memberId: selectedMember.id, permissions });
    setIsLoading(false);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner': return <Badge className="bg-primary/20 text-primary">Proprietário</Badge>;
      case 'admin': return <Badge variant="secondary">Administrador</Badge>;
      default: return <Badge variant="outline">Membro</Badge>;
    }
  };

  // NOTE: This client-side check provides UX feedback only. Actual security is enforced by RLS policies.
  if (!isOwner && !isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Acesso Restrito</h3>
            <p className="text-muted-foreground">Você não tem permissão para gerenciar a equipe.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Equipe</h1>
          <p className="text-muted-foreground">Gerencie os membros da sua equipe e suas permissões</p>
        </div>
        <Button className="gradient-whatsapp" disabled={!tenant?.id} onClick={() => setIsAddDialogOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Convidar Membro
        </Button>
      </div>

      <InviteDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} tenantId={tenant?.id} />

      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Clock className="w-4 h-4" />Convites Pendentes</CardTitle>
            <CardDescription>{pendingInvites.length} convite(s) aguardando aceite</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead><TableHead>Função</TableHead><TableHead>Expira em</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>{getRoleBadge(invite.role)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(invite.expires_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      {/* Link is only available at invite creation time (security: token not stored) */}
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => revokeInviteMutation.mutate(invite.id)} title="Revogar convite">
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" />Membros da Equipe</CardTitle>
          <CardDescription>{teamMembers.length} membro(s) na equipe</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8"><Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">Nenhum membro na equipe ainda</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead><TableHead>Função</TableHead><TableHead>Adicionado em</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary text-sm font-medium">{member.user_email?.charAt(0).toUpperCase() || 'U'}</span>
                        </div>
                        <span>{member.user_email || member.user_id}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                    <TableCell>{new Date(member.created_at).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      {member.role !== 'owner' && member.user_id !== user?.id && (
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenPermissions(member)}><Shield className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteMemberMutation.mutate(member.id)}><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerenciar Permissões</DialogTitle>
            <DialogDescription>Configure quais módulos este membro pode acessar</DialogDescription>
          </DialogHeader>
          <PermissionsGrid permissions={permissions} onPermissionChange={handlePermissionChange} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPermissionsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdatePermissions} disabled={isLoading}>
              {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar Permissões'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
