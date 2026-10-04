import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampaignFormData } from "@/hooks/useEmailCampaignForm";

const DEFAULT = { enabled: true, tipo: "porcentagem", valor: 10, validade_dias: 7, valor_minimo: null as number | null, prefixo: "" } as const;

/** Cupom único por pessoa: cada destinatário recebe um código só dele (1 uso), criado na Loja Integrada no momento do envio. */
export function UniqueCouponFields({ form }: { form: UseFormReturn<CampaignFormData> }) {
  const value = form.watch("unique_coupon");
  const on = !!value?.enabled;
  const set = (patch: Record<string, unknown>) => form.setValue("unique_coupon", { ...DEFAULT, ...(value ?? {}), ...patch } as CampaignFormData["unique_coupon"], { shouldDirty: true });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Cupom único para cada pessoa</p>
          <p className="text-xs text-muted-foreground">
            Cada destinatário recebe um código só dele, que vale 1 uso. Evita que o cupom vaze e mede a compra de cada pessoa com exatidão. Os cupons são criados na loja durante o envio.
          </p>
        </div>
        <Switch checked={on} onCheckedChange={(v) => (v ? set({ enabled: true }) : form.setValue("unique_coupon", value ? { ...value, enabled: false } : null, { shouldDirty: true }))} aria-label="Cupom único por pessoa" />
      </div>

      {on && value && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={value.tipo} onValueChange={(v) => set({ tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentagem">Porcentagem</SelectItem>
                  <SelectItem value="fixo">Valor fixo (R$)</SelectItem>
                  <SelectItem value="frete_gratis">Frete grátis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{value.tipo === "porcentagem" ? "Desconto (%)" : "Valor (R$)"}</Label>
              <Input type="number" min={0} max={value.tipo === "porcentagem" ? 100 : 100000} disabled={value.tipo === "frete_gratis"} value={value.valor} onChange={(e) => set({ valor: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vale por (dias)</Label>
              <Input type="number" min={1} max={365} value={value.validade_dias} onChange={(e) => set({ validade_dias: Math.min(Math.max(parseInt(e.target.value) || 1, 1), 365) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pedido mínimo (R$)</Label>
              <Input type="number" min={0} placeholder="Sem mínimo" value={value.valor_minimo ?? ""} onChange={(e) => set({ valor_minimo: e.target.value ? parseFloat(e.target.value) : null })} />
            </div>
          </div>
          <div className="space-y-1.5 max-w-[200px]">
            <Label className="text-xs">Início do código (opcional)</Label>
            <Input maxLength={8} placeholder="Ex.: BLACK" value={value.prefixo ?? ""} onChange={(e) => set({ prefixo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} />
          </div>
          <p className="text-xs text-muted-foreground">
            No e-mail, use <code className="font-mono">{"{{coupon_code}}"}</code> no bloco de cupom (e, se quiser, <code className="font-mono">{"{{coupon_value}}"}</code> para o desconto e <code className="font-mono">{"{{coupon_expires}}"}</code> para a validade).
            Exige a Loja Integrada conectada. Cada cupom entra na loja como um cupom a mais, de uso único.
          </p>
        </div>
      )}
    </div>
  );
}
