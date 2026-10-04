import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadButton } from "./UploadButton";
import { FormattedTextarea } from "./FormattedTextarea";
import { AlignField, ColorField, PxField } from "./fields";
import type { ImageTextBlock } from "../types";

interface Props {
  block: ImageTextBlock;
  onChange: (field: string, value: unknown) => void;
  uploading: boolean;
  onUpload: (file: File, field: string) => void;
}

export function BlockImageTextProps({ block, onChange, uploading, onUpload }: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs">URL da imagem</Label>
        <Input value={block.imageUrl || ""} onChange={(e) => onChange("imageUrl", e.target.value)} placeholder="https://..." />
        <UploadButton field="imageUrl" uploading={uploading} onSelect={onUpload} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Imagem fica</Label>
          <Select value={block.imagePosition || "left"} onValueChange={(v) => onChange("imagePosition", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left">À esquerda</SelectItem>
              <SelectItem value="right">À direita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Largura da imagem</Label>
          <Select value={block.imageWidthPct || "40"} onValueChange={(v) => onChange("imageWidthPct", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30%</SelectItem>
              <SelectItem value="40">40%</SelectItem>
              <SelectItem value="50">50%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <PxField label="Arredondamento da imagem" value={block.imageRadius} placeholder="0" max={200} onChange={(v) => onChange("imageRadius", v)} />
      <div className="space-y-1.5">
        <Label className="text-xs">Alinhamento vertical</Label>
        <Select value={block.verticalAlign || "middle"} onValueChange={(v) => onChange("verticalAlign", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="top">No topo</SelectItem>
            <SelectItem value="middle">Centralizado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Link da imagem (opcional)</Label>
        <Input value={block.linkUrl || ""} onChange={(e) => onChange("linkUrl", e.target.value)} placeholder="https://..." />
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label className="text-xs">Título</Label>
        <Input value={block.title || ""} onChange={(e) => onChange("title", e.target.value)} />
        <ColorField label="Cor do título" value={block.titleColor} fallback="#333333" onChange={(v) => onChange("titleColor", v)} />
        <PxField label="Tamanho do título" value={block.titleSize} placeholder="22" onChange={(v) => onChange("titleSize", v)} />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Texto</Label>
        <FormattedTextarea value={block.text || ""} onChange={(v) => onChange("text", v)} rows={5} />
        <ColorField label="Cor do texto" value={block.textColor} fallback="#666666" onChange={(v) => onChange("textColor", v)} />
        <PxField label="Tamanho do texto" value={block.textSize} placeholder="15" onChange={(v) => onChange("textSize", v)} />
      </div>
      <AlignField label="Alinhamento do texto" value={block.alignment} fallback="left" onChange={(v) => onChange("alignment", v)} />

      <div className="space-y-2 border-t pt-4">
        <Label className="text-xs">Botão (deixe o texto vazio para ocultar)</Label>
        <Input value={block.buttonText || ""} onChange={(e) => onChange("buttonText", e.target.value)} placeholder="Saiba mais" />
        <Input value={block.buttonUrl || ""} onChange={(e) => onChange("buttonUrl", e.target.value)} placeholder="https://..." />
        {block.buttonText && !block.buttonUrl && <p className="text-xs text-destructive">Sem link: informe o endereço do botão.</p>}
        <ColorField label="Cor do botão" value={block.buttonColor} fallback="#0066cc" onChange={(v) => onChange("buttonColor", v)} />
        <ColorField label="Cor do texto do botão" value={block.buttonTextColor} fallback="#ffffff" onChange={(v) => onChange("buttonTextColor", v)} />
        <PxField label="Arredondamento do botão" value={block.buttonRadius} placeholder="4" max={50} onChange={(v) => onChange("buttonRadius", v)} />
      </div>
    </>
  );
}
