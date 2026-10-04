import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariablesPicker } from "../../VariablesPicker";
import { AlignField, ColorField, PxField, SpacingField, SwitchField } from "./fields";
import type { EmailBlock, SocialBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: unknown) => void;
}

const PLATFORMS: SocialBlock["platforms"][number]["name"][] = ["facebook", "instagram", "twitter", "linkedin", "youtube"];
const PLATFORM_LABELS: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", twitter: "X / Twitter", linkedin: "LinkedIn", youtube: "YouTube" };

export function BlockInteractiveProps({ block, onChange }: Props) {
  if (block.type === "button") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">Texto do botão</Label>
          <Input value={block.text || ""} onChange={(e) => onChange("text", e.target.value)} />
          <VariablesPicker onSelect={(variable) => onChange("text", (block.text || "") + variable)} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Link</Label>
          <Input value={block.url || ""} onChange={(e) => onChange("url", e.target.value)} placeholder="https://..." />
        </div>
        <AlignField value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />
        <SwitchField label="Botão em largura total" checked={!!block.fullWidth} onChange={(v) => onChange("fullWidth", v)} />
        <ColorField label="Cor do botão" value={block.buttonColor} fallback="#0066cc" onChange={(v) => onChange("buttonColor", v)} />
        <ColorField label="Cor do texto" value={block.textColor} fallback="#ffffff" onChange={(v) => onChange("textColor", v)} />
        <PxField label="Tamanho da fonte" value={block.fontSize} placeholder="16" onChange={(v) => onChange("fontSize", v)} />
        <SpacingField label="Tamanho do botão (espaço interno)" value={block.buttonPadding} fallback="12px 30px" onChange={(v) => onChange("buttonPadding", v)} />
      </>
    );
  }

  if (block.type === "unsubscribe") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">Texto</Label>
          <Input value={block.text || ""} onChange={(e) => onChange("text", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Texto do link</Label>
          <Input value={block.linkText || ""} onChange={(e) => onChange("linkText", e.target.value)} />
        </div>
        <AlignField value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />
        <ColorField label="Cor do texto" value={block.color} fallback="#999999" onChange={(v) => onChange("color", v)} />
        <PxField label="Tamanho da fonte" value={block.fontSize} placeholder="12" onChange={(v) => onChange("fontSize", v)} />
      </>
    );
  }

  if (block.type === "social") {
    const platforms = block.platforms || [];
    const free = PLATFORMS.filter((p) => !platforms.some((x) => x.name === p));
    return (
      <>
        <AlignField value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />
        <PxField label="Tamanho dos ícones" value={block.iconSize} placeholder="32" onChange={(v) => onChange("iconSize", v)} />
        <div className="space-y-2">
          <Label className="text-xs">Redes sociais</Label>
          {platforms.map((platform, i) => (
            <div key={platform.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{PLATFORM_LABELS[platform.name]}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Remover"
                  onClick={() => onChange("platforms", platforms.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                value={platform.url}
                onChange={(e) => onChange("platforms", platforms.map((p, j) => (j === i ? { ...p, url: e.target.value } : p)))}
                placeholder="https://..."
              />
            </div>
          ))}
          {free.length > 0 && (
            <Select value="" onValueChange={(v) => onChange("platforms", [...platforms, { name: v, url: "" }])}>
              <SelectTrigger className="h-8 text-xs"><Plus className="mr-2 h-3 w-3" /><SelectValue placeholder="Adicionar rede social" /></SelectTrigger>
              <SelectContent>
                {free.map((p) => <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </>
    );
  }

  return null;
}
