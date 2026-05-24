import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package } from "lucide-react";
import { useBlingProductChildren } from "@/hooks/useBlingProductChildren";
import type { BlingProduct } from "./bling/blingProductHelpers";
import { BlingProductGeneralTab } from "./bling/BlingProductGeneralTab";
import { BlingProductPricesTab } from "./bling/BlingProductPricesTab";
import { BlingProductDimensionsTab } from "./bling/BlingProductDimensionsTab";
import { BlingProductSupplierTab } from "./bling/BlingProductSupplierTab";
import { BlingProductTaxTab } from "./bling/BlingProductTaxTab";
import { BlingProductVariationsTab, countBlingVariations } from "./bling/BlingProductVariationsTab";
import { BlingProductDescriptionTab } from "./bling/BlingProductDescriptionTab";

interface BlingProductDetailsDialogProps {
  product: BlingProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlingProductDetailsDialog({ product, open, onOpenChange }: BlingProductDetailsDialogProps) {
  const { data: childProducts = [] } = useBlingProductChildren(product, open);

  if (!product) return null;

  const totalVariations = countBlingVariations(product, childProducts);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {product.nome}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral" className="h-full">
          <TabsList className="grid grid-cols-4 lg:grid-cols-7 w-full">
            <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
            <TabsTrigger value="precos" className="text-xs">Preços</TabsTrigger>
            <TabsTrigger value="dimensoes" className="text-xs">Dimensões</TabsTrigger>
            <TabsTrigger value="fornecedor" className="text-xs">Fornecedor</TabsTrigger>
            <TabsTrigger value="tributacao" className="text-xs">Tributação</TabsTrigger>
            <TabsTrigger value="variacoes" className="text-xs">Variações</TabsTrigger>
            <TabsTrigger value="descricao" className="text-xs">Descrição</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh] mt-4">
            <BlingProductGeneralTab product={product} totalVariations={totalVariations} />
            <BlingProductPricesTab product={product} />
            <BlingProductDimensionsTab product={product} />
            <BlingProductSupplierTab product={product} />
            <BlingProductTaxTab product={product} />
            <BlingProductVariationsTab product={product} childProducts={childProducts} />
            <BlingProductDescriptionTab product={product} />
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
