import { EmailBlock } from "./types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useEmailImageUpload } from "@/hooks/useEmailImageUpload";
import { blockLabels } from "./blockTemplates";
import { BlockMediaProps } from "./blockProperties/BlockMediaProps";
import { BlockTextProps } from "./blockProperties/BlockTextProps";
import { BlockInteractiveProps } from "./blockProperties/BlockInteractiveProps";
import { BlockLayoutProps } from "./blockProperties/BlockLayoutProps";
import { BlockProductProps } from "./blockProperties/BlockProductProps";
import { BlockCouponProps } from "./blockProperties/BlockCouponProps";
import { BlockImageTextProps } from "./blockProperties/BlockImageTextProps";
import { FONTS } from "./fonts";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorField, PxField, SpacingField } from "./blockProperties/fields";

interface BlockPropertiesPanelProps {
  block: EmailBlock | null;
  onUpdate: (updates: Partial<EmailBlock>) => void;
  onClose: () => void;
}

const MEDIA_TYPES = ["header", "image", "banner"];
const TEXT_TYPES = ["heading", "text", "footer", "legal"];
const INTERACTIVE_TYPES = ["button", "unsubscribe", "social"];
const LAYOUT_TYPES = ["divider", "spacer", "columns-2", "columns-3"];

// Arredondamento: no botão e na imagem vale para o próprio elemento; no produto há campos próprios
const RADIUS_LABEL: Record<string, string | null> = {
  button: "Arredondamento do botão",
  image: "Arredondamento da imagem",
  product: null, spacer: null, divider: null, banner: null,
};

export function BlockPropertiesPanel({ block, onUpdate, onClose }: BlockPropertiesPanelProps) {
  const { uploading, upload } = useEmailImageUpload((publicUrl, field) => {
    onUpdate({ [field]: publicUrl } as Partial<EmailBlock>);
  });

  if (!block) return null;

  const handleChange = (field: string, value: unknown) => onUpdate({ [field]: value } as Partial<EmailBlock>);
  const radiusLabel = block.type in RADIUS_LABEL ? RADIUS_LABEL[block.type] : "Arredondamento do bloco";

  return (
    <div className="w-80 shrink-0 border-l bg-background p-5 overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold">{blockLabels[block.type] ?? "Bloco"}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {MEDIA_TYPES.includes(block.type) && (
          <BlockMediaProps block={block} onChange={handleChange} uploading={uploading} onUpload={upload} />
        )}
        {TEXT_TYPES.includes(block.type) && <BlockTextProps block={block} onChange={handleChange} />}
        {INTERACTIVE_TYPES.includes(block.type) && <BlockInteractiveProps block={block} onChange={handleChange} />}
        {LAYOUT_TYPES.includes(block.type) && <BlockLayoutProps block={block} onChange={handleChange} />}
        {block.type === "product" && <BlockProductProps block={block} onChange={handleChange} onUpdate={onUpdate} />}
        {block.type === "coupon" && <BlockCouponProps block={block} onChange={handleChange} />}
        {block.type === "imagetext" && <BlockImageTextProps block={block} onChange={handleChange} uploading={uploading} onUpload={upload} />}

        {block.type !== "spacer" && (
          <div className="space-y-4 border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aparência do bloco</p>
            {block.type !== "banner" && block.type !== "divider" && (
              <SpacingField value={block.padding} onChange={(v) => handleChange("padding", v)} />
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Fonte do bloco</Label>
              <Select value={block.fontFamily || "__default__"} onValueChange={(v) => handleChange("fontFamily", v === "__default__" ? undefined : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Padrão do e-mail</SelectItem>
                  {FONTS.map((f) => <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {radiusLabel && (
              <PxField label={radiusLabel} value={block.borderRadius} placeholder="0" max={200} onChange={(v) => handleChange("borderRadius", v)} />
            )}
          </div>
        )}
        <ColorField label="Cor de fundo do bloco" value={block.backgroundColor} fallback="#ffffff" onChange={(v) => handleChange("backgroundColor", v)} />
      </div>
    </div>
  );
}
