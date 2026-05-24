import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VariablesPicker } from "../../VariablesPicker";
import type { EmailBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: any) => void;
}

export function BlockTextProps({ block, onChange }: Props) {
  if (block.type === "heading") {
    return (
      <>
        <div className="space-y-2">
          <Label>Texto</Label>
          <Input value={block.text || ""} onChange={(e) => onChange("text", e.target.value)} />
          <VariablesPicker onSelect={(variable) => onChange("text", (block.text || "") + variable)} />
        </div>
        <div className="space-y-2">
          <Label>Nível</Label>
          <Select value={block.level} onValueChange={(v) => onChange("level", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="h1">H1</SelectItem>
              <SelectItem value="h2">H2</SelectItem>
              <SelectItem value="h3">H3</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cor do Texto</Label>
          <Input type="color" value={block.color || "#333333"} onChange={(e) => onChange("color", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Tamanho da Fonte</Label>
          <Input value={block.fontSize || ""} onChange={(e) => onChange("fontSize", e.target.value)} placeholder="32px" />
        </div>
      </>
    );
  }

  if (block.type === "text") {
    return (
      <>
        <div className="space-y-2">
          <Label>Conteúdo</Label>
          <Textarea value={block.content || ""} onChange={(e) => onChange("content", e.target.value)} rows={6} />
          <VariablesPicker onSelect={(variable) => onChange("content", (block.content || "") + variable)} />
        </div>
        <div className="space-y-2">
          <Label>Cor do Texto</Label>
          <Input type="color" value={block.color || "#666666"} onChange={(e) => onChange("color", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Tamanho da Fonte</Label>
          <Input value={block.fontSize || ""} onChange={(e) => onChange("fontSize", e.target.value)} placeholder="16px" />
        </div>
      </>
    );
  }

  if (block.type === "footer") {
    return (
      <>
        <div className="space-y-2">
          <Label>Conteúdo (HTML)</Label>
          <Textarea value={block.content || ""} onChange={(e) => onChange("content", e.target.value)} rows={4} />
        </div>
        <div className="space-y-2">
          <Label>Alinhamento</Label>
          <Select value={block.alignment || "center"} onValueChange={(v) => onChange("alignment", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Esquerda</SelectItem>
              <SelectItem value="center">Centro</SelectItem>
              <SelectItem value="right">Direita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cor do Texto</Label>
          <Input type="color" value={block.color || "#999999"} onChange={(e) => onChange("color", e.target.value)} />
        </div>
      </>
    );
  }

  if (block.type === "legal") {
    return (
      <>
        <div className="space-y-2">
          <Label>Conteúdo</Label>
          <Textarea value={block.content || ""} onChange={(e) => onChange("content", e.target.value)} rows={4} />
        </div>
        <div className="space-y-2">
          <Label>Cor do Texto</Label>
          <Input type="color" value={block.color || "#999999"} onChange={(e) => onChange("color", e.target.value)} />
        </div>
      </>
    );
  }

  return null;
}
