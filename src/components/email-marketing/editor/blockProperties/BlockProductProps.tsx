import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { ProductPickerDialog } from "../ProductPickerDialog";
import type { EmailBlock, ProductBlock } from "../types";

interface Props {
  block: ProductBlock;
  onChange: (field: string, value: any) => void;
  onUpdate: (updates: Partial<EmailBlock>) => void;
}

export function BlockProductProps({ block, onChange, onUpdate }: Props) {
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const handleProductSelect = (product: { imageUrl: string; name: string; description: string; price: string; buttonUrl: string }) => {
    onUpdate({
      imageUrl: product.imageUrl,
      name: product.name,
      description: product.description,
      price: product.price,
      buttonUrl: product.buttonUrl,
    } as any);
  };

  return (
    <>
      <Button variant="outline" className="w-full mb-2" onClick={() => setProductPickerOpen(true)}>
        <Package className="h-4 w-4 mr-2" />
        Buscar Produto da Loja
      </Button>
      <ProductPickerDialog open={productPickerOpen} onOpenChange={setProductPickerOpen} onSelect={handleProductSelect} />
      <div className="space-y-2">
        <Label>URL da Imagem</Label>
        <Input value={block.imageUrl || ""} onChange={(e) => onChange("imageUrl", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Nome</Label>
        <Input value={block.name || ""} onChange={(e) => onChange("name", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea value={block.description || ""} onChange={(e) => onChange("description", e.target.value)} rows={3} />
      </div>
      <div className="space-y-2">
        <Label>Preço</Label>
        <Input value={block.price || ""} onChange={(e) => onChange("price", e.target.value)} placeholder="R$ 99,00" />
      </div>
      <div className="space-y-2">
        <Label>Texto do Botão</Label>
        <Input value={block.buttonText || ""} onChange={(e) => onChange("buttonText", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>URL do Botão</Label>
        <Input value={block.buttonUrl || ""} onChange={(e) => onChange("buttonUrl", e.target.value)} placeholder="https://..." />
        {block.buttonText && !block.buttonUrl && (
          <p className="text-xs text-destructive">Sem link: o botão não leva a lugar nenhum. Informe a URL do produto.</p>
        )}
      </div>
    </>
  );
}
