import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlignField, ColorField } from "./fields";
import type { CouponBlock } from "../types";

interface Props {
  block: CouponBlock;
  onChange: (field: string, value: unknown) => void;
}

/** Cupom em destaque. O mesmo código deve ser informado em "Cupons da campanha" para contar as compras. */
export function BlockCouponProps({ block, onChange }: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs">Código do cupom</Label>
        <Input className="font-mono uppercase" value={block.code || ""} onChange={(e) => onChange("code", e.target.value.toUpperCase().replace(/\s+/g, ""))} placeholder="BLACK10" />
        <p className="text-[11px] text-muted-foreground">Informe o mesmo código em "Cupons da campanha" (aba Detalhes) para medir as compras feitas com ele.</p>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Título</Label>
        <Input value={block.title || ""} onChange={(e) => onChange("title", e.target.value)} placeholder="Use o cupom" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Descrição</Label>
        <Textarea rows={2} value={block.description || ""} onChange={(e) => onChange("description", e.target.value)} placeholder="10% de desconto na primeira compra" />
      </div>
      <AlignField value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />
      <ColorField label="Cor da borda e do código" value={block.borderColor} fallback="#0066cc" onChange={(v) => onChange("borderColor", v)} />
      <ColorField label="Cor do código (se diferente)" value={block.codeColor} fallback="#0066cc" onChange={(v) => onChange("codeColor", v)} />
      <ColorField label="Fundo da caixa" value={block.codeBackground} fallback="#f5f9ff" onChange={(v) => onChange("codeBackground", v)} />
      <ColorField label="Cor do título" value={block.titleColor} fallback="#555555" onChange={(v) => onChange("titleColor", v)} />
      <ColorField label="Cor da descrição" value={block.descriptionColor} fallback="#777777" onChange={(v) => onChange("descriptionColor", v)} />
    </>
  );
}
