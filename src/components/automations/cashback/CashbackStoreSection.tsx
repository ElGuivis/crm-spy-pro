import { Loader2, AlertCircle, CheckSquare, Store } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CashbackConfig, Integration, STORE_TYPES, getStoreIntegrationIcon } from "./cashback-config-types";

interface CashbackStoreSectionProps {
  config: CashbackConfig;
  setConfig: (config: CashbackConfig) => void;
  availableIntegrations: Integration[];
  isLoadingIntegrations: boolean;
  availableStatuses: string[];
  isLoadingStatuses: boolean;
  onStatusToggle: (status: string) => void;
}

export function CashbackStoreSection({
  config,
  setConfig,
  availableIntegrations,
  isLoadingIntegrations,
  availableStatuses,
  isLoadingStatuses,
  onStatusToggle,
}: CashbackStoreSectionProps) {
  const storeIntegrations = availableIntegrations.filter(i => STORE_TYPES.includes(i.type));

  return (
    <>
      {/* Store Integration */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Store className="h-4 w-4 text-muted-foreground" />
          Integração da Loja
        </Label>
        {isLoadingIntegrations ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-border">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Carregando integrações...</span>
          </div>
        ) : storeIntegrations.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">
              Nenhuma loja conectada. Configure uma integração de e-commerce primeiro.
            </span>
          </div>
        ) : (
          <Select
            value={config.integrationId || ""}
            onValueChange={(value) => {
              const selected = availableIntegrations.find(i => i.id === value);
              setConfig({ ...config, integrationId: value, integration: selected?.name || "" });
            }}
          >
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Selecione a loja" />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border z-50">
              {storeIntegrations.map((integration) => (
                <SelectItem key={integration.id} value={integration.id}>
                  <span className="flex items-center gap-2">
                    <span>{getStoreIntegrationIcon(integration.type)}</span>
                    <span>{integration.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({integration.type.replace(/_/g, ' ')})
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-muted-foreground">
          Selecione de onde vão vir os dados de compra e onde os cupons serão criados
        </p>
      </div>

      {/* Trigger Statuses */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-muted-foreground" />
          Status de Gatilho
        </Label>
        {isLoadingStatuses ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-border">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Carregando status...</span>
          </div>
        ) : !config.integrationId ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
            <AlertCircle className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-blue-600">
              Selecione uma loja acima para ver os status disponíveis.
            </span>
          </div>
        ) : availableStatuses.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-amber-600">
              Nenhum status encontrado. Sincronize os pedidos primeiro.
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg border border-border max-h-40 overflow-y-auto">
            {availableStatuses.map((status) => (
              <div key={status} className="flex items-center gap-2">
                <Checkbox
                  id={`status-${status}`}
                  checked={config.triggerStatuses.includes(status)}
                  onCheckedChange={() => onStatusToggle(status)}
                />
                <label htmlFor={`status-${status}`} className="text-sm cursor-pointer">
                  {status}
                </label>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Selecione os status que irão disparar a criação do cupom de cashback
        </p>
      </div>
    </>
  );
}
