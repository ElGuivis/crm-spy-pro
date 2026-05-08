import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, UserPlus, Shield, Eye, Edit, Trash2, Loader2, Mail, Building2, Copy, Clock, XCircle, CheckCircle, Link2 } from 'lucide-react';
import { z } from 'zod';

type ModulePermission = 'dashboard' | 'sales' | 'clients' | 'conversations' | 'automations' | 'integrations' | 'coupons' | 'products' | 'contacts' | 'settings' | 'tenants';

const MODULES: { id: ModulePermission; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Vendas' },
  { id: 'clients', label: 'Clientes' },
  { id: 'conversations', label: 'Conversas' },
  { id: 'automations', label: 'Automações' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'coupons', label: 'Cupons' },
  { id: 'products', label: 'Produtos' },
  { id: 'contacts', label: 'Contatos' },
  { id: 'settings', label: 'Configurações' },
];

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'member']),
});

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
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [permissions, setPermissions] = useState<Record<string, { view: boolean; edit: boolean }>>({});

  // Fetch team members
  const { data: teamMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, user_id, role, tenant_id, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TeamMember[];
    },
  });

  // Fetch pending invites
  const { data: pendingInvites = [] } = useQuery({
    queryKey: ['team-invites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_invites')
        .select('id, email, role, status, expires_at, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as TeamInvite[];
    },
  });

  // Fetch member permissions
  const { data: memberPermissions = [] } = useQuery({
    queryKey: ['member-permissions', selectedMember?.id],
    queryFn: async () => {
      if (!selectedMember) return [];
      const { data, error } = await supabase
        .from('member_permissions')
        .select('permission, can_view, can_edit')
        .eq('team_member_id', selectedMember.id);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedMember,
  });

  // Create invite mutation
  const createInviteMutation = useMutation({
    mutationFn: async ({ email, role, permissions }: {
      email: string;
      role: 'admin' | 'member';
      permissions: Record<string, { view: boolean; edit: boolean }>;
    }) => {
      const { data, error } = await supabase.functions.invoke('create-team-member', {
        body: {
          email,
          tenant_id: tenant?.id,
          role,
          permissions: Object.entries(permissions)
            .filter(([_, perms]) => perms.view || perms.edit)
            .map(([module, perms]) => ({
              permission: module,
              can_view: perms.view,
              can_edit: perms.edit,
            })),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      setGeneratedLink(data.invite_url);
      toast.success('Convite criado! Copie o link e envie ao membro.');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar convite: ${error.message}`);
    },
  });

  // Update permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ memberId, permissions }: {
      memberId: string;
      permissions: Record<string, { view: boolean; edit: boolean }>;
    }) => {
      await supabase
        .from('member_permissions')
        .delete()
        .eq('team_member_id', memberId);

      const newPermissions = Object.entries(permissions)
        .filter(([_, perms]) => perms.view || perms.edit)
        .map(([module, perms]) => ({
          team_member_id: memberId,
          permission: module as ModulePermission,
          can_view: perms.view,
          can_edit: perms.edit,
        }));

      if (newPermissions.length > 0) {
        const { error } = await supabase
          .from('member_permissions')
          .insert(newPermissions);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-permissions'] });
      toast.success('Permissões atualizadas!');
      setIsPermissionsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar permissões: ${error.message}`);
    },
  });

  // Delete member mutation
  const deleteMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Membro removido com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover membro: ${error.message}`);
    },
  });

  // Revoke invite mutation
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('team_invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invites'] });
      toast.success('Convite revogado.');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao revogar convite: ${error.message}`);
    },
  });

  const resetForm = () => {
    setEmail('');
    setRole('member');
    setPermissions({});
    setGeneratedLink(null);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validated = inviteSchema.parse({ email, role });
      setIsLoading(true);
      await createInviteMutation.mutateAsync({
        email: validated.email,
        role: validated.role,
        permissions,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado!');
    } catch {
      toast.error('Falha ao copiar. Selecione e copie manualmente.');
    }
  };

  const handleOpenPermissions = (member: TeamMember) => {
    setSelectedMember(member);

    const initialPerms: Record<string, { view: boolean; edit: boolean }> = {};
    MODULES.forEach(module => {
      const existing = memberPermissions.find(p => p.permission === module.id);
      initialPerms[module.id] = {
        view: existing?.can_view ?? false,
        edit: existing?.can_edit ?? false,
      };
    });
    setPermissions(initialPerms);
    setIsPermissionsDialogOpen(true);
  };

  const handleUpdatePermissions = async () => {
    if (!selectedMember) return;
    setIsLoading(true);
    await updatePermissionsMutation.mutateAsync({
      memberId: selectedMember.id,
      permissions,
    });
    setIsLoading(false);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge className="bg-primary/20 text-primary">Proprietário</Badge>;
      case 'admin':
        return <Badge variant="secondary">Administrador</Badge>;
      default:
        return <Badge variant="outline">Membro</Badge>;
    }
  };

  const PermissionsGrid = ({ onPermissionChange }: { onPermissionChange: (module: string, type: 'view' | 'edit', checked: boolean) => void }) => (
    <div className="border rounded-lg divide-y">
      {MODULES.map((module) => (
        <div key={module.id} className="flex items-center justify-between p-3">
          <span className="text-sm font-medium">{module.label}</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={permissions[module.id]?.view ?? false}
                onCheckedChange={(checked) => onPermissionChange(module.id, 'view', !!checked)}
              />
              <Eye className="w-4 h-4" />
              Ver
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={permissions[module.id]?.edit ?? false}
                disabled={!permissions[module.id]?.view}
                onCheckedChange={(checked) => onPermissionChange(module.id, 'edit', !!checked)}
              />
              <Edit className="w-4 h-4" />
              Editar
            </label>
          </div>
        </div>
      ))}
    </div>
  );

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

  // NOTE: This client-side check provides UX feedback only.
  // Actual security is enforced by RLS policies.
  if (!isOwner && !isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Acesso Restrito</h3>
              <p className="text-muted-foreground">
                Você não tem permissão para gerenciar a equipe.
              </p>
            </div>
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
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gradient-whatsapp">
              <UserPlus className="w-4 h-4 mr-2" />
              Convidar Membro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Convidar Membro</DialogTitle>
              <DialogDescription>
                Gere um link de convite. O membro criará sua própria senha ao aceitar.
              </DialogDescription>
            </DialogHeader>

            {generatedLink ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Convite criado para {email}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copie o link abaixo e envie para o membro. O convite expira em 7 dias.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input value={generatedLink} readOnly className="text-xs font-mono" />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyLink(generatedLink)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { resetForm(); }}>
                    Convidar Outro
                  </Button>
                  <Button onClick={() => { resetForm(); setIsAddDialogOpen(false); }}>
                    Fechar
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="member-email">Email do Membro</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="member-email"
                      type="email"
                      placeholder="membro@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="member-role">Função</Label>
                  <Select value={role} onValueChange={(value: 'admin' | 'member') => setRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador (acesso total)</SelectItem>
                      <SelectItem value="member">Membro (permissões customizadas)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {role === 'member' && (
                  <div className="space-y-3">
                    <Label>Permissões</Label>
                    <PermissionsGrid onPermissionChange={handlePermissionChange} />
                  </div>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="gradient-whatsapp" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Gerando...
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        Gerar Link de Convite
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4" />
              Convites Pendentes
            </CardTitle>
            <CardDescription>
              {pendingInvites.length} convite(s) aguardando aceite
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-medium">{invite.email}</TableCell>
                    <TableCell>{getRoleBadge(invite.role)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Link is only available at invite creation time (security: token not stored) */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => revokeInviteMutation.mutate(invite.id)}
                          title="Revogar convite"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Membros da Equipe
          </CardTitle>
          <CardDescription>
            {teamMembers.length} membro(s) na equipe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum membro na equipe ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Adicionado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary text-sm font-medium">
                            {member.user_email?.charAt(0).toUpperCase() || 'U'}
                          </span>
                        </div>
                        <span>{member.user_email || member.user_id}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                    <TableCell>
                      {new Date(member.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {member.role !== 'owner' && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenPermissions(member)}
                          >
                            <Shield className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteMemberMutation.mutate(member.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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

      {/* Permissions Dialog */}
      <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerenciar Permissões</DialogTitle>
            <DialogDescription>
              Configure quais módulos este membro pode acessar
            </DialogDescription>
          </DialogHeader>
          <PermissionsGrid onPermissionChange={handlePermissionChange} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdatePermissions} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Permissões'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
