import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChatbotFlowCanvas } from "./ChatbotFlowCanvas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Pencil, Workflow } from "lucide-react";
import { toast } from "sonner";

interface FlowRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export function ChatbotFlowManager() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["chatbot-flows", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chatbot_flows" as any)
        .select("id,name,description,is_active,is_published,created_at,updated_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      return (data as FlowRow[]) ?? [];
    },
    enabled: !!tenantId,
  });

  const editingFlow = flows.find((f) => f.id === editingFlowId);

  if (editingFlowId && editingFlow) {
    return (
      <ChatbotFlowCanvas
        flowId={editingFlowId}
        flowName={editingFlow.name}
        onBack={() => setEditingFlowId(null)}
      />
    );
  }

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("chatbot_flows" as any)
        .insert({ tenant_id: tenantId!, name: newName.trim() })
        .select()
        .single();
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
      setNewName("");
      setEditingFlowId((data as FlowRow).id);
    } catch {
      toast.error("Erro ao criar flow");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este flow? Todos os nós e conexões serão removidos.")) return;
    const { error } = await supabase.from("chatbot_flows" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir flow"); return; }
    queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
    toast.success("Flow excluído");
  };

  const handleToggle = async (id: string, current: boolean) => {
    await supabase.from("chatbot_flows" as any).update({ is_active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6">
    <div className="space-y-4 max-w-3xl">
      {/* Explanation */}
      <Card className="border-dashed bg-muted/20">
        <CardContent className="pt-4 pb-3 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground flex items-center gap-2"><Workflow className="h-4 w-4" />Flow Builder Visual</p>
          <p>Crie fluxos de conversa com drag-and-drop. Após publicar, vincule o flow a um chatbot nas configurações da Inbox.</p>
        </CardContent>
      </Card>

      {/* Create */}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do novo flow…"
          className="flex-1 h-9"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />
        <Button onClick={handleCreate} disabled={!newName.trim() || creating} className="h-9">
          <Plus className="h-4 w-4 mr-1.5" />
          Criar Flow
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : flows.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Workflow className="h-10 w-10 mx-auto mb-2 opacity-30" />
          Nenhum flow criado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => (
            <Card key={flow.id}>
              <CardContent className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{flow.name}</p>
                    {flow.is_published && (
                      <Badge className="text-[10px] h-4">Publicado</Badge>
                    )}
                    {!flow.is_active && (
                      <Badge variant="secondary" className="text-[10px] h-4">Inativo</Badge>
                    )}
                  </div>
                  {flow.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{flow.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={flow.is_active}
                    onCheckedChange={() => handleToggle(flow.id, flow.is_active)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => setEditingFlowId(flow.id)}
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(flow.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
