import { Check, AlertCircle, Loader2, QrCode, Webhook, RefreshCw, Truck, Bot, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface IntegrationTypePanelProps {
  id: string;
  name: string;
  type?: string;
  status: "connected" | "disconnected" | "pending";
  integrationType?: "ecommerce" | "whatsapp" | "chatwoot" | "ai" | "shipping";
  onReconnect?: (id: string) => void;
  onReprovision?: (id: string) => void;
  onReconfigureWebhook?: (id: string, instanceName: string) => void;
  onTestAI?: (id: string) => Promise<{ success: boolean; message: string }>;
  isReprovisioning?: boolean;
  isReconfiguringWebhook?: boolean;
  metadata?: Record<string, unknown>;
}

export function IntegrationTypePanel({
  id, name, type, status, integrationType,
  onReconnect, onReprovision, onReconfigureWebhook, onTestAI,
  isReprovisioning, isReconfiguringWebhook, metadata,
}: IntegrationTypePanelProps) {
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<"success" | "error" | null>(null);

  if (integrationType === "whatsapp") {
    return (
      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-2 text-sm">
          {status === "connected" ? (
            <><Check className="h-4 w-4 text-green-500" /><span className="text-green-600 font-medium">WhatsApp conectado</span></>
          ) : status === "pending" ? (
            <><QrCode className="h-4 w-4 text-yellow-500" /><span className="text-yellow-600 font-medium">Aguardando conexão</span></>
          ) : (
            <><AlertCircle className="h-4 w-4 text-destructive" /><span className="text-destructive font-medium">Desconectado</span></>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {status === "pending" && onReconnect && (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => onReconnect(id)}>
              <QrCode className="h-4 w-4" />Escanear QR Code
            </Button>
          )}
          {status === "connected" && onReconfigureWebhook && (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => onReconfigureWebhook(id, name)} disabled={isReconfiguringWebhook}>
              {isReconfiguringWebhook
                ? <><Loader2 className="h-4 w-4 animate-spin" />Reconfigurando...</>
                : <><Webhook className="h-4 w-4" />Reconfigurar Webhook</>}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (integrationType === "chatwoot") {
    return (
      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-2 text-sm">
          {status === "connected"
            ? <><Check className="h-4 w-4 text-orange-500" /><span className="text-orange-600 font-medium">Chatwoot conectado</span></>
            : <><AlertCircle className="h-4 w-4 text-destructive" /><span className="text-destructive font-medium">Desconectado</span></>}
        </div>
        {onReprovision && (
          <Button variant="outline" size="sm" className="mt-2 w-full gap-2" onClick={() => onReprovision(id)} disabled={isReprovisioning}>
            {isReprovisioning
              ? <><Loader2 className="h-4 w-4 animate-spin" />Reprovisionando...</>
              : <><RefreshCw className="h-4 w-4" />Reprovisionar Chatwoot</>}
          </Button>
        )}
      </div>
    );
  }

  if (integrationType === "ai") {
    return (
      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-2 text-sm">
          {status === "connected"
            ? <><Bot className="h-4 w-4 text-violet-500" /><span className="text-violet-600 font-medium">{type === "ai_openai" ? "OpenAI (GPT)" : "Google AI (Gemini)"}</span></>
            : <><AlertCircle className="h-4 w-4 text-destructive" /><span className="text-destructive font-medium">Desconectado</span></>}
        </div>
        <Button
          variant="outline" size="sm" className="mt-3 w-full gap-2"
          disabled={isTestingAI || !onTestAI}
          onClick={async () => {
            if (!onTestAI) return;
            setIsTestingAI(true);
            setAiTestResult(null);
            try {
              const result = await onTestAI(id);
              setAiTestResult(result.success ? "success" : "error");
            } catch {
              setAiTestResult("error");
            } finally {
              setIsTestingAI(false);
            }
          }}
        >
          {isTestingAI
            ? <><Loader2 className="h-4 w-4 animate-spin" />Testando...</>
            : aiTestResult === "success"
              ? <><Check className="h-4 w-4 text-green-500" />Conexão OK</>
              : aiTestResult === "error"
                ? <><AlertCircle className="h-4 w-4 text-destructive" />Falha no Teste</>
                : <><Zap className="h-4 w-4" />Testar Integração</>}
        </Button>
      </div>
    );
  }

  if (integrationType === "shipping") {
    return (
      <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
        <div className="flex items-center gap-2 text-sm">
          {status === "connected"
            ? <><Truck className="h-4 w-4 text-cyan-500" /><span className="text-cyan-600 font-medium">Melhor Envio conectado</span></>
            : <><AlertCircle className="h-4 w-4 text-destructive" /><span className="text-destructive font-medium">Desconectado</span></>}
        </div>
        {metadata && (metadata as { user_name?: string })?.user_name && (
          <div className="mt-2 text-xs text-muted-foreground">
            Conta: {(metadata as { user_name?: string }).user_name}
          </div>
        )}
      </div>
    );
  }

  return null;
}
