import { useState, useCallback } from "react";
import {
  useChatbots,
  useCreateChatbot,
  useUpdateChatbot,
  useDeleteChatbot,
  type ChatbotConfig,
  type MenuButton,
  type KeywordRule,
} from "@/hooks/useChatbotBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Plus, Trash2, Save, MessageSquare, Search, ArrowRightLeft, Sparkles, Info, Clock, Play, Send, User, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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
    if (!newName.trim()) {
      toast.error("Informe um nome para o chatbot");
      return;
    }
    const result = await createChatbot.mutateAsync({ name: newName.trim() });
    setNewName("");
    setSelectedId(result.id);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Explicação */}
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

      {/* Selector / creator */}
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

      {/* Editor */}
      {chatbot && (
        <ChatbotEditor
          chatbot={chatbot}
          onUpdate={updateChatbot.mutateAsync}
          isPending={updateChatbot.isPending}
        />
      )}
    </div>
  );
}

// ─── Simulation types ───────────────────────────────────────────────────────

interface SimMessage {
  id: string;
  role: 'user' | 'bot' | 'system';
  content: string;
}

function ChatbotSimulator({ chatbot, open, onOpenChange }: { chatbot: ChatbotConfig; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<'welcome' | 'menu' | 'keyword' | 'order' | 'transfer'>('welcome');

  const addMsg = useCallback((role: SimMessage['role'], content: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content }]);
  }, []);

  const startSimulation = useCallback(() => {
    setMessages([]);
    setStage('welcome');
    if (chatbot.welcome_message) {
      setTimeout(() => {
        setMessages([{ id: crypto.randomUUID(), role: 'bot', content: chatbot.welcome_message || '' }]);
      }, 300);
    }
  }, [chatbot]);

  const handleUserSend = useCallback(() => {
    if (!input.trim()) return;
    const userMsg = input.trim().toLowerCase();
    addMsg('user', input.trim());
    setInput('');

    // Check transfer keywords
    const transferKws = chatbot.transfer_keywords || [];
    if (transferKws.some(kw => userMsg.includes(kw.toLowerCase()))) {
      setTimeout(() => {
        addMsg('system', '🔄 Transferindo para atendente humano...');
        setStage('transfer');
      }, 500);
      return;
    }

    // Check keyword rules
    const rules = (chatbot.keyword_action_rules as KeywordRule[]) || [];
    for (const rule of rules) {
      if (rule.keywords.some(kw => userMsg.includes(kw.toLowerCase()))) {
        setTimeout(() => {
          if (rule.action === 'respond' && rule.response) {
            addMsg('bot', rule.response);
          } else {
            addMsg('system', '🔄 Transferindo...');
          }
        }, 500);
        return;
      }
    }

    // Check menu buttons by number or text
    const buttons = (chatbot.interactive_buttons as MenuButton[]) || [];
    const matchedBtn = buttons.find((btn, i) => 
      userMsg === String(i + 1) || userMsg.includes(btn.text.toLowerCase().replace(/[^\w\s]/g, '').trim())
    );

    if (matchedBtn) {
      setTimeout(() => {
        if (matchedBtn.action === 'respond' && matchedBtn.response) {
          addMsg('bot', matchedBtn.response);
        } else if (matchedBtn.action === 'order_lookup') {
          addMsg('bot', chatbot.order_verification_enabled
            ? `Por favor, informe seu ${chatbot.order_verification_mode === 'cpf' ? 'CPF' : chatbot.order_verification_mode === 'email' ? 'e-mail' : 'telefone'} para buscar seu pedido.`
            : '📦 Buscando seus pedidos...'
          );
          setStage('order');
        } else if (matchedBtn.action === 'transfer_human') {
          addMsg('system', '🔄 Transferindo para atendente humano...');
          setStage('transfer');
        }
      }, 500);
      return;
    }

    // Default: no match
    setTimeout(() => {
      addMsg('bot', 'Desculpe, não entendi. Por favor, escolha uma das opções do menu.');
      if (chatbot.welcome_message) {
        setTimeout(() => addMsg('bot', chatbot.welcome_message || ''), 300);
      }
    }, 500);
  }, [input, chatbot, addMsg]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[500px] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Teste do Chatbot: {chatbot.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Simule uma conversa para testar o fluxo configurado
          </DialogDescription>
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Bot className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Clique "Iniciar" para testar o fluxo</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={startSimulation}>
                <Play className="h-3.5 w-3.5" />
                Iniciar simulação
              </Button>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-2",
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {msg.role === 'system' ? (
                      <div className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                        <AlertTriangle className="h-3 w-3" />
                        {msg.content}
                      </div>
                    ) : (
                      <div className={cn(
                        "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      )}>
                        <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="border-t p-3 flex gap-2 shrink-0">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={startSimulation} title="Reiniciar">
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Simule uma mensagem do cliente..."
            className="h-9 text-sm"
            disabled={stage === 'transfer'}
            onKeyDown={(e) => e.key === 'Enter' && handleUserSend()}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleUserSend} disabled={!input.trim() || stage === 'transfer'}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function ChatbotEditor({
  chatbot,
  onUpdate,
  isPending,
}: {
  chatbot: ChatbotConfig;
  onUpdate: (data: { id: string } & Partial<ChatbotConfig>) => Promise<void>;
  isPending: boolean;
}) {
  const [welcome, setWelcome] = useState(chatbot.welcome_message || "");
  const [isActive, setIsActive] = useState(chatbot.is_active);
  const [buttons, setButtons] = useState<MenuButton[]>((chatbot.interactive_buttons as MenuButton[]) || []);
  const [rules, setRules] = useState<KeywordRule[]>((chatbot.keyword_action_rules as KeywordRule[]) || []);
  const [transferKw, setTransferKw] = useState((chatbot.transfer_keywords || []).join(", "));
  const [orderEnabled, setOrderEnabled] = useState(chatbot.order_verification_enabled || false);
  const [orderTemplate, setOrderTemplate] = useState(chatbot.order_details_template || "");
  const [orderMode, setOrderMode] = useState(chatbot.order_verification_mode || "cpf");
  const [showSimulator, setShowSimulator] = useState(false);

  const handleSave = async () => {
    await onUpdate({
      id: chatbot.id,
      is_active: isActive,
      welcome_message: welcome,
      interactive_buttons: buttons as any,
      keyword_action_rules: rules as any,
      transfer_keywords: transferKw.split(",").map((s) => s.trim()).filter(Boolean),
      order_verification_enabled: orderEnabled,
      order_verification_mode: orderMode,
      order_details_template: orderTemplate,
    });
  };

  const addButton = () =>
    setButtons([...buttons, { id: crypto.randomUUID(), text: "", action: "respond", response: "" }]);

  const updateButton = (idx: number, updates: Partial<MenuButton>) => {
    const copy = [...buttons];
    copy[idx] = { ...copy[idx], ...updates };
    setButtons(copy);
  };

  const removeButton = (idx: number) => setButtons(buttons.filter((_, i) => i !== idx));

  const addRule = () =>
    setRules([...rules, { id: crypto.randomUUID(), keywords: [], action: "respond", response: "" }]);

  const updateRule = (idx: number, updates: Partial<KeywordRule>) => {
    const copy = [...rules];
    copy[idx] = { ...copy[idx], ...updates };
    setRules(copy);
  };

  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

  // Build a live chatbot config for the simulator
  const liveConfig: ChatbotConfig = {
    ...chatbot,
    welcome_message: welcome,
    interactive_buttons: buttons as any,
    keyword_action_rules: rules as any,
    transfer_keywords: transferKw.split(",").map(s => s.trim()).filter(Boolean),
    order_verification_enabled: orderEnabled,
    order_verification_mode: orderMode,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Configurando: {chatbot.name}</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowSimulator(true)}>
            <Play className="h-3.5 w-3.5" />
            Testar fluxo
          </Button>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Ativo</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <Button onClick={handleSave} disabled={isPending} size="sm" className="gap-2">
            <Save className="h-3.5 w-3.5" />
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {/* Welcome message */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagem de Boas-Vindas
          </CardTitle>
          <CardDescription>Primeira mensagem enviada quando o cliente entra em contato</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={welcome}
            onChange={(e) => setWelcome(e.target.value)}
            rows={4}
            placeholder="Olá! 👋 Como posso ajudar?&#10;&#10;1️⃣ Rastrear pedido&#10;2️⃣ Falar com atendente"
          />
        </CardContent>
      </Card>

      {/* Interactive menu buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Menu de Opções
          </CardTitle>
          <CardDescription>
            Opções interativas apresentadas ao cliente. O cliente digita o número ou texto correspondente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {buttons.map((btn, idx) => (
            <div key={btn.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className="text-xs shrink-0 w-6 h-6 flex items-center justify-center">
                  {idx + 1}
                </Badge>
                <Input
                  value={btn.text}
                  onChange={(e) => updateButton(idx, { text: e.target.value })}
                  placeholder="Texto da opção (ex: 📦 Rastrear pedido)"
                  className="flex-1 min-w-[150px]"
                />
                <Select value={btn.action} onValueChange={(v) => updateButton(idx, { action: v as MenuButton["action"] })}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="respond">Resposta fixa</SelectItem>
                    <SelectItem value="order_lookup">Buscar pedido</SelectItem>
                    <SelectItem value="transfer_human">Transferir para humano</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeButton(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {btn.action === "respond" && (
                <Textarea
                  value={btn.response || ""}
                  onChange={(e) => updateButton(idx, { response: e.target.value })}
                  placeholder="Resposta que será enviada ao cliente..."
                  rows={2}
                />
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addButton} className="gap-1">
            <Plus className="h-4 w-4" />
            Adicionar opção
          </Button>
        </CardContent>
      </Card>

      {/* Keyword rules with conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Regras de Palavras-Chave
          </CardTitle>
          <CardDescription>
            Respostas automáticas quando o cliente envia mensagens com determinadas palavras. Suporta condições avançadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map((rule, idx) => (
            <div key={rule.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Input
                  value={rule.keywords.join(", ")}
                  onChange={(e) =>
                    updateRule(idx, { keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                  }
                  placeholder="Palavras-chave (separadas por vírgula)"
                  className="flex-1 min-w-[150px]"
                />
                <Select value={rule.action} onValueChange={(v) => updateRule(idx, { action: v as KeywordRule["action"] })}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="respond">Responder</SelectItem>
                    <SelectItem value="transfer_column">Transferir</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeRule(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Conditions hint */}
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
                <Clock className="h-3 w-3 shrink-0" />
                <span>Condições: esta regra dispara se qualquer keyword combinar na mensagem do cliente</span>
              </div>

              {rule.action === "respond" && (
                <Textarea
                  value={rule.response || ""}
                  onChange={(e) => updateRule(idx, { response: e.target.value })}
                  placeholder="Resposta automática..."
                  rows={2}
                />
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRule} className="gap-1">
            <Plus className="h-4 w-4" />
            Adicionar regra
          </Button>
        </CardContent>
      </Card>

      {/* Order lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Consulta de Pedidos
          </CardTitle>
          <CardDescription>Permitir que o chatbot busque informações de pedidos automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Busca de pedidos habilitada</Label>
            <Switch checked={orderEnabled} onCheckedChange={setOrderEnabled} />
          </div>
          {orderEnabled && (
            <>
              <div>
                <Label>Verificação do cliente</Label>
                <Select value={orderMode} onValueChange={setOrderMode}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="none">Sem verificação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Template de exibição do pedido</Label>
                <Textarea
                  value={orderTemplate}
                  onChange={(e) => setOrderTemplate(e.target.value)}
                  rows={4}
                  placeholder="📦 Pedido: {{numero}}&#10;Status: {{status}}&#10;Rastreio: {{rastreio}}"
                  className="mt-1 font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Variáveis: {"{{numero}}"}, {"{{status}}"}, {"{{rastreio}}"}, {"{{valor}}"}, {"{{data}}"}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Transfer to human */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transferência para Humano
          </CardTitle>
          <CardDescription>Palavras-chave que acionam transferência automática para atendente</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={transferKw}
            onChange={(e) => setTransferKw(e.target.value)}
            placeholder="atendente, humano, pessoa, ajuda (separadas por vírgula)"
          />
        </CardContent>
      </Card>

      {/* Info box */}
      <Card className="border-dashed bg-muted/40">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2.5">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Este chatbot responde apenas com o que foi configurado acima. Para atendimento com inteligência artificial treinada, use um <strong>Agente IA</strong> na aba correspondente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Simulator */}
      <ChatbotSimulator chatbot={liveConfig} open={showSimulator} onOpenChange={setShowSimulator} />
    </div>
  );
}
