import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadButton } from "./UploadButton";
import { AlignField, PxField, WidthField } from "./fields";
import type { EmailBlock } from "../types";

interface Props {
  block: EmailBlock;
  onChange: (field: string, value: unknown) => void;
  uploading: boolean;
  onUpload: (file: File, field: string) => void;
}

export function BlockMediaProps({ block, onChange, uploading, onUpload }: Props) {
  if (block.type === "header") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">URL do logo</Label>
          <Input value={block.logoUrl || ""} onChange={(e) => onChange("logoUrl", e.target.value)} placeholder="https://..." />
          <UploadButton field="logoUrl" uploading={uploading} onSelect={onUpload} />
        </div>
        <PxField label="Largura do logo" value={block.logoWidth && !block.logoWidth.endsWith("px") ? `${block.logoWidth}px` : block.logoWidth} placeholder="150" onChange={(v) => onChange("logoWidth", v)} />
        <AlignField value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />
      </>
    );
  }

  if (block.type === "image") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">URL da imagem</Label>
          <Input value={block.url || ""} onChange={(e) => onChange("url", e.target.value)} placeholder="https://..." />
          <UploadButton field="url" uploading={uploading} onSelect={onUpload} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Texto alternativo</Label>
          <Input value={block.alt || ""} onChange={(e) => onChange("alt", e.target.value)} />
        </div>
        <WidthField value={block.width} onChange={(v) => onChange("width", v)} />
        <AlignField value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />
        <div className="space-y-2">
          <Label className="text-xs">Link (opcional)</Label>
          <Input value={block.linkUrl || ""} onChange={(e) => onChange("linkUrl", e.target.value)} placeholder="https://..." />
        </div>
      </>
    );
  }

  if (block.type === "banner") {
    return (
      <>
        <div className="space-y-2">
          <Label className="text-xs">URL da imagem</Label>
          <Input value={block.imageUrl || ""} onChange={(e) => onChange("imageUrl", e.target.value)} />
          <UploadButton field="imageUrl" uploading={uploading} onSelect={onUpload} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Texto alternativo</Label>
          <Input value={block.alt || ""} onChange={(e) => onChange("alt", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Link (opcional)</Label>
          <Input value={block.linkUrl || ""} onChange={(e) => onChange("linkUrl", e.target.value)} placeholder="https://..." />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Altura</Label>
          <Input value={block.height || ""} onChange={(e) => onChange("height", e.target.value)} placeholder="auto" />
        </div>
      </>
    );
  }

  return null;
}
