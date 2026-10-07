import { useUpdateInbox, useDeleteInbox } from "@/hooks/useAtendimentoSettings";
import type { InboxFull } from "@/hooks/useInboxSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Bot, Clock, Store, Trash2, BrainCircuit, Pencil } from "lucide-react";

interface InboxCardProps {
  inbox: InboxFull;
  storeIntegrations: { id: string; name: string; type: string }[];
  agents: { id: string; name: string }[];
  onEdit: (inbox: InboxFull) => void;
}

export function InboxCard({ inbox, storeIntegrations, agents, onEdit }: InboxCardProps) {
  const updateInbox = useUpdateInbox();
  const deleteInbox = useDeleteInbox();

  const handleDelete = async () => {
    try {
      await deleteInbox.mutateAsync(inbox.id);
      toast.success(`Inbox "${inbox.name}" excluída`);
    } catch {
      toast.error('Erro ao excluir inbox');
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
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
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(inbox)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={inbox.bot_enabled ? "secondary" : "outline"}
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => updateInbox.mutate({ id: inbox.id, bot_enabled: !inbox.bot_enabled })}
        >
          <Bot className="h-3.5 w-3.5" />
          {inbox.bot_enabled ? 'Bot ON' : 'Bot OFF'}
        </Button>
        <Switch
          checked={inbox.is_active}
          onCheckedChange={() => updateInbox.mutate({ id: inbox.id, is_active: !inbox.is_active })}
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
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
