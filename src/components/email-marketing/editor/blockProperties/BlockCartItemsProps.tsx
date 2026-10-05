import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorField } from "./fields";
import type { CartItemsBlock } from "../types";

interface Props {
  block: CartItemsBlock;
  onChange: (field: string, value: unknown) => void;
}

/** Lista dos produtos que a pessoa deixou no carrinho. Aqui mostra um exemplo; no envio entram os itens reais dela. */
export function BlockCartItemsProps({ block, onChange }: Props) {
  return (
    <>
      <p className="text-[11px] text-muted-foreground rounded-md bg-muted/50 p-2">
        No envio, este bloco mostra os produtos que a própria pessoa deixou no carrinho (foto, nome, quantidade, preço e total). Aqui aparece um exemplo.
      </p>
      <div className="space-y-2">
        <Label className="text-xs">Título acima da lista</Label>
        <Input value={block.title || ""} onChange={(e) => onChange("title", e.target.value)} placeholder="Você deixou isto no carrinho" />
      </div>
      <ColorField label="Cor do título" value={block.titleColor} fallback="#111827" onChange={(v) => onChange("titleColor", v)} />
      <ColorField label="Cor dos itens (nome e preço)" value={block.textColor} fallback="#111827" onChange={(v) => onChange("textColor", v)} />
    </>
  );
}
