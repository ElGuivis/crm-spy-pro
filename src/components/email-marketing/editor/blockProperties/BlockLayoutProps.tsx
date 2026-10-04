import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorField, PxField, WidthField } from "./fields";
import type { Columns2Block, EmailBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: unknown) => void;
}

const RATIO_LABELS: Record<NonNullable<Columns2Block["ratio"]>, string> = {
  "50-50": "Iguais (50% / 50%)",
  "33-67": "Estreita + larga (33% / 67%)",
  "67-33": "Larga + estreita (67% / 33%)",
  "25-75": "Bem estreita + larga (25% / 75%)",
  "75-25": "Larga + bem estreita (75% / 25%)",
};

export function BlockLayoutProps({ block, onChange }: Props) {
  if (block.type === "divider") {
    return (
      <>
        <ColorField label="Cor da linha" value={block.color} fallback="#dddddd" onChange={(v) => onChange("color", v)} />
        <PxField label="Espessura" value={block.thickness} placeholder="1" max={20} onChange={(v) => onChange("thickness", v)} />
        <WidthField value={block.width} onChange={(v) => onChange("width", v)} />
      </>
    );
  }

  if (block.type === "spacer") {
    return <PxField label="Altura" value={block.height} placeholder="20" max={300} onChange={(v) => onChange("height", v)} />;
  }

  if (block.type === "columns-2" || block.type === "columns-3") {
    return (
      <>
        {block.type === "columns-2" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Proporção das colunas</Label>
            <Select value={block.ratio || "50-50"} onValueChange={(v) => onChange("ratio", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RATIO_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Alinhamento vertical</Label>
          <Select value={block.verticalAlign || "top"} onValueChange={(v) => onChange("verticalAlign", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="top">No topo</SelectItem>
              <SelectItem value="middle">Centralizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Espaço entre colunas</Label>
          <Input value={block.columnGap || ""} onChange={(e) => onChange("columnGap", e.target.value)} placeholder="20px" />
        </div>
        <div className="p-3 rounded bg-muted/50 text-sm text-muted-foreground">
          Clique em uma coluna no editor para selecionar onde adicionar blocos. Depois escolha um bloco na barra lateral.
        </div>
      </>
    );
  }

  return null;
}
