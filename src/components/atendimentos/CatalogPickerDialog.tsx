import { Button } from "@/components/ui/button";
import { Package, Send, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useCatalogoProducts } from "@/hooks/useCatalogoProducts";
import { useSendCatalog } from "@/hooks/useSendCatalog";
import { CatalogPickerFilters } from "./catalog-picker/CatalogPickerFilters";
import { CatalogPickerGrid } from "./catalog-picker/CatalogPickerGrid";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  contactPhone: string;
  conversationId: string;
  onSendNote: (content: string) => void;
}

export function CatalogPickerDialog({ open, onOpenChange, integrationId, contactPhone, onSendNote }: Props) {
  const c = useCatalogoProducts(integrationId, open);
  const sender = useSendCatalog({
    integrationId,
    contactPhone,
    onSendNote,
    onSent: () => { c.clearSelection(); onOpenChange(false); },
  });

  const tokenCost = c.selectedProducts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Catálogo de Produtos
          </DialogTitle>
          <DialogDescription>
            {c.integration?.name || "Loja"} — Selecione produtos para enviar ao cliente
          </DialogDescription>
        </DialogHeader>

        <CatalogPickerFilters
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
          includePrice={sender.includePrice}
          onIncludePriceChange={sender.setIncludePrice}
          filteredCount={c.filtered.length}
          selectedCount={c.selectedIds.size}
          onSelectAll={c.selectAll}
        />

        <CatalogPickerGrid
          isLoading={c.isLoading}
          products={c.filtered}
          selectedIds={c.selectedIds}
          onToggleSelect={c.toggleSelect}
        />

        {c.selectedIds.size > 0 && (
          <div className="border-t px-4 py-3 flex items-center justify-between bg-card shrink-0">
            <span className="text-sm text-muted-foreground">
              {c.selectedIds.size} produto{c.selectedIds.size > 1 ? "s" : ""} · {tokenCost} token{tokenCost > 1 ? "s" : ""}
            </span>
            <Button onClick={() => sender.send(c.selectedProducts)} disabled={sender.sending} className="gap-2" size="sm">
              {sender.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sender.sending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
