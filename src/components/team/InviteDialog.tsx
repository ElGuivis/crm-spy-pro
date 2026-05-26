import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, Loader2, Mail, Copy, CheckCircle, Link2 } from 'lucide-react';
import { z } from 'zod';
import { PermissionsGrid } from './PermissionsGrid';

const inviteSchema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'member']),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | undefined;
}

export function InviteDialog({ open, onOpenChange, tenantId }: Props) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [permissions, setPermissions] = useState<Record<string, { view: boolean; edit: boolean }>>({});
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetForm = () => {
    setEmail('');
    setRole('member');
    setPermissions({});
    setGeneratedLink(null);
  };

  const handleOpenChange = (value: boolean) => {
    onOpenChange(value);
    if (!value) resetForm();
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

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado!');
    } catch {
      toast.error('Falha ao copiar. Selecione e copie manualmente.');
    }
  };

  const createInviteMutation = useMutation({
    mutationFn: async ({ email, role, permissions }: { email: string; role: 'admin' | 'member'; permissions: Record<string, { view: boolean; edit: boolean }> }) => {
      const { data, error } = await supabase.functions.invoke('create-team-member', {
        body: {
          email, tenant_id: tenantId, role,
          permissions: Object.entries(permissions)
            .filter(([_, perms]) => perms.view || perms.edit)
            .map(([module, perms]) => ({ permission: module, can_view: perms.view, can_edit: perms.edit })),
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

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validated = inviteSchema.parse({ email, role });
      setIsLoading(true);
      await createInviteMutation.mutateAsync({ email: validated.email, role: validated.role, permissions });
    } catch (error) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Convidar Membro</DialogTitle>
          <DialogDescription>Gere um link de convite. O membro criará sua própria senha ao aceitar.</DialogDescription>
        </DialogHeader>

        {generatedLink ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Convite criado para {email}
              </div>
              <p className="text-xs text-muted-foreground">Copie o link abaixo e envie para o membro. O convite expira em 7 dias.</p>
              <div className="flex items-center gap-2">
                <Input value={generatedLink} readOnly className="text-xs font-mono" />
                <Button size="sm" variant="outline" onClick={() => handleCopyLink(generatedLink)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => resetForm()}>Convidar Outro</Button>
              <Button onClick={() => { resetForm(); onOpenChange(false); }}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="member-email">Email do Membro</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="member-email" type="email" placeholder="membro@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-role">Função</Label>
              <Select value={role} onValueChange={(value: 'admin' | 'member') => setRole(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (acesso total)</SelectItem>
                  <SelectItem value="member">Membro (permissões customizadas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === 'member' && (
              <div className="space-y-3">
                <Label>Permissões</Label>
                <PermissionsGrid permissions={permissions} onPermissionChange={handlePermissionChange} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" className="gradient-whatsapp" disabled={isLoading}>
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</> : <><Link2 className="w-4 h-4 mr-2" />Gerar Link de Convite</>}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
