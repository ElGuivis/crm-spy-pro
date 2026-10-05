import { Mail, MessageCircle, Pencil, Trash2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CouponConfigFields } from "../CouponConfigFields";
import { DELAY_OPTIONS, type RecoveryStep } from "@/lib/recovery";

interface Props {
  index: number;
  step: RecoveryStep;
  onChange: (patch: Partial<RecoveryStep>) => void;
  onRemove: () => void;
  onEditEmail: () => void;
  /** tempos já usados pelas outras etapas (a opção continua disponível, só é sinalizada) */
  usedDelays: number[];
  whatsappAvailable: boolean;
}

/** Uma etapa do fluxo: quando sai, por qual canal, o texto e o cupom. */
export function StepCard({ index, step, onChange, onRemove, onEditEmail, usedDelays, whatsappAvailable }: Props) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="h-7 w-7 justify-center rounded-full p-0">{index + 1}</Badge>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Enviar depois de</span>
              <Select value={String(step.delay_minutes)} onValueChange={(v) => onChange({ delay_minutes: Number(v) })}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELAY_OPTIONS.map((d) => (
                    <SelectItem key={d.minutes} value={String(d.minutes)}>{d.label}{usedDelays.includes(d.minutes) && d.minutes !== step.delay_minutes ? " (já usado)" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">do abandono</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={onRemove}><Trash2 className="h-4 w-4" />Remover etapa</Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4" />E-mail</span>
              <Switch checked={step.email.enabled} onCheckedChange={(v) => onChange({ email: { ...step.email, enabled: v } })} aria-label="E-mail desta etapa" />
            </div>
            {step.email.enabled && (
              step.email.campaign_id
                ? <Button variant="outline" size="sm" className="gap-2" onClick={onEditEmail}><Pencil className="h-4 w-4" />Editar e-mail e testar</Button>
                : <p className="text-xs text-muted-foreground">Use "Criar etapas padrão" para gerar o e-mail desta etapa.</p>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium"><MessageCircle className="h-4 w-4" />WhatsApp</span>
              <Switch checked={step.whatsapp.enabled} disabled={!whatsappAvailable && !step.whatsapp.enabled} onCheckedChange={(v) => onChange({ whatsapp: { ...step.whatsapp, enabled: v } })} aria-label="WhatsApp desta etapa" />
            </div>
            {!whatsappAvailable && !step.whatsapp.enabled && <p className="text-xs text-muted-foreground">Conecte um WhatsApp em Integrações para usar este canal.</p>}
            {step.whatsapp.enabled && (
              <>
                <Textarea rows={4} value={step.whatsapp.text} onChange={(e) => onChange({ whatsapp: { ...step.whatsapp, text: e.target.value } })}
                  placeholder={"Oi {{first_name}}! Seus itens ainda estão separados:\n{{cart_items_text}}\n\nFinalize aqui: {{cart_url}}"} />
                <p className="text-[11px] text-muted-foreground">
                  Só sai para quem tem telefone. Variáveis: {"{{first_name}} {{cart_items_text}} {{cart_total}} {{cart_url}} {{coupon_code}} {{coupon_value}}"}. Cada mensagem custa 2 tokens.
                </p>
              </>
            )}
          </div>
        </div>

        <CouponConfigFields
          value={step.coupon}
          onChange={(coupon) => onChange({ coupon })}
          title="Cupom único nesta etapa"
          description="Cada pessoa recebe um cupom só dela (1 uso), criado na loja no momento do envio. Vale para o e-mail e o WhatsApp desta etapa."
          help={<>Use <code className="font-mono">{"{{coupon_code}}"}</code>, <code className="font-mono">{"{{coupon_value}}"}</code> e <code className="font-mono">{"{{coupon_expires}}"}</code> no e-mail e no WhatsApp. Exige a Loja Integrada conectada.</>}
        />
      </CardContent>
    </Card>
  );
}
