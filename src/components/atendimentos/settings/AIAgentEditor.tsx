import { type ChatbotConfig } from "@/hooks/useChatbotBuilder";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Brain, Zap, Database, Shield, Save } from "lucide-react";
import { useAIAgentEditor } from "@/hooks/useAIAgentEditor";
import { AIAgentEditorTabIdentity } from "./AIAgentEditorTabIdentity";
import { AIAgentEditorTabIntelligence } from "./AIAgentEditorTabIntelligence";
import { AIAgentEditorTabBehavior } from "./AIAgentEditorTabBehavior";
import { AIAgentEditorTabTools, AIAgentEditorTabEscalation } from "./AIAgentEditorTabTools";

interface AIAgentEditorProps {
  agent: ChatbotConfig;
  onUpdate: (data: { id: string } & Partial<ChatbotConfig>) => Promise<void>;
  isPending: boolean;
}

export function AIAgentEditor({ agent, onUpdate, isPending }: AIAgentEditorProps) {
  const s = useAIAgentEditor(agent, onUpdate);

  return (
    <Tabs defaultValue="identity" className="space-y-4">
      <div className="flex items-center justify-between">
        <TabsList className="h-9">
          <TabsTrigger value="identity" className="gap-1.5 text-xs"><Bot className="h-3.5 w-3.5" /> Identidade</TabsTrigger>
          <TabsTrigger value="intelligence" className="gap-1.5 text-xs"><Brain className="h-3.5 w-3.5" /> Inteligência</TabsTrigger>
          <TabsTrigger value="behavior" className="gap-1.5 text-xs"><Zap className="h-3.5 w-3.5" /> Comportamento</TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5 text-xs"><Database className="h-3.5 w-3.5" /> Ferramentas</TabsTrigger>
          <TabsTrigger value="escalation" className="gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" /> Escalação</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Agente ativo</Label>
            <Switch checked={s.isActive} onCheckedChange={s.setIsActive} />
          </div>
          <Button onClick={s.handleSave} disabled={isPending} className="gap-2 h-8 text-xs px-3">
            <Save className="h-3.5 w-3.5" />{isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <TabsContent value="identity" className="space-y-4">
        <AIAgentEditorTabIdentity
          name={s.name} setName={s.setName}
          aiProvider={s.aiProvider} setAiProvider={s.setAiProvider}
          availableProviders={s.availableProviders} hasAIProvider={s.hasAIProvider}
          credentialsLoading={s.credentialsLoading}
          model={s.model} setModel={s.setModel} currentModels={s.currentModels}
          welcomeMsg={s.welcomeMsg} setWelcomeMsg={s.setWelcomeMsg}
        />
      </TabsContent>

      <TabsContent value="intelligence" className="space-y-4">
        <AIAgentEditorTabIntelligence
          systemPrompt={s.systemPrompt} setSystemPrompt={s.setSystemPrompt}
          temperature={s.temperature} setTemperature={s.setTemperature}
          maxTokens={s.maxTokens} setMaxTokens={s.setMaxTokens}
        />
      </TabsContent>

      <TabsContent value="behavior" className="space-y-4">
        <AIAgentEditorTabBehavior
          bufferEnabled={s.bufferEnabled} setBufferEnabled={s.setBufferEnabled}
          bufferDelay={s.bufferDelay} setBufferDelay={s.setBufferDelay}
          inactivityEnabled={s.inactivityEnabled} setInactivityEnabled={s.setInactivityEnabled}
          inactivityTimeout={s.inactivityTimeout} setInactivityTimeout={s.setInactivityTimeout}
          inactivityMessage={s.inactivityMessage} setInactivityMessage={s.setInactivityMessage}
        />
      </TabsContent>

      <TabsContent value="tools" className="space-y-4">
        <AIAgentEditorTabTools
          orderEnabled={s.orderEnabled} setOrderEnabled={s.setOrderEnabled}
          orderMode={s.orderMode} setOrderMode={s.setOrderMode}
          orderTemplate={s.orderTemplate} setOrderTemplate={s.setOrderTemplate}
        />
      </TabsContent>

      <TabsContent value="escalation" className="space-y-4">
        <AIAgentEditorTabEscalation transferKw={s.transferKw} setTransferKw={s.setTransferKw} />
      </TabsContent>
    </Tabs>
  );
}
