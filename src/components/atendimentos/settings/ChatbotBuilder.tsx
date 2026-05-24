import { useState } from "react";
import {
  useChatbots, useCreateChatbot, useUpdateChatbot, useDeleteChatbot,
} from "@/hooks/useChatbotBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ChatbotEditor } from "./chatbot/ChatbotEditor";

export function ChatbotBuilder() {
  const { chatbots, isLoading } = useChatbots();
  const createChatbot = useCreateChatbot();
  const updateChatbot = useUpdateChatbot();
  const deleteChatbot = useDeleteChatbot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const chatbot = chatbots.find((a) => a.id === selectedId) || null;

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este chatbot?")) return;
    await deleteChatbot.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Informe um nome para o chatbot"); return; }
    const result = await createChatbot.mutateAsync({ name: newName.trim() });
    setNewName("");
    setSelectedId(result.id);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3">
            <Bot className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">O que é um Chatbot?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                O chatbot responde com base no que foi <strong>programado</strong>: menus interativos, respostas fixas para palavras-chave e consulta automática de pedidos. Ideal para triagem e atendimento padronizado, sem uso de IA generativa.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Chatbots
          </CardTitle>
          <CardDescription>Selecione ou crie um chatbot para configurar seu fluxo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            {chatbots.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhum chatbot criado ainda.</p>
            )}
            {chatbots.map((a) => (
              <div key={a.id} className="flex items-center gap-1">
                <Button
                  variant={selectedId === a.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedId(a.id)}
                  className="gap-1.5"
                >
                  <Bot className="h-3.5 w-3.5" />
                  {a.name}
                  <Badge variant={a.is_active ? "default" : "secondary"} className="text-[9px] ml-1">
                    {a.is_active ? "ON" : "OFF"}
                  </Badge>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(a.id)}
                  disabled={deleteChatbot.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Nome do novo chatbot (ex: Suporte, Vendas)..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="max-w-xs"
            />
            <Button size="sm" onClick={handleCreate} disabled={createChatbot.isPending} className="gap-1">
              <Plus className="h-4 w-4" />
              Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      {chatbot && (
        <ChatbotEditor
          key={chatbot.id}
          chatbot={chatbot}
          onUpdate={updateChatbot.mutateAsync}
          isPending={updateChatbot.isPending}
        />
      )}
    </div>
  );
}
