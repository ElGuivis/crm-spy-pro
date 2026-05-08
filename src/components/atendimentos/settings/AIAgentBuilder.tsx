import { useState, useEffect } from "react";
import {
  useAIAgents,
  useCreateAIAgent,
  useUpdateAIAgent,
  useDeleteAIAgent,
  type ChatbotConfig,
} from "@/hooks/useChatbotBuilder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Brain,
  Plus,
  Trash2,
  Save,
  Zap,
  Clock,
  MessageSquare,
  Settings,
  Shield,
  Database,
  Bot,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

// Models available per provider
const PROVIDER_MODELS: Record<string, { value: string; label: string; desc: string }[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o", desc: "Máxima precisão · Multimodal" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", desc: "Rápido e eficiente · Custo baixo" },
  ],
  google: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", desc: "Rápido · Multimodal" },
    { value: "gemini-2.0-pro", label: "Gemini 2.0 Pro", desc: "Alta capacidade · Contexto longo" },
  ],
  groq: [
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B", desc: "Potente · Versátil" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B", desc: "Ultra-rápido · Leve" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B", desc: "Balanceado · Contexto longo" },
  ],
  mistral: [
    { value: "mistral-small-latest", label: "Mistral Small", desc: "Rápido · Eficiente" },
    { value: "mistral-large-latest", label: "Mistral Large", desc: "Alta capacidade · Preciso" },
  ],
};

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  google: "Google",
  groq: "Groq",
  mistral: "Mistral",
};

function useAICredentials() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["tenant-ai-credentials", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.functions.invoke("manage-credentials", {
        body: { action: "list" },
      });
      if (error) throw error;
      return data?.credentials || [];
    },
    enabled: !!tenantId,
  });
}

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
    if (!newName.trim()) {
      toast.error("Informe um nome para o agente");
      return;
    }
    const result = await createAgent.mutateAsync({ name: newName.trim(), description: newDescription.trim() || undefined });
    setNewName("");
    setNewDescription("");
    setSelectedAgentId(result.id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este agente de IA?")) return;
    await deleteAgent.mutateAsync(id);
    if (selectedAgentId === id) setSelectedAgentId(null);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando agentes...</p>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Explicação */}
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

      {/* Agent list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Agentes de IA
          </CardTitle>
          <CardDescription>
            Crie e configure agentes inteligentes treinados com IA generativa para automatizar seu atendimento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            {agents.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhum agente de IA criado ainda.</p>
            )}
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-1">
                <Button
                  variant={selectedAgentId === a.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedAgentId(a.id)}
                  className="gap-1.5"
                >
                  <Brain className="h-3.5 w-3.5" />
                  {a.name}
                  <Badge
                    variant={a.is_active ? "default" : "secondary"}
                    className="text-[9px] ml-1"
                  >
                    {a.is_active ? "ATIVO" : "OFF"}
                  </Badge>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedAgentId(a.id)}
                  title="Editar agente"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(a.id)}
                  disabled={deleteAgent.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 items-center pt-1 flex-wrap">
            <Input
              placeholder="Nome do agente (ex: Suporte IA, Vendas Inteligente)..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="max-w-xs"
            />
            <Input
              placeholder="Descrição breve (opcional)..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="max-w-xs"
            />
            <Button size="sm" onClick={handleCreate} disabled={createAgent.isPending} className="gap-1">
              <Plus className="h-4 w-4" />
              Criar Agente
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Editor */}
      {agent && (
        <AIAgentEditor
          agent={agent}
          onUpdate={updateAgent.mutateAsync}
          isPending={updateAgent.isPending}
        />
      )}

      {!agent && agents.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Brain className="h-12 w-12 opacity-20" />
          <p className="text-sm">Selecione um agente acima para configurar</p>
        </div>
      )}
    </div>
  );
}

function AIAgentEditor({
  agent,
  onUpdate,
  isPending,
}: {
  agent: ChatbotConfig;
  onUpdate: (data: { id: string } & Partial<ChatbotConfig>) => Promise<void>;
  isPending: boolean;
}) {
  const { data: credentials = [], isLoading: credentialsLoading } = useAICredentials();
  
  // Determine available providers from credentials
  const availableProviders = credentials
    .map((c) => c.provider)
    .filter((p, i, arr) => arr.indexOf(p) === i); // unique

  const hasAIProvider = availableProviders.length > 0;
  
  // Find the default provider
  const defaultProvider = credentials.find((c) => (c as any).is_default)?.provider;

  // Core
  const [name, setName] = useState(agent.name);
  const [isActive, setIsActive] = useState(agent.is_active);
  const [aiProvider, setAiProvider] = useState<string>((agent as any).ai_provider || "");
  const [model, setModel] = useState(agent.model || "");
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || "");
  const [temperature, setTemperature] = useState<number>((agent as any).temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState<number>((agent as any).max_tokens ?? 1024);

  // Welcome
  const [welcomeMsg, setWelcomeMsg] = useState(agent.welcome_message || "");

  // Inactivity
  const [inactivityEnabled, setInactivityEnabled] = useState((agent as any).inactivity_enabled ?? false);
  const [inactivityTimeout, setInactivityTimeout] = useState<number>((agent as any).inactivity_timeout_minutes ?? 30);
  const [inactivityMessage, setInactivityMessage] = useState((agent as any).inactivity_message || "");

  // Buffer (batching messages)
  const [bufferEnabled, setBufferEnabled] = useState((agent as any).message_buffer_enabled ?? false);
  const [bufferDelay, setBufferDelay] = useState<number>((agent as any).message_buffer_delay_seconds ?? 5);

  // Transfer keywords
  const [transferKw, setTransferKw] = useState(
    (agent.transfer_keywords || []).join(", ")
  );

  // Order verification
  const [orderEnabled, setOrderEnabled] = useState(agent.order_verification_enabled || false);
  const [orderMode, setOrderMode] = useState(agent.order_verification_mode || "cpf");
  const [orderTemplate, setOrderTemplate] = useState(agent.order_details_template || "");

  // When provider changes, auto-select first model of that provider
  useEffect(() => {
    if (aiProvider && PROVIDER_MODELS[aiProvider]) {
      const currentModels = PROVIDER_MODELS[aiProvider];
      const currentModelValid = currentModels.some((m) => m.value === model);
      if (!currentModelValid) {
        setModel(currentModels[0].value);
      }
    }
  }, [aiProvider]);

  // Auto-select provider from credentials if not set (prefer default)
  useEffect(() => {
    if (!aiProvider && availableProviders.length > 0) {
      setAiProvider(defaultProvider || availableProviders[0]);
    }
  }, [availableProviders, aiProvider, defaultProvider]);

  const handleSave = async () => {
    await onUpdate({
      id: agent.id,
      name,
      is_active: isActive,
      model,
      system_prompt: systemPrompt,
      welcome_message: welcomeMsg,
      transfer_keywords: transferKw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      order_verification_enabled: orderEnabled,
      order_verification_mode: orderMode,
      order_details_template: orderTemplate,
      temperature,
      max_tokens: maxTokens,
      inactivity_enabled: inactivityEnabled,
      inactivity_timeout_minutes: inactivityTimeout,
      inactivity_message: inactivityMessage,
      message_buffer_enabled: bufferEnabled,
      message_buffer_delay_seconds: bufferDelay,
      ai_provider: aiProvider || null,
    } as any);
  };

  const currentModels = aiProvider && PROVIDER_MODELS[aiProvider] ? PROVIDER_MODELS[aiProvider] : [];

  return (
    <Tabs defaultValue="identity" className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList className="h-9">
          <TabsTrigger value="identity" className="gap-1.5 text-xs">
            <Bot className="h-3.5 w-3.5" /> Identidade
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="gap-1.5 text-xs">
            <Brain className="h-3.5 w-3.5" /> Inteligência
          </TabsTrigger>
          <TabsTrigger value="behavior" className="gap-1.5 text-xs">
            <Zap className="h-3.5 w-3.5" /> Comportamento
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5 text-xs">
            <Database className="h-3.5 w-3.5" /> Ferramentas
          </TabsTrigger>
          <TabsTrigger value="escalation" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" /> Escalação
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Agente ativo</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <Button onClick={handleSave} disabled={isPending} className="gap-2 h-8 text-xs px-3">
            <Save className="h-3.5 w-3.5" />
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {/* ── TAB: IDENTITY ── */}
      <TabsContent value="identity" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Dados do Agente
            </CardTitle>
            <CardDescription>Nome, provedor e modelo de linguagem utilizado por este agente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome do Agente</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Suporte Técnico, Vendas, SAC..."
                />
              </div>
            </div>

            <Separator />

            {/* AI Provider Alert or Selector */}
            {!hasAIProvider && !credentialsLoading && (
              <div className="rounded-lg border-2 border-destructive bg-destructive/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">Nenhum provedor de IA configurado</span>
                </div>
                <p className="text-sm text-destructive/80">
                  Para usar esse recurso é necessário que você integre uma IA.{" "}
                  <Link to="/integrations" className="underline font-medium text-destructive hover:text-destructive/90">
                    Ir para Integrações →
                  </Link>
                </p>
              </div>
            )}

            {hasAIProvider && (
              <div className="space-y-3">
                <Label>Provedor de IA</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {availableProviders.map((provider) => (
                    <button
                      key={provider}
                      onClick={() => setAiProvider(provider)}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        aiProvider === provider
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {aiProvider === provider && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="text-sm font-medium">{PROVIDER_LABELS[provider] || provider}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasAIProvider && aiProvider && currentModels.length > 0 && (
              <div className="space-y-3">
                <Label>Modelo de IA</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {currentModels.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setModel(m.value)}
                      className={`rounded-lg border p-3 text-left transition-all ${
                        model === m.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {model === m.value && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="text-sm font-medium">{m.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Mensagem de boas-vindas */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mensagem de Boas-Vindas
              </Label>
              <p className="text-xs text-muted-foreground">
                Enviada automaticamente quando o cliente inicia a conversa. Use {"{nome}"} para personalizar.
              </p>
              <Textarea
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                rows={3}
                placeholder="Olá {nome}! 👋 Sou o assistente virtual. Como posso ajudar?"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── TAB: INTELLIGENCE ── */}
      <TabsContent value="intelligence" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Prompt de Sistema
            </CardTitle>
            <CardDescription>
              Define a personalidade, tom e conhecimento do agente. Quanto mais detalhado, mais preciso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 border border-dashed p-3 text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Info className="h-3.5 w-3.5" />
                Dicas para um bom prompt
              </div>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>Defina a identidade: "Você é [Nome], assistente de [Empresa]..."</li>
                <li>Especifique o tom: formal, amigável, técnico...</li>
                <li>Liste o que o agente pode e não pode fazer</li>
                <li>Inclua informações sobre produtos/serviços relevantes</li>
                <li>Defina como tratar reclamações e dúvidas frequentes</li>
              </ul>
            </div>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={12}
              placeholder={`Você é um assistente virtual da [Nome da Empresa], especializado em atendimento ao cliente.

Seu tom é profissional e amigável. Você deve:
- Responder perguntas sobre produtos e serviços
- Ajudar com dúvidas sobre pedidos e entregas
- Encaminhar reclamações para o setor adequado
- NÃO discutir assuntos fora do contexto da empresa

Informações importantes:
- Horário de atendimento humano: Segunda a Sexta, 9h às 18h
- Para pedidos urgentes, transfira para um atendente`}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Parâmetros do Modelo
            </CardTitle>
            <CardDescription>Controle fino sobre como o modelo gera respostas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Temperatura: {temperature.toFixed(1)}</Label>
                  <p className="text-xs text-muted-foreground">
                    Baixo = respostas mais precisas e consistentes · Alto = mais criativo e variado
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {temperature < 0.4 ? "Preciso" : temperature < 0.7 ? "Balanceado" : "Criativo"}
                </Badge>
              </div>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0.0 - Determinístico</span>
                <span>0.5 - Padrão</span>
                <span>1.0 - Aleatório</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Máximo de tokens: {maxTokens}</Label>
                  <p className="text-xs text-muted-foreground">
                    Controla o tamanho máximo da resposta do agente
                  </p>
                </div>
              </div>
              <Slider
                value={[maxTokens]}
                onValueChange={([v]) => setMaxTokens(v)}
                min={128}
                max={4096}
                step={64}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>128 - Curto</span>
                <span>1024 - Padrão</span>
                <span>4096 - Longo</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── TAB: BEHAVIOR ── */}
      <TabsContent value="behavior" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Buffer de Mensagens
            </CardTitle>
            <CardDescription>
              Agrupa mensagens recebidas em sequência antes de processar, evitando respostas fragmentadas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ativar buffer</Label>
                <p className="text-xs text-muted-foreground">
                  Aguarda um intervalo antes de responder para acumular mensagens
                </p>
              </div>
              <Switch checked={bufferEnabled} onCheckedChange={setBufferEnabled} />
            </div>
            {bufferEnabled && (
              <div className="space-y-2">
                <Label>Delay: {bufferDelay}s</Label>
                <Slider
                  value={[bufferDelay]}
                  onValueChange={([v]) => setBufferDelay(v)}
                  min={3}
                  max={30}
                  step={1}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Inatividade
            </CardTitle>
            <CardDescription>
              Encerra conversas inativas automaticamente após um período
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ativar encerramento por inatividade</Label>
                <p className="text-xs text-muted-foreground">
                  Fecha a conversa se o cliente não responder no tempo configurado
                </p>
              </div>
              <Switch checked={inactivityEnabled} onCheckedChange={setInactivityEnabled} />
            </div>
            {inactivityEnabled && (
              <>
                <div className="space-y-2">
                  <Label>Timeout: {inactivityTimeout} minutos</Label>
                  <Slider
                    value={[inactivityTimeout]}
                    onValueChange={([v]) => setInactivityTimeout(v)}
                    min={5}
                    max={120}
                    step={5}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Mensagem de encerramento</Label>
                  <Textarea
                    value={inactivityMessage}
                    onChange={(e) => setInactivityMessage(e.target.value)}
                    rows={2}
                    placeholder="Por inatividade estamos finalizando a conversa..."
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── TAB: TOOLS ── */}
      <TabsContent value="tools" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Verificação de Pedidos
            </CardTitle>
            <CardDescription>
              Permite ao agente consultar pedidos e rastreios do cliente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Ativar verificação de pedidos</Label>
                <p className="text-xs text-muted-foreground">
                  O agente poderá consultar pedidos via CPF ou número do pedido
                </p>
              </div>
              <Switch checked={orderEnabled} onCheckedChange={setOrderEnabled} />
            </div>
            {orderEnabled && (
              <>
                <div className="space-y-1.5">
                  <Label>Modo de verificação</Label>
                  <Select value={orderMode} onValueChange={setOrderMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="order_number">Número do pedido</SelectItem>
                      <SelectItem value="sequential">Sequencial (CPF + Pedido)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Template de detalhes do pedido</Label>
                  <Textarea
                    value={orderTemplate}
                    onChange={(e) => setOrderTemplate(e.target.value)}
                    rows={4}
                    placeholder="Pedido #{numero}&#10;Status: {status}&#10;Rastreio: {rastreio}"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── TAB: ESCALATION ── */}
      <TabsContent value="escalation" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Transbordo Humano
            </CardTitle>
            <CardDescription>
              Palavras-chave que ativam a transferência para um atendente humano
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Textarea
                value={transferKw}
                onChange={(e) => setTransferKw(e.target.value)}
                rows={2}
                placeholder="atendente, humano, pessoa real, falar com alguém..."
              />
              <p className="text-xs text-muted-foreground">
                Quando o cliente enviar uma dessas palavras, a conversa será transferida para um atendente humano.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
