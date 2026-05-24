import { EmailBlock } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useEmailImageUpload } from "@/hooks/useEmailImageUpload";
import { BlockMediaProps } from "./blockProperties/BlockMediaProps";
import { BlockTextProps } from "./blockProperties/BlockTextProps";
import { BlockInteractiveProps } from "./blockProperties/BlockInteractiveProps";
import { BlockLayoutProps } from "./blockProperties/BlockLayoutProps";
import { BlockProductProps } from "./blockProperties/BlockProductProps";

interface BlockPropertiesPanelProps {
  block: EmailBlock | null;
  onUpdate: (updates: Partial<EmailBlock>) => void;
  onClose: () => void;
}

const MEDIA_TYPES = ["header", "image", "banner"];
const TEXT_TYPES = ["heading", "text", "footer", "legal"];
const INTERACTIVE_TYPES = ["button", "unsubscribe", "social"];
const LAYOUT_TYPES = ["divider", "spacer", "columns-2", "columns-3"];

export function BlockPropertiesPanel({ block, onUpdate, onClose }: BlockPropertiesPanelProps) {
  const { uploading, upload } = useEmailImageUpload((publicUrl, field) => {
    onUpdate({ [field]: publicUrl } as Partial<EmailBlock>);
  });

  if (!block) return null;

  const handleChange = (field: string, value: any) => onUpdate({ [field]: value });

  return (
    <div className="w-80 border-l bg-background p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Propriedades do Bloco</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Padding</Label>
          <Input value={block.padding || ""} onChange={(e) => handleChange("padding", e.target.value)} placeholder="Ex: 20px" />
        </div>

        <div className="space-y-2">
          <Label>Cor de Fundo</Label>
          <Input type="color" value={block.backgroundColor || "#ffffff"} onChange={(e) => handleChange("backgroundColor", e.target.value)} />
        </div>

        {MEDIA_TYPES.includes(block.type) && (
          <BlockMediaProps block={block} onChange={handleChange} uploading={uploading} onUpload={upload} />
        )}
        {TEXT_TYPES.includes(block.type) && (
          <BlockTextProps block={block} onChange={handleChange} />
        )}
        {INTERACTIVE_TYPES.includes(block.type) && (
          <BlockInteractiveProps block={block} onChange={handleChange} />
        )}
        {LAYOUT_TYPES.includes(block.type) && (
          <BlockLayoutProps block={block} onChange={handleChange} />
        )}
        {block.type === "product" && (
          <BlockProductProps block={block} onChange={handleChange} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  );
}
