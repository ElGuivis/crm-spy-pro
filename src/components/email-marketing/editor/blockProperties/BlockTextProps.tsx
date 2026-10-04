import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariablesPicker } from "../../VariablesPicker";
import { FormattedTextarea } from "./FormattedTextarea";
import { AlignField, ColorField, PxField, SwitchField } from "./fields";
import type { EmailBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: unknown) => void;
}

function TypographyExtras({ block, onChange }: { block: { uppercase?: boolean; letterSpacing?: string }; onChange: (field: string, value: unknown) => void }) {
  return (
    <>
      <SwitchField label="MAIÚSCULAS" checked={!!block.uppercase} onChange={(v) => onChange("uppercase", v)} />
      <div className="space-y-1.5">
        <Label className="text-xs">Espaço entre letras</Label>
        <Select value={block.letterSpacing || "normal"} onValueChange={(v) => onChange("letterSpacing", v === "normal" ? undefined : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="1px">Aberto</SelectItem>
            <SelectItem value="3px">Bem aberto</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

const FORMAT_HINT = "Selecione o trecho e use os botões. Enter pula linha.";

export function BlockTextProps({ block, onChange }: Props) {
  if (block.type === "heading") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">Texto</Label>
          <Input value={block.text || ""} onChange={(e) => onChange("text", e.target.value)} />
          <VariablesPicker onSelect={(variable) => onChange("text", (block.text || "") + variable)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Nível</Label>
          <Select value={block.level} onValueChange={(v) => onChange("level", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="h1">H1</SelectItem>
              <SelectItem value="h2">H2</SelectItem>
              <SelectItem value="h3">H3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <AlignField value={block.alignment} fallback="left" onChange={(v) => onChange("alignment", v)} />
        <ColorField label="Cor do texto" value={block.color} fallback="#333333" onChange={(v) => onChange("color", v)} />
        <PxField label="Tamanho da fonte" value={block.fontSize} placeholder="32" onChange={(v) => onChange("fontSize", v)} />
        <SwitchField label="Negrito" checked={block.fontWeight !== "normal"} onChange={(v) => onChange("fontWeight", v ? "bold" : "normal")} />
        <TypographyExtras block={block} onChange={onChange} />
      </>
    );
  }

  if (block.type === "text") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">Conteúdo</Label>
          <FormattedTextarea value={block.content || ""} onChange={(v) => onChange("content", v)} rows={6} />
          <p className="text-[11px] text-muted-foreground">{FORMAT_HINT}</p>
          <VariablesPicker onSelect={(variable) => onChange("content", (block.content || "") + variable)} />
        </div>
        <AlignField value={block.alignment} fallback="left" onChange={(v) => onChange("alignment", v)} />
        <ColorField label="Cor do texto" value={block.color} fallback="#666666" onChange={(v) => onChange("color", v)} />
        <PxField label="Tamanho da fonte" value={block.fontSize} placeholder="16" onChange={(v) => onChange("fontSize", v)} />
        <SwitchField label="Negrito" checked={block.fontWeight === "bold"} onChange={(v) => onChange("fontWeight", v ? "bold" : "normal")} />
        <TypographyExtras block={block} onChange={onChange} />
        <div className="space-y-1.5">
          <Label className="text-xs">Espaço entre linhas</Label>
          <Select value={block.lineHeight || "1.6"} onValueChange={(v) => onChange("lineHeight", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1.3">Compacto</SelectItem>
              <SelectItem value="1.6">Normal</SelectItem>
              <SelectItem value="2">Espaçado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </>
    );
  }

  if (block.type === "footer") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">Conteúdo (HTML)</Label>
          <Textarea value={block.content || ""} onChange={(e) => onChange("content", e.target.value)} rows={4} />
        </div>
        <AlignField value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />
        <ColorField label="Cor do texto" value={block.color} fallback="#999999" onChange={(v) => onChange("color", v)} />
        <PxField label="Tamanho da fonte" value={block.fontSize} placeholder="14" onChange={(v) => onChange("fontSize", v)} />
      </>
    );
  }

  if (block.type === "legal") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">Conteúdo</Label>
          <FormattedTextarea value={block.content || ""} onChange={(v) => onChange("content", v)} rows={4} />
        </div>
        <ColorField label="Cor do texto" value={block.color} fallback="#999999" onChange={(v) => onChange("color", v)} />
        <PxField label="Tamanho da fonte" value={block.fontSize} placeholder="11" onChange={(v) => onChange("fontSize", v)} />
      </>
    );
  }

  return null;
}
