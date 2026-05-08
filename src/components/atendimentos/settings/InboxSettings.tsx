import { useState } from "react";
import { useInboxesFull, useChannels, useUpdateInbox, useCreateInbox, useDeleteInbox } from "@/hooks/useAtendimentoSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Inbox, Plus, Bot, Clock, Store, Trash2, BrainCircuit, Pencil } from "lucide-react";
import { useChatbotAgents } from "@/hooks/useChatbotBuilder";

function useStoreIntegrations() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['store-integrations', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from('integrations')
        .select('id, name, type, status')
        .eq('tenant_id', tenantId)
        .in('type', ['loja_integrada', 'bling'])
        .in('status', ['active', 'connected']);
      return data || [];
    },
    enabled: !!tenantId,
  });
}

export function InboxSettings() {
  const { inboxes, isLoading } = useInboxesFull();
  const { channels } = useChannels();
  const updateInbox = useUpdateInbox();
  const createInbox = useCreateInbox();
  const deleteInbox = useDeleteInbox();
  const { data: storeIntegrations = [] } = useStoreIntegrations();
  const { agents } = useChatbotAgents();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingInbox, setEditingInbox] = useState<any>(null);
  const [form, setForm] = useState({ name: '', channel_id: '', bot_enabled: true, sla_first: '', sla_resolution: '', integration_id: '', ai_agent_id: '' });
  const [editForm, setEditForm] = useState({ name: '', channel_id: '', bot_enabled: true, sla_first: '', sla_resolution: '', integration_id: '', ai_agent_id: '', is_active: true });

  const handleCreate = async () => {
    if (!form.name || !form.channel_id) {
      toast.error('Nome e canal são obrigatórios');
      return;
    }
    await createInbox.mutateAsync({
      name: form.name,
      channel_id: form.channel_id,
      bot_enabled: form.bot_enabled,
      sla_first_response_minutes: form.sla_first ? parseInt(form.sla_first) : undefined,
      sla_resolution_minutes: form.sla_resolution ? parseInt(form.sla_resolution) : undefined,
      integration_id: form.integration_id || null,
      ai_agent_id: form.ai_agent_id || null,
    });
    toast.success('Inbox criada');
    setCreateOpen(false);
    setForm({ name: '', channel_id: '', bot_enabled: true, sla_first: '', sla_resolution: '', integration_id: '', ai_agent_id: '' });
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteInbox.mutateAsync(id);
      toast.success(`Inbox "${name}" excluída`);
    } catch {
      toast.error('Erro ao excluir inbox');
    }
  };

  const handleToggleBot = (id: string, current: boolean) => {
    updateInbox.mutate({ id, bot_enabled: !current } as any);
  };

  const handleToggleActive = (id: string, current: boolean) => {
    updateInbox.mutate({ id, is_active: !current } as any);
  };

  const handleEdit = (inbox: any) => {
    setEditingInbox(inbox);
    setEditForm({
      name: inbox.name || '',
      channel_id: inbox.channel_id || '',
      bot_enabled: inbox.bot_enabled ?? true,
      sla_first: inbox.sla_first_response_minutes?.toString() || '',
      sla_resolution: inbox.sla_resolution_minutes?.toString() || '',
      integration_id: inbox.integration_id || '',
      ai_agent_id: (inbox as any).ai_agent_id || '',
      is_active: inbox.is_active ?? true,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingInbox || !editForm.name || !editForm.channel_id) {
      toast.error('Nome e canal são obrigatórios');
      return;
    }
    try {
      await updateInbox.mutateAsync({
        id: editingInbox.id,
        name: editForm.name,
        channel_id: editForm.channel_id,
        bot_enabled: editForm.bot_enabled,
        sla_first_response_minutes: editForm.sla_first ? parseInt(editForm.sla_first) : null,
        sla_resolution_minutes: editForm.sla_resolution ? parseInt(editForm.sla_resolution) : null,
        integration_id: editForm.integration_id || null,
        ai_agent_id: editForm.ai_agent_id || null,
        is_active: editForm.is_active,
      } as any);
      toast.success('Inbox atualizada');
      setEditOpen(false);
      setEditingInbox(null);
    } catch {
      toast.error('Erro ao atualizar inbox');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            Inboxes
          </CardTitle>
          <CardDescription>Gerencie as caixas de entrada de atendimento</CardDescription>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              Nova Inbox
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Inbox</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Atendimento Principal" />
              </div>
              <div>
                <Label>Canal WhatsApp</Label>
                <Select value={form.channel_id} onValueChange={(v) => setForm({ ...form, channel_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar canal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map(ch => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.display_name} ({ch.phone_e164 || ch.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Loja vinculada</Label>
                <p className="text-xs text-muted-foreground mb-1">Filtra pedidos do cliente para mostrar apenas dessa loja</p>
                <Select value={form.integration_id || "_none"} onValueChange={(v) => setForm({ ...form, integration_id: v === '_none' ? '' : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhuma (mostra todos os pedidos)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhuma (mostra todos os pedidos)</SelectItem>
                    {storeIntegrations.map(si => (
                      <SelectItem key={si.id} value={si.id}>
                        <span className="flex items-center gap-1.5">
                          <Store className="h-3.5 w-3.5" />
                          {si.name} ({si.type === 'loja_integrada' ? 'LI' : 'Bling'})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
              </Select>
              </div>
              <div>
                <Label>Chatbot vinculado</Label>
                <p className="text-xs text-muted-foreground mb-1">Selecione o chatbot que fará o primeiro atendimento</p>
                <Select value={form.ai_agent_id || "_none"} onValueChange={(v) => setForm({ ...form, ai_agent_id: v === '_none' ? '' : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum chatbot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum chatbot</SelectItem>
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className="flex items-center gap-1.5">
                          <BrainCircuit className="h-3.5 w-3.5" />
                          {agent.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Bot habilitado</Label>
                <Switch checked={form.bot_enabled} onCheckedChange={(v) => setForm({ ...form, bot_enabled: v })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SLA 1ª Resposta (min)</Label>
                  <p className="text-xs text-muted-foreground mb-1">Tempo máximo para o primeiro reply</p>
                  <Input type="number" value={form.sla_first} onChange={(e) => setForm({ ...form, sla_first: e.target.value })} placeholder="Ex: 5" />
                </div>
                <div>
                  <Label>SLA Resolução (min)</Label>
                  <p className="text-xs text-muted-foreground mb-1">Tempo máximo para fechar o atendimento</p>
                  <Input type="number" value={form.sla_resolution} onChange={(e) => setForm({ ...form, sla_resolution: e.target.value })} placeholder="Ex: 60" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={createInbox.isPending}>
                {createInbox.isPending ? 'Criando...' : 'Criar Inbox'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : inboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma inbox configurada</p>
        ) : (
          <div className="space-y-3">
            {inboxes.map(inbox => (
              <div key={inbox.id} className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">{inbox.name}</span>
                    <Badge variant={inbox.is_active ? "default" : "secondary"} className="text-[10px]">
                      {inbox.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{inbox.channel?.display_name || 'Canal não vinculado'}</span>
                    {inbox.channel?.phone_e164 && <span>{inbox.channel.phone_e164}</span>}
                    {inbox.integration_id && (
                      <span className="flex items-center gap-0.5">
                        <Store className="h-3 w-3" />
                        {storeIntegrations.find(s => s.id === inbox.integration_id)?.name || 'Loja'}
                      </span>
                    )}
                    {inbox.sla_first_response_minutes && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        SLA: {inbox.sla_first_response_minutes}min
                      </span>
                    )}
                    {inbox.ai_agent_id && (
                      <span className="flex items-center gap-0.5">
                        <BrainCircuit className="h-3 w-3" />
                        {agents.find(a => a.id === inbox.ai_agent_id)?.name || 'Chatbot'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => handleEdit(inbox)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={inbox.bot_enabled ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleToggleBot(inbox.id, inbox.bot_enabled)}
                  >
                    <Bot className="h-3.5 w-3.5" />
                    {inbox.bot_enabled ? 'Bot ON' : 'Bot OFF'}
                  </Button>
                  <Switch
                    checked={inbox.is_active}
                    onCheckedChange={() => handleToggleActive(inbox.id, inbox.is_active)}
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir inbox "{inbox.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Conversas vinculadas a esta inbox não serão excluídas.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(inbox.id, inbox.name)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Inbox</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Ex: Atendimento Principal" />
            </div>
            <div>
              <Label>Canal WhatsApp</Label>
              <Select value={editForm.channel_id} onValueChange={(v) => setEditForm({ ...editForm, channel_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar canal..." />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(ch => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.display_name} ({ch.phone_e164 || ch.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Loja vinculada</Label>
              <p className="text-xs text-muted-foreground mb-1">Filtra pedidos do cliente para mostrar apenas dessa loja</p>
              <Select value={editForm.integration_id || "_none"} onValueChange={(v) => setEditForm({ ...editForm, integration_id: v === '_none' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma (mostra todos os pedidos)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhuma (mostra todos os pedidos)</SelectItem>
                  {storeIntegrations.map(si => (
                    <SelectItem key={si.id} value={si.id}>
                      <span className="flex items-center gap-1.5">
                        <Store className="h-3.5 w-3.5" />
                        {si.name} ({si.type === 'loja_integrada' ? 'LI' : 'Bling'})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chatbot vinculado</Label>
              <p className="text-xs text-muted-foreground mb-1">Selecione o chatbot que fará o primeiro atendimento</p>
              <Select value={editForm.ai_agent_id || "_none"} onValueChange={(v) => setEditForm({ ...editForm, ai_agent_id: v === '_none' ? '' : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum chatbot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum chatbot</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <span className="flex items-center gap-1.5">
                        <BrainCircuit className="h-3.5 w-3.5" />
                        {agent.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Bot habilitado</Label>
              <Switch checked={editForm.bot_enabled} onCheckedChange={(v) => setEditForm({ ...editForm, bot_enabled: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Inbox ativa</Label>
              <Switch checked={editForm.is_active} onCheckedChange={(v) => setEditForm({ ...editForm, is_active: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SLA 1ª Resposta (min)</Label>
                <Input type="number" value={editForm.sla_first} onChange={(e) => setEditForm({ ...editForm, sla_first: e.target.value })} placeholder="Ex: 5" />
              </div>
              <div>
                <Label>SLA Resolução (min)</Label>
                <Input type="number" value={editForm.sla_resolution} onChange={(e) => setEditForm({ ...editForm, sla_resolution: e.target.value })} placeholder="Ex: 60" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateInbox.isPending}>
              {updateInbox.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
