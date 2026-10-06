import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_CATALOG_PHOTOS, thumbUrl, type CatalogProduct } from "./catalogoHelpers";

interface Props {
  product: CatalogProduct | null;
  /** fotos escolhidas hoje (na ordem de envio) */
  selected: string[];
  onClose: () => void;
  onSave: (urls: string[]) => void;
}

/** Escolhe até 3 fotos do mesmo produto para enviar no WhatsApp. A ordem do toque é a ordem do envio; a 1ª leva a legenda (nome e preço). */
export function ProductPhotosDialog({ product, selected, onClose, onSave }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (product) setPicked(selected.length ? selected : product.imageUrl ? [product.imageUrl] : []); }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (url: string) =>
    setPicked((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : cur.length >= MAX_CATALOG_PHOTOS ? cur : [...cur, url]));
  const full = picked.length >= MAX_CATALOG_PHOTOS;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="line-clamp-1">Fotos de {product?.name}</DialogTitle>
          <DialogDescription>Escolha até {MAX_CATALOG_PHOTOS} fotos. A ordem em que você tocar é a ordem do envio, e a 1ª leva a legenda.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto py-1">
          {(product?.images ?? []).map((url) => {
            const order = picked.indexOf(url) + 1;
            const disabled = !order && full;
            return (
              <button
                key={url}
                type="button"
                disabled={disabled}
                onClick={() => toggle(url)}
                aria-pressed={order > 0}
                aria-label={order ? `Foto escolhida em ${order}º lugar` : "Escolher esta foto"}
                className={`relative aspect-square overflow-hidden rounded-lg border bg-muted transition ${order ? "ring-2 ring-primary" : ""} ${disabled ? "opacity-40" : "hover:shadow-md"}`}
              >
                <img src={thumbUrl(url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                {order > 0 && (
                  <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{order}</span>
                )}
                {order === 1 && <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">com legenda</span>}
                {order > 0 && <Check className="absolute right-1.5 top-1.5 h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground">{picked.length}/{MAX_CATALOG_PHOTOS} fotos · 1 token por produto</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={!picked.length} onClick={() => { onSave(picked); onClose(); }}>Usar estas fotos</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
