import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Star, Palette, Settings, RefreshCw, Download } from "lucide-react";
import {
  type Integration, getIntegrationLogo, getIntegrationIcon,
  getIntegrationDescription, getStatusBadge,
} from "./integrationsHelpers";

interface CheckerStatus {
  isConnected: boolean;
  isChecking: boolean;
}

interface Actions {
  onSyncAll: (i: Integration) => void;
  onSetDefaultAI: (i: Integration) => void;
  onDelete: (id: string) => void;
  onBlingConfig: (i: Integration) => void;
  onBlingManage: () => void;
  onBlingReconnect: () => void;
  onEvolutionReconnect: (i: Integration) => void;
  onLojaIntegradaReconnect: () => void;
  onMelhorEnvioReconnect: () => void;
  onNuvemshopManage: () => void;
  onNuvemshopReconnect: () => void;
  onAIReconnect: (provider: "openai" | "google" | "groq" | "mistral") => void;
}

interface Props {
  integration: Integration;
  defaultAIProvider: string | null;
  statusInfo?: CheckerStatus;
  actions: Actions;
}

export function IntegrationCard({ integration, defaultAIProvider, statusInfo, actions }: Props) {
  return (
    <Card className="card-premium group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl">
              {getIntegrationLogo(integration.type) ? (
                <img src={getIntegrationLogo(integration.type)} alt={integration.name} className="h-6 w-6 object-contain" />
              ) : (
                getIntegrationIcon(integration.type)
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{integration.name}</CardTitle>
                {integration.type.startsWith("ai_") && defaultAIProvider === integration.type.replace("ai_", "") && (
                  <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Padrão
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">{getIntegrationDescription(integration.type)}</CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {integration.type === "bling" && (
                <>
                  <DropdownMenuItem onClick={() => actions.onBlingConfig(integration)}>
                    <Palette className="h-4 w-4 mr-2" />
                    Configurações de exibição
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.onBlingManage}>
                    <Settings className="h-4 w-4 mr-2" />
                    Gerenciar conexão
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.onBlingReconnect}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reconectar
                  </DropdownMenuItem>
                </>
              )}
              {integration.type === "evolution_whatsapp" && (
                <DropdownMenuItem onClick={() => actions.onEvolutionReconnect(integration)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reconectar WhatsApp
                </DropdownMenuItem>
              )}
              {integration.type === "loja_integrada" && (
                <>
                  <DropdownMenuItem onClick={() => actions.onSyncAll(integration)}>
                    <Download className="h-4 w-4 mr-2" />
                    Sincronizar tudo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.onLojaIntegradaReconnect}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reconectar
                  </DropdownMenuItem>
                </>
              )}
              {integration.type === "melhor_envio" && (
                <>
                  <DropdownMenuItem onClick={() => actions.onSyncAll(integration)}>
                    <Download className="h-4 w-4 mr-2" />
                    Sincronizar tudo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.onMelhorEnvioReconnect}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reconectar
                  </DropdownMenuItem>
                </>
              )}
              {integration.type === "nuvemshop" && (
                <>
                  <DropdownMenuItem onClick={() => actions.onSyncAll(integration)}>
                    <Download className="h-4 w-4 mr-2" />
                    Sincronizar tudo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.onNuvemshopManage}>
                    <Settings className="h-4 w-4 mr-2" />
                    Gerenciar conexão
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={actions.onNuvemshopReconnect}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reconectar
                  </DropdownMenuItem>
                </>
              )}
              {integration.type.startsWith("ai_") && (
                <>
                  <DropdownMenuItem onClick={() => actions.onAIReconnect(integration.type.replace("ai_", "") as Parameters<Actions["onAIReconnect"]>[0])}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reconectar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => actions.onSetDefaultAI(integration)}>
                    <Star className="h-4 w-4 mr-2" />
                    Tornar IA padrão
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => actions.onDelete(integration.id)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          {statusInfo ? (
            getStatusBadge(statusInfo.isConnected ? "connected" : "disconnected", statusInfo.isChecking)
          ) : (
            getStatusBadge(integration.status, true)
          )}
          {integration.last_sync_at && (
            <span className="text-xs text-muted-foreground">
              Sync: {new Date(integration.last_sync_at).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
        {integration.error_message && (
          <p className="mt-2 text-xs text-destructive line-clamp-2">{integration.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
}
