import { Card, CardContent } from "@/components/ui/card";
import type { CatalogoState } from "@/hooks/useCatalogoProducts";
import { CatalogFilterControls } from "./CatalogFilterControls";

/** Filtros da página Catálogo WhatsApp. */
export function CatalogoFilters({ c }: { c: CatalogoState }) {
  return (
    <Card>
      <CardContent className="p-4">
        <CatalogFilterControls c={c} idPrefix="catalogo" />
      </CardContent>
    </Card>
  );
}
