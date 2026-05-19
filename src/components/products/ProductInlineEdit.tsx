import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Product } from "./products-helpers";

interface ProductInlineEditProps {
  product: Product;
  integrationId: string;
}

export function ProductInlineEdit({ product, integrationId }: ProductInlineEditProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(product.price?.toString() ?? "");
  const [promoPrice, setPromoPrice] = useState(product.promotional_price?.toString() ?? "");
  const [stock, setStock] = useState(product.stock?.toString() ?? "");

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const updates: Record<string, number | null> = {
        price: price !== "" ? parseFloat(price.replace(",", ".")) : null,
        promotional_price: promoPrice !== "" ? parseFloat(promoPrice.replace(",", ".")) : null,
        stock: stock !== "" ? parseInt(stock, 10) : null,
      };
      const { error } = await supabase
        .from("li_products")
        .update(updates)
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["li-products-all", integrationId] });
      toast({ title: "Produto atualizado" });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    },
  });

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPrice(product.price?.toString() ?? "");
    setPromoPrice(product.promotional_price?.toString() ?? "");
    setStock(product.stock?.toString() ?? "");
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleOpen}
          title="Editar produto"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3 bg-popover border border-border"
        onClick={(e) => e.stopPropagation()}
        align="end"
      >
        <p className="text-xs font-semibold text-foreground mb-3 truncate">{product.name}</p>
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Preço (R$)</Label>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-7 text-sm mt-0.5"
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Preço Promo (R$)</Label>
            <Input
              value={promoPrice}
              onChange={(e) => setPromoPrice(e.target.value)}
              className="h-7 text-sm mt-0.5"
              placeholder="0,00 (opcional)"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Estoque (un)</Label>
            <Input
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="h-7 text-sm mt-0.5"
              placeholder="0"
              type="number"
              min="0"
            />
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={() => mutate()}
            disabled={isPending}
          >
            <Check className="h-3 w-3 mr-1" />
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
