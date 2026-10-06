import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTokens } from "@/contexts/TokenContext";
import { useToast } from "@/hooks/use-toast";
import { MAX_CATALOG_PHOTOS, type CatalogProduct } from "@/components/catalogo/catalogoHelpers";

interface Options {
  integrationId: string;
  contactPhone: string;
  onSendNote: (content: string) => void;
  onSent: () => void;
}

export function useSendCatalog({ integrationId, contactPhone, onSendNote, onSent }: Options) {
  const { tenantId } = useAuth();
  const { balance, refetchBalance } = useTokens();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [includePrice, setIncludePrice] = useState(true);
  /** junta as fotos de cada produto numa imagem só (colagem) com nome e preço na legenda; desligado manda uma mensagem por foto */
  const [joinPhotos, setJoinPhotos] = useState(true);

  const send = async (selectedProducts: CatalogProduct[]) => {
    if (!tenantId || selectedProducts.length === 0) return;
    const tokenCost = selectedProducts.length;
    if (balance < tokenCost) {
      toast({ title: "Tokens insuficientes", description: `Você precisa de ${tokenCost} tokens. Saldo: ${balance}.`, variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-catalog", {
        body: {
          tenant_id: tenantId,
          integration_id: integrationId,
          phone: contactPhone,
          include_price: includePrice,
          include_stock: false,
          send_as_document: false,
          photo_layout: joinPhotos ? "collage" : "separate",
          products: selectedProducts.map(p => ({
            id: p.id, name: p.name, price: p.price, stock: p.stock,
            image_url: p.imageUrl, image_urls: (p.sendImages?.length ? p.sendImages : p.images.slice(0, 1)).slice(0, MAX_CATALOG_PHOTOS),
            variations: p.variations, source: p.source,
          })),
        },
      });
      if (error) throw error;
      const result = data as { sent: number; failed: number; skipped?: number; images_sent?: number; token_cost: number };
      toast({
        title: "Catálogo enviado!",
        description: `${result.sent} produto${result.sent > 1 ? "s" : ""} (${result.images_sent ?? result.sent} foto${(result.images_sent ?? result.sent) > 1 ? "s" : ""}). ${result.token_cost} token${result.token_cost > 1 ? "s" : ""} consumido${result.token_cost > 1 ? "s" : ""}.${result.failed ? ` ${result.failed} falhou.` : ""}${result.skipped ? ` ${result.skipped} ficou de fora por tempo: envie de novo.` : ""}`,
      });
      const productList = selectedProducts
        .map(p => `• ${p.name}${p.price ? ` — R$ ${p.price.toFixed(2).replace(".", ",")}` : ""}${(p.sendImages?.length ?? 1) > 1 ? ` (${p.sendImages!.length} fotos)` : ""}`)
        .join("\n");
      onSendNote(`📦 Catálogo enviado (${result.sent} produto${result.sent > 1 ? "s" : ""}):\n${productList}`);
      await refetchBalance();
      onSent();
    } catch (error: any) {
      toast({ title: "Erro ao enviar", description: error.message || "Não foi possível enviar.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return { sending, includePrice, setIncludePrice, joinPhotos, setJoinPhotos, send };
}
