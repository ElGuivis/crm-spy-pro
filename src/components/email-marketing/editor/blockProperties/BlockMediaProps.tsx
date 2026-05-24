import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadButton } from "./UploadButton";
import type { EmailBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: any) => void;
  uploading: boolean;
  onUpload: (file: File, field: string) => void;
}

export function BlockMediaProps({ block, onChange, uploading, onUpload }: Props) {
  if (block.type === "header") {
    return (
      <>
        <div className="space-y-2">
          <Label>URL do Logo</Label>
          <Input value={block.logoUrl || ""} onChange={(e) => onChange("logoUrl", e.target.value)} placeholder="https://..." />
          <UploadButton field="logoUrl" uploading={uploading} onSelect={onUpload} />
        </div>
        <div className="space-y-2">
          <Label>Largura do Logo</Label>
          <Input value={block.logoWidth || ""} onChange={(e) => onChange("logoWidth", e.target.value)} placeholder="150" />
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
      </>
    );
  }

  if (block.type === "image") {
    return (
      <>
        <div className="space-y-2">
          <Label>URL da Imagem</Label>
          <Input value={block.url || ""} onChange={(e) => onChange("url", e.target.value)} placeholder="https://..." />
          <UploadButton field="url" uploading={uploading} onSelect={onUpload} />
        </div>
        <div className="space-y-2">
          <Label>Texto Alternativo</Label>
          <Input value={block.alt || ""} onChange={(e) => onChange("alt", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Largura</Label>
          <Input value={block.width || ""} onChange={(e) => onChange("width", e.target.value)} placeholder="100%" />
        </div>
        <div className="space-y-2">
          <Label>Link (opcional)</Label>
          <Input value={block.linkUrl || ""} onChange={(e) => onChange("linkUrl", e.target.value)} placeholder="https://..." />
        </div>
      </>
    );
  }

  if (block.type === "banner") {
    return (
      <>
        <div className="space-y-2">
          <Label>URL da Imagem</Label>
          <Input value={block.imageUrl || ""} onChange={(e) => onChange("imageUrl", e.target.value)} />
          <UploadButton field="imageUrl" uploading={uploading} onSelect={onUpload} />
        </div>
        <div className="space-y-2">
          <Label>Texto Alternativo</Label>
          <Input value={block.alt || ""} onChange={(e) => onChange("alt", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Link (opcional)</Label>
          <Input value={block.linkUrl || ""} onChange={(e) => onChange("linkUrl", e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-2">
          <Label>Altura</Label>
          <Input value={block.height || ""} onChange={(e) => onChange("height", e.target.value)} placeholder="auto" />
        </div>
      </>
    );
  }

  return null;
}
