import { useState } from "react";
import { useCreateInbox, useChannels } from "@/hooks/useAtendimentoSettings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Store, BrainCircuit } from "lucide-react";
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

const emptyForm = { name: '', channel_id: '', bot_enabled: true, sla_first: '', sla_resolution: '', integration_id: '', ai_agent_id: '' };

export function InboxCreateDialog() {
  const { channels } = useChannels();
  const createInbox = useCreateInbox();
  const { data: storeIntegrations = [] } = useStoreIntegrations();
  const { agents } = useChatbotAgents();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

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
    setOpen(false);
    setForm(emptyForm);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
              <SelectTrigger><SelectValue placeholder="Selecionar canal..." /></SelectTrigger>
              <SelectContent>
                {channels.map(ch => (
                  <SelectItem key={ch.id} value={ch.id}>{ch.display_name} ({ch.phone_e164 || ch.provider})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Loja vinculada</Label>
            <p className="text-xs text-muted-foreground mb-1">Filtra pedidos do cliente para mostrar apenas dessa loja</p>
            <Select value={form.integration_id || "_none"} onValueChange={(v) => setForm({ ...form, integration_id: v === '_none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma (mostra todos os pedidos)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhuma (mostra todos os pedidos)</SelectItem>
                {storeIntegrations.map(si => (
                  <SelectItem key={si.id} value={si.id}>
                    <span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" />{si.name} ({si.type === 'loja_integrada' ? 'LI' : 'Bling'})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Chatbot vinculado</Label>
            <p className="text-xs text-muted-foreground mb-1">Selecione o chatbot que fará o primeiro atendimento</p>
            <Select value={form.ai_agent_id || "_none"} onValueChange={(v) => setForm({ ...form, ai_agent_id: v === '_none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Nenhum chatbot" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Nenhum chatbot</SelectItem>
                {agents.map(agent => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <span className="flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5" />{agent.name}</span>
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
  );
}
