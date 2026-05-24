import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tag, Box, Layers } from "lucide-react";
import { ProductImageGallery } from "../ProductImageGallery";
import { InfoItem } from "./InfoItem";
import { type BlingProduct, parseImages, getCondicaoLabel } from "./blingProductHelpers";

interface Props {
  product: BlingProduct;
  totalVariations: number;
}

export function BlingProductGeneralTab({ product, totalVariations }: Props) {
  const images = parseImages(product.imagens);

  return (
    <TabsContent value="geral" className="space-y-4 pr-4">
      <div className="grid md:grid-cols-2 gap-6">
        <ProductImageGallery
          images={images}
          fallbackUrl={product.imagem_url}
          productName={product.nome}
        />

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <InfoItem icon={Tag} label="Código" value={product.codigo || '-'} />
            <InfoItem icon={Tag} label="SKU/GTIN" value={product.gtin || product.ean || '-'} />
            <InfoItem icon={Box} label="Tipo" value={product.tipo || '-'} />
            <InfoItem icon={Layers} label="Formato" value={product.formato || '-'} />
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge variant={product.situacao === 'A' ? 'default' : 'secondary'}>
                {product.situacao === 'A' ? 'Ativo' : product.situacao === 'I' ? 'Inativo' : product.situacao}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Condição:</span>
              <Badge variant="outline">{getCondicaoLabel(product.condicao)}</Badge>
            </div>

            {product.marca && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Marca:</span>
                <span className="font-medium">{product.marca}</span>
              </div>
            )}

            {product.categoria_nome && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Categoria:</span>
                <span className="font-medium">{product.categoria_nome}</span>
              </div>
            )}

            {product.localizacao && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Localização:</span>
                <span className="font-medium">{product.localizacao}</span>
              </div>
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            {product.frete_gratis && <Badge className="bg-green-500">Frete Grátis</Badge>}
            {product.producao_propria && <Badge variant="outline">Produção Própria</Badge>}
            {product.sob_encomenda && <Badge variant="outline">Sob Encomenda</Badge>}
            {totalVariations > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Layers className="h-3 w-3" />
                {totalVariations} Variações
              </Badge>
            )}
          </div>
        </div>
      </div>
    </TabsContent>
  );
}
