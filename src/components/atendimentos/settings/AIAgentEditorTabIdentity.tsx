import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Bot, MessageSquare, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PROVIDER_LABELS, PROVIDER_MODELS } from "@/hooks/useAIAgentEditor";

interface Props {
  name: string; setName: (v: string) => void;
  aiProvider: string; setAiProvider: (v: string) => void;
  availableProviders: string[]; hasAIProvider: boolean; credentialsLoading: boolean;
  model: string; setModel: (v: string) => void;
  currentModels: { value: string; label: string; desc: string }[];
  welcomeMsg: string; setWelcomeMsg: (v: string) => void;
}

export function AIAgentEditorTabIdentity({ name, setName, aiProvider, setAiProvider, availableProviders, hasAIProvider, credentialsLoading, model, setModel, currentModels, welcomeMsg, setWelcomeMsg }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" />Dados do Agente</CardTitle>
        <CardDescription>Nome, provedor e modelo de linguagem utilizado por este agente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nome do Agente</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Suporte Técnico, Vendas, SAC..." />
          </div>
        </div>

        <Separator />

        {!hasAIProvider && !credentialsLoading && (
          <div className="rounded-lg border-2 border-destructive bg-destructive/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="text-sm font-semibold text-destructive">Nenhum provedor de IA configurado</span>
            </div>
            <p className="text-sm text-destructive/80">
              Para usar esse recurso é necessário que você integre uma IA.{" "}
              <Link to="/integrations" className="underline font-medium text-destructive hover:text-destructive/90">Ir para Integrações →</Link>
            </p>
          </div>
        )}

        {hasAIProvider && (
          <div className="space-y-3">
            <Label>Provedor de IA</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {availableProviders.map((provider) => (
                <button key={provider} onClick={() => setAiProvider(provider)}
                  className={`rounded-lg border p-3 text-left transition-all ${aiProvider === provider ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"}`}
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
                <button key={m.value} onClick={() => setModel(m.value)}
                  className={`rounded-lg border p-3 text-left transition-all ${model === m.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"}`}
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

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />Mensagem de Boas-Vindas</Label>
          <p className="text-xs text-muted-foreground">Enviada automaticamente quando o cliente inicia a conversa. Use {"{nome}"} para personalizar.</p>
          <Textarea value={welcomeMsg} onChange={(e) => setWelcomeMsg(e.target.value)} rows={3} placeholder="Olá {nome}! 👋 Sou o assistente virtual. Como posso ajudar?" />
        </div>
      </CardContent>
    </Card>
  );
}
