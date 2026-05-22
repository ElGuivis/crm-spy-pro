import { useState } from "react";
import { useAIAgents, useCreateAIAgent, useUpdateAIAgent, useDeleteAIAgent } from "@/hooks/useChatbotBuilder";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Brain, Plus, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";
import { AIAgentEditor } from "./AIAgentEditor";

export function AIAgentBuilder() {
  const { aiAgents: agents, isLoading } = useAIAgents();
  const createAgent = useCreateAIAgent();
  const updateAgent = useUpdateAIAgent();
  const deleteAgent = useDeleteAIAgent();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const agent = agents.find((a) => a.id === selectedAgentId) || null;

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Informe um nome para o agente"); return; }
    const result = await createAgent.mutateAsync({ name: newName.trim(), description: newDescription.trim() || undefined });
    setNewName(""); setNewDescription(""); setSelectedAgentId(result.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este agente de IA?")) return;
    await deleteAgent.mutateAsync(id);
    if (selectedAgentId === id) setSelectedAgentId(null);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando agentes...</p>;

  return (
    <div className="space-y-6 max-w-5xl">
      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3">
            <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">O que é um Agente de IA?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                O Agente de IA é treinado com um <strong>prompt de sistema</strong> detalhado e usa modelos generativos (GPT, Gemini) para responder de forma inteligente e contextual. Diferente do chatbot, ele não segue um menu fixo — aprende com o contexto da conversa e responde de forma natural.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-primary" />Agentes de IA</CardTitle>
          <CardDescription>Crie e configure agentes inteligentes treinados com IA generativa para automatizar seu atendimento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            {agents.length === 0 && <p className="text-sm text-muted-foreground italic">Nenhum agente de IA criado ainda.</p>}
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-1">
                <Button variant={selectedAgentId === a.id ? "default" : "outline"} size="sm" onClick={() => setSelectedAgentId(a.id)} className="gap-1.5">
                  <Brain className="h-3.5 w-3.5" />{a.name}
                  <Badge variant={a.is_active ? "default" : "secondary"} className="text-[9px] ml-1">{a.is_active ? "ATIVO" : "OFF"}</Badge>
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setSelectedAgentId(a.id)} title="Editar agente">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(a.id)} disabled={deleteAgent.isPending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 items-center pt-1 flex-wrap">
            <Input placeholder="Nome do agente (ex: Suporte IA, Vendas Inteligente)..." value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()} className="max-w-xs" />
            <Input placeholder="Descrição breve (opcional)..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="max-w-xs" />
            <Button size="sm" onClick={handleCreate} disabled={createAgent.isPending} className="gap-1">
              <Plus className="h-4 w-4" />Criar Agente
            </Button>
          </div>
        </CardContent>
      </Card>

      {agent && <AIAgentEditor agent={agent} onUpdate={updateAgent.mutateAsync} isPending={updateAgent.isPending} />}

      {!agent && agents.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Brain className="h-12 w-12 opacity-20" />
          <p className="text-sm">Selecione um agente acima para configurar</p>
        </div>
      )}
    </div>
  );
}
