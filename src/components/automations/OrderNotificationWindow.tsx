import { Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { OrderNotificationConfig } from "@/lib/orderNotification";

const hourLabel = (h: number) => `${String(h === 24 ? 0 : h).padStart(2, "0")}h`;

/** Horário permitido para enviar (Brasília). Fora dele a mensagem espera a abertura da janela. */
export function OrderNotificationWindow({ config, setConfig }: { config: OrderNotificationConfig; setConfig: (c: OrderNotificationConfig) => void }) {
  const invalid = config.send_window_enabled && config.send_window_start >= config.send_window_end;
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Só enviar em horário comercial</p>
            <p className="text-xs text-muted-foreground">Fora do horário a mensagem espera e sai quando a janela abrir (horário de Brasília).</p>
          </div>
        </div>
        <Switch checked={config.send_window_enabled} aria-label="Só enviar em horário comercial" onCheckedChange={(v) => setConfig({ ...config, send_window_enabled: v })} />
      </div>
      {config.send_window_enabled && (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-sm">Das</Label>
          <Select value={String(config.send_window_start)} onValueChange={(v) => setConfig({ ...config, send_window_start: Number(v) })}>
            <SelectTrigger className="w-24" aria-label="Início do horário"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 24 }, (_, h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}</SelectContent>
          </Select>
          <Label className="text-sm">às</Label>
          <Select value={String(config.send_window_end)} onValueChange={(v) => setConfig({ ...config, send_window_end: Number(v) })}>
            <SelectTrigger className="w-24" aria-label="Fim do horário"><SelectValue /></SelectTrigger>
            <SelectContent>{Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}{h === 24 ? " (meia-noite)" : ""}</SelectItem>)}</SelectContent>
          </Select>
          {invalid && <span className="text-xs text-destructive">O início precisa ser antes do fim.</span>}
        </div>
      )}
    </div>
  );
}
