import { Percent, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type BirthdayCouponType = "porcentagem" | "fixo" | "frete_gratis";

export interface BirthdayCouponValues {
  couponType: BirthdayCouponType;
  couponDiscountPercent: number;
  couponFixedValue: number | null;
  maxDiscountValue: number | null;
  minOrderValue: number | null;
  couponDurationDays: number;
  cumulative: boolean;
  personalCoupon: boolean;
}

interface Props {
  values: BirthdayCouponValues;
  onChange: (patch: Partial<BirthdayCouponValues>) => void;
}

const numOrNull = (v: string): number | null => (v === "" ? null : Number(v));

function SwitchRow({ title, hint, checked, onCheckedChange }: { title: string; hint: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/** Opções do cupom de aniversário: tipo, valor, teto, pedido mínimo, validade, acumulativo e pessoal. */
export function BirthdayCouponOptions({ values: v, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo de cupom</Label>
          <Select value={v.couponType} onValueChange={(t) => onChange({ couponType: t as BirthdayCouponType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="porcentagem">Percentual (%)</SelectItem>
              <SelectItem value="fixo">Valor fixo (R$)</SelectItem>
              <SelectItem value="frete_gratis">Frete grátis</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {v.couponType === "porcentagem" && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Percent className="h-4 w-4" /> Desconto (%)</Label>
            <Input type="number" min={1} max={100} value={v.couponDiscountPercent} onChange={(e) => onChange({ couponDiscountPercent: Number(e.target.value) })} />
          </div>
        )}
        {v.couponType === "fixo" && (
          <div className="space-y-1.5">
            <Label>Desconto (R$)</Label>
            <Input type="number" min={1} step="0.01" value={v.couponFixedValue ?? ""} onChange={(e) => onChange({ couponFixedValue: numOrNull(e.target.value) })} />
          </div>
        )}
        {v.couponType === "frete_gratis" && (
          <div className="flex items-end pb-2 text-xs text-muted-foreground">O cupom zera o frete do pedido.</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Validade (dias)</Label>
          <Input type="number" min={1} value={v.couponDurationDays} onChange={(e) => onChange({ couponDurationDays: Number(e.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label>Pedido mínimo (R$)</Label>
          <Input type="number" min={0} step="0.01" placeholder="Sem mínimo" value={v.minOrderValue ?? ""} onChange={(e) => onChange({ minOrderValue: numOrNull(e.target.value) })} />
        </div>
      </div>

      {v.couponType === "porcentagem" && (
        <div className="space-y-1.5">
          <Label>Teto do desconto (R$)</Label>
          <Input type="number" min={0} step="0.01" placeholder="Sem teto" value={v.maxDiscountValue ?? ""} onChange={(e) => onChange({ maxDiscountValue: numOrNull(e.target.value) })} />
          <p className="text-xs text-muted-foreground">Limita o quanto o percentual pode descontar, mesmo em carrinho grande.</p>
        </div>
      )}

      <SwitchRow
        title="Cupom acumulativo"
        hint="Pode ser usado junto com outras promoções e cupons da loja."
        checked={v.cumulative}
        onCheckedChange={(cumulative) => onChange({ cumulative })}
      />
      <SwitchRow
        title="Cupom pessoal"
        hint="Só o aniversariante consegue usar (clientes sem cadastro na loja recebem cupom aberto)."
        checked={v.personalCoupon}
        onCheckedChange={(personalCoupon) => onChange({ personalCoupon })}
      />
    </div>
  );
}
