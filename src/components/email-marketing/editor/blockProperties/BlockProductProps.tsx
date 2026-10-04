import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Package } from "lucide-react";
import { ProductPickerDialog } from "../ProductPickerDialog";
import { FormattedTextarea } from "./FormattedTextarea";
import { AlignField, ColorField, PxField, SwitchField, WidthField } from "./fields";
import type { EmailBlock, ProductBlock } from "../types";

interface Props {
  block: ProductBlock;
  onChange: (field: string, value: unknown) => void;
  onUpdate: (updates: Partial<EmailBlock>) => void;
}

const Section = ({ value, title, children }: { value: string; title: string; children: React.ReactNode }) => (
  <AccordionItem value={value}>
    <AccordionTrigger className="py-3 text-sm">{title}</AccordionTrigger>
    <AccordionContent className="space-y-3 pb-4">{children}</AccordionContent>
  </AccordionItem>
);

export function BlockProductProps({ block, onChange, onUpdate }: Props) {
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  // Troca o produto sem perder o visual (cores, tamanhos e alinhamento ficam como estavam)
  const handleProductSelect = (product: { imageUrl: string; name: string; description: string; price: string; buttonUrl: string }) => {
    onUpdate({ imageUrl: product.imageUrl, name: product.name, description: product.description, price: product.price, buttonUrl: product.buttonUrl });
  };

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setProductPickerOpen(true)}>
        <Package className="h-4 w-4 mr-2" />
        Buscar produto da loja
      </Button>
      <ProductPickerDialog open={productPickerOpen} onOpenChange={setProductPickerOpen} onSelect={handleProductSelect} />

      <AlignField label="Alinhamento do produto" value={block.alignment} fallback="center" onChange={(v) => onChange("alignment", v)} />

      <Accordion type="multiple" defaultValue={["conteudo", "botao"]} className="w-full">
        <Section value="conteudo" title="Conteúdo">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input value={block.name || ""} onChange={(e) => onChange("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição (deixe vazio para ocultar)</Label>
            <FormattedTextarea value={block.description || ""} onChange={(v) => onChange("description", v)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Preço</Label>
              <Input value={block.price || ""} onChange={(e) => onChange("price", e.target.value)} placeholder="R$ 99,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Preço antigo (riscado)</Label>
              <Input value={block.oldPrice || ""} onChange={(e) => onChange("oldPrice", e.target.value)} placeholder="R$ 129,00" />
            </div>
          </div>
        </Section>

        <Section value="imagem" title="Imagem">
          <div className="space-y-1.5">
            <Label className="text-xs">URL da imagem</Label>
            <Input value={block.imageUrl || ""} onChange={(e) => onChange("imageUrl", e.target.value)} />
          </div>
          <WidthField label="Largura da imagem" value={block.imageWidth} fallback="300px" onChange={(v) => onChange("imageWidth", v)} />
          <PxField label="Arredondamento da imagem" value={block.imageRadius} placeholder="0" max={200} onChange={(v) => onChange("imageRadius", v)} />
          <SwitchField label="Imagem e nome levam ao link do botão" checked={block.linkImage !== false} onChange={(v) => onChange("linkImage", v)} />
        </Section>

        <Section value="textos" title="Textos (cores e tamanhos)">
          <ColorField label="Cor do nome" value={block.nameColor} fallback="#333333" onChange={(v) => onChange("nameColor", v)} />
          <PxField label="Tamanho do nome" value={block.nameSize} placeholder="20" onChange={(v) => onChange("nameSize", v)} />
          <SwitchField label="Nome em negrito" checked={block.nameWeight !== "normal"} onChange={(v) => onChange("nameWeight", v ? "bold" : "normal")} />
          <ColorField label="Cor da descrição" value={block.descriptionColor} fallback="#666666" onChange={(v) => onChange("descriptionColor", v)} />
          <PxField label="Tamanho da descrição" value={block.descriptionSize} placeholder="14" onChange={(v) => onChange("descriptionSize", v)} />
          <ColorField label="Cor do preço" value={block.priceColor} fallback="#0066cc" onChange={(v) => onChange("priceColor", v)} />
          <PxField label="Tamanho do preço" value={block.priceSize} placeholder="24" onChange={(v) => onChange("priceSize", v)} />
          <ColorField label="Cor do preço antigo" value={block.oldPriceColor} fallback="#999999" onChange={(v) => onChange("oldPriceColor", v)} />
        </Section>

        <Section value="botao" title="Botão">
          <div className="space-y-1.5">
            <Label className="text-xs">Texto do botão (deixe vazio para ocultar)</Label>
            <Input value={block.buttonText || ""} onChange={(e) => onChange("buttonText", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Link do botão</Label>
            <Input value={block.buttonUrl || ""} onChange={(e) => onChange("buttonUrl", e.target.value)} placeholder="https://..." />
            {block.buttonText && !block.buttonUrl && (
              <p className="text-xs text-destructive">Sem link: o botão não leva a lugar nenhum. Informe a URL do produto.</p>
            )}
          </div>
          <ColorField label="Cor do botão" value={block.buttonColor} fallback="#0066cc" onChange={(v) => onChange("buttonColor", v)} />
          <ColorField label="Cor do texto do botão" value={block.buttonTextColor} fallback="#ffffff" onChange={(v) => onChange("buttonTextColor", v)} />
          <PxField label="Arredondamento do botão" value={block.buttonRadius} placeholder="4" max={50} onChange={(v) => onChange("buttonRadius", v)} />
          <PxField label="Tamanho da fonte do botão" value={block.buttonSize} placeholder="16" onChange={(v) => onChange("buttonSize", v)} />
          <SwitchField label="Botão em largura total" checked={!!block.buttonFullWidth} onChange={(v) => onChange("buttonFullWidth", v)} />
        </Section>
      </Accordion>
    </>
  );
}
