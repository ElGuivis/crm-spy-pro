import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EmailIntegrationOption, WhatsAppOption } from "@/hooks/useRecoveryEnv";
import { delayLabel, type RecoveryFlow } from "@/lib/recovery";

interface Props {
  flow: RecoveryFlow;
  onChange: (patch: Partial<RecoveryFlow>) => void;
  emailIntegrations: EmailIntegrationOption[];
  whatsapps: WhatsAppOption[];
  nativeName: string;
  nativeOn: boolean | null;
}

const AGES = [24, 48, 72, 96, 168];
const COOLDOWNS = [0, 1, 3, 7, 14];

/** Regras do fluxo: de onde sai, quando não incomodar, quem não atender e como conviver com a automação nativa. */
export function FlowSettings({ flow, onChange, emailIntegrations, whatsapps, nativeName, nativeOn }: Props) {
  const lastDelay = Math.max(0, ...flow.steps.map((s) => s.delay_minutes));
  const tooShort = flow.max_event_age_hours * 60 < lastDelay + 60;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Regras do fluxo</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Integração de e-mail</Label>
            <Select value={flow.email_integration_id ?? ""} onValueChange={(v) => onChange({ email_integration_id: v })}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{emailIntegrations.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}{i.sender_email ? ` · ${i.sender_email}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">WhatsApp (opcional)</Label>
            <Select value={flow.whatsapp_integration_id ?? "none"} onValueChange={(v) => onChange({ whatsapp_integration_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem WhatsApp</SelectItem>
                {whatsapps.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.connected ? "" : " (desconectado)"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Não enviar a partir das</Label>
            <Input type="time" value={flow.quiet_start} onChange={(e) => onChange({ quiet_start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Voltar a enviar às</Label>
            <Input type="time" value={flow.quiet_end} onChange={(e) => onChange({ quiet_end: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Não repetir a mesma pessoa por</Label>
            <Select value={String(flow.cooldown_days)} onValueChange={(v) => onChange({ cooldown_days: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COOLDOWNS.map((d) => <SelectItem key={d} value={String(d)}>{d === 0 ? "Sem intervalo" : `${d} dia${d > 1 ? "s" : ""}`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ignorar abandonos com mais de</Label>
            <Select value={String(flow.max_event_age_hours)} onValueChange={(v) => onChange({ max_event_age_hours: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AGES.map((h) => <SelectItem key={h} value={String(h)}>{h >= 48 ? `${h / 24} dias` : `${h} horas`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Janela de silêncio (horário de Brasília): nada sai entre os horários acima; o que ficou para trás sai quando a janela abre, sempre com 30 minutos entre etapas.
          {tooShort && <span className="text-amber-600"> A última etapa ({delayLabel(lastDelay)}) passa do prazo de {flow.max_event_age_hours} h: aumente o prazo ou ela não sairá.</span>}
        </p>

        {flow.kind !== "browse" && flow.kind !== "welcome" && (
          <div className="space-y-1.5 max-w-[240px]">
            <Label className="text-xs">Valor mínimo do carrinho (R$)</Label>
            <Input type="number" min={0} placeholder="Sem mínimo" value={flow.min_value || ""} onChange={(e) => onChange({ min_value: parseFloat(e.target.value) || 0 })} />
          </div>
        )}

        {flow.kind !== "welcome" && (
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Tirar da automação nativa quem nós atendermos</p>
            <p className="text-xs text-muted-foreground">
              Cada pessoa que entrar no nosso fluxo sai da automação "{nativeName}" da Loja Integrada, para não receber duas vezes.
              {nativeOn ? " A nativa está LIGADA agora." : nativeOn === false ? " A nativa está desligada." : ""} Para desligar a nativa para todos, use a aba "Loja Integrada".
              A nativa dispara a partir de 1 hora: com esta opção, deixe a sua primeira etapa antes disso.
            </p>
          </div>
          <Switch checked={flow.opt_out_native} onCheckedChange={(v) => onChange({ opt_out_native: v })} aria-label="Tirar da nativa quem atendermos" />
        </div>
        )}
      </CardContent>
    </Card>
  );
}
