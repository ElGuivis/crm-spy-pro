import { ShieldCheck, Hourglass, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CashbackConfig, MinOrderMode } from "./cashback-config-types";

interface Props {
  config: CashbackConfig;
  setConfig: (config: CashbackConfig) => void;
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const EXAMPLE_ORDER = 300; // valor de produtos de uma compra de exemplo (sem frete)

/** Mesma conta do servidor (_shared/cashback-rules.ts), só para a simulação da tela. */
function simulate(c: CashbackConfig) {
  let credit = (EXAMPLE_ORDER * c.discountPercent) / 100;
  if (c.maxDiscountValue && credit > c.maxDiscountValue) credit = c.maxDiscountValue;
  credit = Math.round(credit * 100) / 100;
  const minOrder = c.minOrderMode === "fixed" && c.minOrderValue ? c.minOrderValue
    : c.minOrderMode === "multiple" && c.minOrderValue ? credit * c.minOrderValue : null;
  return { credit, minOrder };
}

const Row = ({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/50">
    <div className="space-y-0.5">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </div>
);

export function CashbackRulesSection({ config, setConfig }: Props) {
  const set = (patch: Partial<CashbackConfig>) => setConfig({ ...config, ...patch });
  const sim = simulate(config);
  const capped = config.maxCartPercent != null;

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" /> Regras de liberação e uso do crédito
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Hourglass className="h-4 w-4 text-muted-foreground" /> Liberar o crédito após</Label>
          <div className="relative">
            <Input type="number" min={0} max={365} value={config.releaseDelayDays} className="pr-12"
              onChange={(e) => set({ releaseDelayDays: Math.max(0, parseInt(e.target.value) || 0) })} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">dias</span>
          </div>
          <p className="text-xs text-muted-foreground">0 = na hora. Antes de liberar, o sistema confere de novo se o pedido não foi cancelado ou devolvido.</p>
        </div>

        <div className="space-y-2">
          <Label>Crédito mínimo para emitir (R$)</Label>
          <Input type="number" min={0} value={config.minCreditValue}
            onChange={(e) => set({ minCreditValue: parseFloat(e.target.value) || 0 })} />
          <p className="text-xs text-muted-foreground">Créditos menores que isso não geram cupom. 0 = sem mínimo.</p>
        </div>
      </div>

      <Row title="Limitar o desconto a uma % do carrinho" checked={capped}
        hint="O cupom abate no máximo essa % da compra futura, e nunca mais que o valor do crédito. Desligado = cupom de valor fixo."
        onChange={(v) => set({ maxCartPercent: v ? 30 : null })} />
      {capped && (
        <div className="space-y-2 pl-1">
          <Label>Desconto máximo do carrinho</Label>
          <div className="relative max-w-[200px]">
            <Input type="number" min={1} max={100} value={config.maxCartPercent ?? ""} className="pr-8"
              onChange={(e) => set({ maxCartPercent: e.target.value ? parseFloat(e.target.value) : null })} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Pedido mínimo para usar o cupom</Label>
          <Select value={config.minOrderMode} onValueChange={(v) => set({ minOrderMode: v as MinOrderMode, minOrderValue: v === "none" ? null : (config.minOrderValue ?? (v === "multiple" ? 10 : 100)) })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem mínimo</SelectItem>
              <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
              <SelectItem value="multiple">Múltiplo do crédito (×)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {config.minOrderMode !== "none" && (
          <div className="space-y-2">
            <Label>{config.minOrderMode === "fixed" ? "Valor mínimo (R$)" : "Vezes o valor do crédito"}</Label>
            <Input type="number" min={0} step="any" value={config.minOrderValue ?? ""}
              onChange={(e) => set({ minOrderValue: e.target.value ? parseFloat(e.target.value) : null })} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Row title="Calcular sobre produtos, sem o frete" checked={config.baseExcludesShipping}
          hint="Base = produtos menos descontos (o que o cliente pagou de fato). Desligado = usa o total com frete."
          onChange={(v) => set({ baseExcludesShipping: v })} />
        <Row title="Cupom pessoal" checked={config.personalCoupon}
          hint="Só o cliente que ganhou consegue usar o cupom."
          onChange={(v) => set({ personalCoupon: v })} />
        <Row title="Acumula com outras promoções" checked={config.cumulative}
          hint="O cupom pode ser usado junto com outros cupons e descontos da loja."
          onChange={(v) => set({ cumulative: v })} />
        <Row title="Desativar se o pedido for cancelado ou devolvido" checked={config.cancelOnRefund}
          hint="Cupom ainda não usado é desativado na loja quando o pedido de origem é cancelado, devolvido ou entra em chargeback."
          onChange={(v) => set({ cancelOnRefund: v })} />
      </div>

      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm space-y-1">
        <div className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4 text-primary" /> Simulação: compra de {brl(EXAMPLE_ORDER)} em produtos</div>
        {sim.credit > 0 ? (
          <p className="text-muted-foreground">
            Crédito de <strong className="text-foreground">{brl(sim.credit)}</strong>
            {config.releaseDelayDays > 0 ? `, liberado ${config.releaseDelayDays} dias depois da compra` : ", liberado na hora"}
            {`, válido por ${config.durationDays} dias. `}
            {capped
              ? <>Na próxima compra abate até <strong className="text-foreground">{config.maxCartPercent}% do carrinho</strong>, no máximo {brl(sim.credit)}</>
              : <>Na próxima compra abate {brl(sim.credit)} fixos</>}
            {sim.minOrder ? <>, com pedido mínimo de <strong className="text-foreground">{brl(sim.minOrder)}</strong>.</> : ", sem pedido mínimo."}
            {capped && sim.minOrder && sim.minOrder > 0 && config.maxCartPercent
              ? ` Com esse mínimo, o desconto real chega a ${Math.min(config.maxCartPercent, Math.round((sim.credit / sim.minOrder) * 100))}% da compra.` : ""}
          </p>
        ) : (
          <p className="text-muted-foreground">Com essa configuração a compra de exemplo não gera crédito.</p>
        )}
      </div>
    </div>
  );
}
