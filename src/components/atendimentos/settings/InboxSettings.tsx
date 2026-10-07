import { useState } from "react";
import { useInboxesFull } from "@/hooks/useAtendimentoSettings";
import type { InboxFull } from "@/hooks/useInboxSettings";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox } from "lucide-react";
import { useChatbotAgents } from "@/hooks/useChatbotBuilder";
import { InboxCreateDialog } from "./InboxCreateDialog";
import { InboxEditDialog } from "./InboxEditDialog";
import { InboxCard } from "./InboxCard";

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
  const { data: storeIntegrations = [] } = useStoreIntegrations();
  const { agents } = useChatbotAgents();
  const [editOpen, setEditOpen] = useState(false);
  const [editingInbox, setEditingInbox] = useState<InboxFull | null>(null);

  const handleEdit = (inbox: InboxFull) => {
    setEditingInbox(inbox);
    setEditOpen(true);
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
        <InboxCreateDialog />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : inboxes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma inbox configurada</p>
        ) : (
          <div className="space-y-3">
            {inboxes.map(inbox => (
              <InboxCard
                key={inbox.id}
                inbox={inbox}
                storeIntegrations={storeIntegrations}
                agents={agents}
                onEdit={handleEdit}
              />
            ))}
          </div>
        )}
      </CardContent>

      <InboxEditDialog
        inbox={editingInbox}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </Card>
  );
}
