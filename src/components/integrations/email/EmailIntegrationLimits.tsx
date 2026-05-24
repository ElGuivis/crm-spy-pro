import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";

interface Props {
  dailyLimit: string;
  maxPerSecond: string;
  onDailyLimitChange: (v: string) => void;
  onMaxPerSecondChange: (v: string) => void;
}

export function EmailIntegrationLimits({ dailyLimit, maxPerSecond, onDailyLimitChange, onMaxPerSecondChange }: Props) {
  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Limites de Envio</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure os limites do seu provedor SMTP (ex: Amazon SES). Deixe em branco para não aplicar limite.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="daily_send_limit">Cota diária (emails/24h)</Label>
            <Input
              id="daily_send_limit" type="number" min="0" placeholder="Ex: 50000"
              value={dailyLimit}
              onChange={(e) => onDailyLimitChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max_sends_per_second">Emails por segundo</Label>
            <Input
              id="max_sends_per_second" type="number" min="1" placeholder="Ex: 14"
              value={maxPerSecond}
              onChange={(e) => onMaxPerSecondChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
