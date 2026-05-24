import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VariablesPicker } from "../../VariablesPicker";
import type { EmailBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: any) => void;
}

export function BlockInteractiveProps({ block, onChange }: Props) {
  if (block.type === "button") {
    return (
      <>
        <div className="space-y-2">
          <Label>Texto do Botão</Label>
          <Input value={block.text || ""} onChange={(e) => onChange("text", e.target.value)} />
          <VariablesPicker onSelect={(variable) => onChange("text", (block.text || "") + variable)} />
        </div>
        <div className="space-y-2">
          <Label>URL</Label>
          <Input value={block.url || ""} onChange={(e) => onChange("url", e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-2">
          <Label>Cor do Botão</Label>
          <Input type="color" value={block.buttonColor || "#0066cc"} onChange={(e) => onChange("buttonColor", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Cor do Texto</Label>
          <Input type="color" value={block.textColor || "#ffffff"} onChange={(e) => onChange("textColor", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Border Radius</Label>
          <Input value={block.borderRadius || ""} onChange={(e) => onChange("borderRadius", e.target.value)} placeholder="4px" />
        </div>
      </>
    );
  }

  if (block.type === "unsubscribe") {
    return (
      <>
        <div className="space-y-2">
          <Label>Texto</Label>
          <Input value={block.text || ""} onChange={(e) => onChange("text", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Texto do Link</Label>
          <Input value={block.linkText || ""} onChange={(e) => onChange("linkText", e.target.value)} />
        </div>
      </>
    );
  }

  if (block.type === "social") {
    return (
      <div className="p-3 rounded bg-muted/50 text-sm text-muted-foreground">
        Configure os links das redes sociais diretamente nos campos abaixo.
        {block.platforms?.map((platform, i) => (
          <div key={i} className="mt-2 space-y-1">
            <Label className="text-xs capitalize">{platform.name}</Label>
            <Input
              value={platform.url}
              onChange={(e) => {
                const updated = [...(block.platforms || [])];
                updated[i] = { ...updated[i], url: e.target.value };
                onChange("platforms", updated);
              }}
              placeholder="https://..."
            />
          </div>
        ))}
      </div>
    );
  }

  return null;
}
