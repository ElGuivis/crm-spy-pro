import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Play, MessageSquare, ArrowRightLeft, Info } from "lucide-react";
import type { ChatbotConfig, MenuButton, KeywordRule } from "@/hooks/useChatbotBuilder";
import { ChatbotMenuButtonsCard } from "./ChatbotMenuButtonsCard";
import { ChatbotKeywordRulesCard } from "./ChatbotKeywordRulesCard";
import { ChatbotOrderLookupCard } from "./ChatbotOrderLookupCard";
import { ChatbotSimulator } from "./ChatbotSimulator";

interface Props {
  chatbot: ChatbotConfig;
  onUpdate: (data: { id: string } & Partial<ChatbotConfig>) => Promise<void>;
  isPending: boolean;
}

export function ChatbotEditor({ chatbot, onUpdate, isPending }: Props) {
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

  const addButton = () => setButtons([...buttons, { id: crypto.randomUUID(), text: "", action: "respond", response: "" }]);
  const updateButton = (idx: number, updates: Partial<MenuButton>) => {
    const copy = [...buttons]; copy[idx] = { ...copy[idx], ...updates }; setButtons(copy);
  };
  const removeButton = (idx: number) => setButtons(buttons.filter((_, i) => i !== idx));

  const addRule = () => setRules([...rules, { id: crypto.randomUUID(), keywords: [], action: "respond", response: "" }]);
  const updateRule = (idx: number, updates: Partial<KeywordRule>) => {
    const copy = [...rules]; copy[idx] = { ...copy[idx], ...updates }; setRules(copy);
  };
  const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));

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

      <ChatbotMenuButtonsCard buttons={buttons} onAdd={addButton} onUpdate={updateButton} onRemove={removeButton} />
      <ChatbotKeywordRulesCard rules={rules} onAdd={addRule} onUpdate={updateRule} onRemove={removeRule} />
      <ChatbotOrderLookupCard
        orderEnabled={orderEnabled} orderMode={orderMode} orderTemplate={orderTemplate}
        onOrderEnabledChange={setOrderEnabled} onOrderModeChange={setOrderMode} onOrderTemplateChange={setOrderTemplate}
      />

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

      <ChatbotSimulator chatbot={liveConfig} open={showSimulator} onOpenChange={setShowSimulator} />
    </div>
  );
}
