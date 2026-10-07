import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, DollarSign, Ruler, Layers, Package, Star, Ban } from "lucide-react";
import { useChildProducts } from "@/hooks/useChildProducts";
import { useFullProduct } from "@/hooks/useFullProduct";
import { type Product, getRaw } from "./productDetailsHelpers";
import { ProductDetailsGeneralTab } from "./ProductDetailsGeneralTab";
import { ProductDetailsPricesTab } from "./ProductDetailsPricesTab";
import { ProductDetailsDimensionsTab } from "./ProductDetailsDimensionsTab";
import { ProductDetailsVariationsTab, getVariationCount } from "./ProductDetailsVariationsTab";
import { ProductDetailsDescriptionTab } from "./ProductDetailsDescriptionTab";

interface ProductDetailsDialogProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackImage?: string | null;
}

const ProductDetailsDialog = ({ product: summary, open, onOpenChange, fallbackImage }: ProductDetailsDialogProps) => {
  // a lista traz só o resumo; os campos pesados (descrição, imagens...) vêm ao abrir
  const { data: fullProduct } = useFullProduct(summary?.id, open);
  const product = fullProduct ?? summary;
  const { data: childProducts = [] } = useChildProducts(product, open);

  if (!product) return null;

  const destaque = getRaw(product, 'destaque');
  const bloqueado = getRaw(product, 'bloqueado');
  const totalVariations = getVariationCount(product, childProducts);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-xl font-bold">Detalhes do Produto</DialogTitle>
            {destaque && (
              <Badge className="bg-yellow-500 text-white gap-1">
                <Star className="h-3 w-3" />
                Destaque
              </Badge>
            )}
            {bloqueado && (
              <Badge className="bg-destructive text-destructive-foreground gap-1">
                <Ban className="h-3 w-3" />
                Bloqueado
              </Badge>
            )}
            {totalVariations > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Layers className="h-3 w-3" />
                {totalVariations} {totalVariations === 1 ? 'variação' : 'variações'}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="geral" className="gap-1">
              <Info className="h-3.5 w-3.5 hidden sm:inline" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="precos" className="gap-1">
              <DollarSign className="h-3.5 w-3.5 hidden sm:inline" />
              Preços
            </TabsTrigger>
            <TabsTrigger value="dimensoes" className="gap-1">
              <Ruler className="h-3.5 w-3.5 hidden sm:inline" />
              Dimensões
            </TabsTrigger>
            <TabsTrigger value="variacoes" className="gap-1">
              <Layers className="h-3.5 w-3.5 hidden sm:inline" />
              Variações
              {totalVariations > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{totalVariations}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="descricao" className="gap-1">
              <Package className="h-3.5 w-3.5 hidden sm:inline" />
              Descrição
            </TabsTrigger>
          </TabsList>

          <ProductDetailsGeneralTab product={product} fallbackImage={fallbackImage} />
          <ProductDetailsPricesTab product={product} />
          <ProductDetailsDimensionsTab product={product} />
          <ProductDetailsVariationsTab product={product} childProducts={childProducts} fallbackImage={fallbackImage} />
          <ProductDetailsDescriptionTab product={product} />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailsDialog;
