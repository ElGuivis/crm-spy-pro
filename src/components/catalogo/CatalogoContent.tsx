import { useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTokens } from "@/contexts/TokenContext";
import { useToast } from "@/hooks/use-toast";
import { useCatalogoProducts } from "@/hooks/useCatalogoProducts";
import { SendCatalogDialog } from "./SendCatalogDialog";
import { ProductPhotosDialog } from "./ProductPhotosDialog";
import type { CatalogProduct } from "./catalogoHelpers";
import { CatalogoFilters } from "./CatalogoFilters";
import { CatalogoProductGrid } from "./CatalogoProductGrid";

interface Props {
  integrationId: string;
}

export function CatalogoContent({ integrationId }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { balance } = useTokens();
  const c = useCatalogoProducts(integrationId);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [photoProduct, setPhotoProduct] = useState<CatalogProduct | null>(null);

  const tokenCost = c.selectedProducts.length;

  const handleSendClick = () => {
    if (balance < tokenCost) {
      toast({ title: "Tokens insuficientes", description: `Você precisa de ${tokenCost} tokens. Saldo: ${balance}.`, variant: "destructive" });
      return;
    }
    setShowSendDialog(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/catalogo-whatsapp")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Catálogo WhatsApp</h1>
            <p className="text-muted-foreground">{c.integration?.name} — Selecione produtos para enviar via WhatsApp</p>
          </div>
        </div>
        {c.selectedIds.size > 0 && (
          <Button onClick={handleSendClick} className="gap-2">
            <Send className="h-4 w-4" />
            Enviar {c.selectedIds.size} produto{c.selectedIds.size > 1 ? "s" : ""} ({tokenCost} token{tokenCost > 1 ? "s" : ""})
          </Button>
        )}
      </div>

      <CatalogoFilters
        searchQuery={c.searchQuery}
        onSearchChange={c.setSearchQuery}
        filterOptions={c.filterOptions}
        colorFilter={c.colorFilter}
        onColorChange={c.setColorFilter}
        sizeFilter={c.sizeFilter}
        onSizeChange={c.setSizeFilter}
        categoryFilter={c.categoryFilter}
        onCategoryChange={c.setCategoryFilter}
        onlyInStock={c.onlyInStock}
        onOnlyInStockChange={c.setOnlyInStock}
        filteredCount={c.filtered.length}
        selectedCount={c.selectedIds.size}
        onSelectAll={c.selectAll}
      />

      <CatalogoProductGrid
        isLoading={c.isLoading}
        products={c.filtered}
        selectedIds={c.selectedIds}
        onToggleSelect={c.toggleSelect}
        onEditPhotos={setPhotoProduct}
        photoCount={c.photoCount}
      />

      <ProductPhotosDialog
        product={photoProduct}
        selected={photoProduct ? (c.photoChoice[photoProduct.id] ?? []) : []}
        onClose={() => setPhotoProduct(null)}
        onSave={(urls) => photoProduct && c.setPhotos(photoProduct.id, urls)}
      />

      <SendCatalogDialog
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
        products={c.selectedProducts}
        integrationId={integrationId}
        onSuccess={() => {
          c.clearSelection();
          setShowSendDialog(false);
        }}
      />
    </div>
  );
}
