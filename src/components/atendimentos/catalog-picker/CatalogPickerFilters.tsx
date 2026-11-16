import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { CatalogoState } from "@/hooks/useCatalogoProducts";
import { CatalogFilterControls } from "@/components/catalogo/CatalogFilterControls";

interface Props {
  c: CatalogoState;
  includePrice: boolean;
  onIncludePriceChange: (v: boolean) => void;
  joinPhotos: boolean;
  onJoinPhotosChange: (v: boolean) => void;
}

/** Filtros do envio de catálogo pelo atendimento (mesmos da página + preço e juntar fotos). */
export function CatalogPickerFilters({ c, includePrice, onIncludePriceChange, joinPhotos, onJoinPhotosChange }: Props) {
  return (
    <div className="px-4 pb-2 shrink-0">
      <CatalogFilterControls
        c={c}
        compact
        idPrefix="picker"
        extra={(
          <>
            <div className="flex items-center gap-1.5">
              <Switch id="price-picker" checked={includePrice} onCheckedChange={onIncludePriceChange} className="scale-75" />
              <Label htmlFor="price-picker" className="text-xs">Preço na legenda</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch id="join-picker" checked={joinPhotos} onCheckedChange={onJoinPhotosChange} className="scale-75" />
              <Label htmlFor="join-picker" className="text-xs" title="Com várias fotos do mesmo produto, manda uma imagem só com todas juntas e o nome e o preço na legenda">Juntar fotos numa imagem</Label>
            </div>
          </>
        )}
      />
    </div>
  );
}
