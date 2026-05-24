import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmailBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: any) => void;
}

export function BlockLayoutProps({ block, onChange }: Props) {
  if (block.type === "divider") {
    return (
      <>
        <div className="space-y-2">
          <Label>Cor</Label>
          <Input type="color" value={block.color || "#dddddd"} onChange={(e) => onChange("color", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Espessura</Label>
          <Input value={block.thickness || ""} onChange={(e) => onChange("thickness", e.target.value)} placeholder="1px" />
        </div>
      </>
    );
  }

  if (block.type === "spacer") {
    return (
      <div className="space-y-2">
        <Label>Altura</Label>
        <Input value={block.height || ""} onChange={(e) => onChange("height", e.target.value)} placeholder="20px" />
      </div>
    );
  }

  if (block.type === "columns-2" || block.type === "columns-3") {
    return (
      <>
        <div className="space-y-2">
          <Label>Espaço entre Colunas</Label>
          <Input
            value={(block as any).columnGap || ""}
            onChange={(e) => onChange("columnGap", e.target.value)}
            placeholder="20px"
          />
        </div>
        <div className="p-3 rounded bg-muted/50 text-sm text-muted-foreground">
          Clique em uma coluna no editor para selecionar onde adicionar blocos. Depois escolha um bloco na barra lateral.
        </div>
      </>
    );
  }

  return null;
}
