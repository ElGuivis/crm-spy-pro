import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, MessageSquare, CalendarClock, Repeat, Percent, Clock, Loader2 } from "lucide-react";
import {
  type ReactivationConfig, type Integration,
  STORE_TYPES, WHATSAPP_TYPES, getStoreIcon, getWhatsAppIcon,
} from "./reactivationHelpers";

interface Props {
  config: ReactivationConfig;
  setConfig: (cfg: ReactivationConfig) => void;
  integrations: Integration[];
  isLoadingIntegrations: boolean;
}

export function ReactivationBasicFields({ config, setConfig, integrations, isLoadingIntegrations }: Props) {
  const storeIntegrations = integrations.filter(i => STORE_TYPES.includes(i.type));
  const whatsappIntegrations = integrations.filter(i => WHATSAPP_TYPES.includes(i.type));

  return (
    <>
      <div className="space-y-1.5">
        <Label>Nome da automação</Label>
        <Input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} placeholder="Reativação de Clientes" />
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
        <div>
          <p className="text-sm font-medium">Automação ativa</p>
          <p className="text-xs text-muted-foreground">Apenas pedidos feitos após ativação serão monitorados</p>
        </div>
        <Switch checked={config.isActive} onCheckedChange={(v) => setConfig({ ...config, isActive: v })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Store className="h-4 w-4" /> Loja *</Label>
          {isLoadingIntegrations ? (
            <div className="flex items-center gap-2 p-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">Carregando...</span>
            </div>
          ) : (
            <Select value={config.integrationId || ""} onValueChange={(v) => setConfig({ ...config, integrationId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {storeIntegrations.map(i => (
                  <SelectItem key={i.id} value={i.id}>{getStoreIcon(i.type)} {i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /> WhatsApp *</Label>
          <Select value={config.whatsappIntegrationId || ""} onValueChange={(v) => setConfig({ ...config, whatsappIntegrationId: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione o WhatsApp" /></SelectTrigger>
            <SelectContent>
              {whatsappIntegrations.map(i => (
                <SelectItem key={i.id} value={i.id}>{getWhatsAppIcon(i.type)} {i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Dias de inatividade *</Label>
          <Input type="number" min={1} max={365}
            value={config.inactivityDays}
            onChange={(e) => setConfig({ ...config, inactivityDays: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">Sem compras há {config.inactivityDays}+ dias</p>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Repeat className="h-4 w-4" /> Máximo de ciclos</Label>
          <Input type="number" min={0} max={99}
            value={config.maxCycles}
            onChange={(e) => setConfig({ ...config, maxCycles: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">
            {config.maxCycles === 0 ? "Ilimitado (repete os ciclos)" : `Descarta após ${config.maxCycles} tentativa(s)`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Percent className="h-4 w-4" /> Desconto (%)</Label>
          <Input type="number" min={1} max={100}
            value={config.couponDiscountPercent}
            onChange={(e) => setConfig({ ...config, couponDiscountPercent: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Validade cupom (dias)</Label>
          <Input type="number" min={1}
            value={config.couponDurationDays}
            onChange={(e) => setConfig({ ...config, couponDurationDays: Number(e.target.value) })} />
        </div>
      </div>
    </>
  );
}
