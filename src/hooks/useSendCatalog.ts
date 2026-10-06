import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTokens } from "@/contexts/TokenContext";
import { useCatalogSend } from "@/contexts/CatalogSendContext";
import { useToast } from "@/hooks/use-toast";
import type { CatalogProduct } from "@/components/catalogo/catalogoHelpers";
import { toCatalogPayload } from "@/components/catalogo/sendCatalogChunks";

interface Options {
  integrationId: string;
  contactPhone: string;
  onSendNote: (content: string) => void;
  onSent: () => void;
}

/** Envio do catálogo dentro da conversa: o trabalho roda no popup global (CatalogSendContext), que segue ao trocar de tela. */
export function useSendCatalog({ integrationId, contactPhone, onSendNote, onSent }: Options) {
  const { tenantId } = useAuth();
  const { balance } = useTokens();
  const { toast } = useToast();
  const { start, running } = useCatalogSend();
  const [includePrice, setIncludePrice] = useState(true);
  /** junta as fotos de cada produto numa imagem só (colagem) com nome e preço na legenda; desligado manda uma mensagem por foto */
  const [joinPhotos, setJoinPhotos] = useState(true);

  const send = (selected: CatalogProduct[]) => {
    if (!tenantId || selected.length === 0) return;
    if (balance < selected.length) {
      toast({ title: "Tokens insuficientes", description: `Você precisa de ${selected.length} tokens. Saldo: ${balance}.`, variant: "destructive" });
      return;
    }
    const byId = new Map(selected.map(p => [p.id, p]));
    const started = start({
      base: {
        tenant_id: tenantId, integration_id: integrationId, phone: contactPhone,
        include_price: includePrice, include_stock: false, send_as_document: false,
        photo_layout: joinPhotos ? "collage" : "separate",
      },
      products: selected.map(toCatalogPayload),
      collage: joinPhotos,
      label: contactPhone,
      onDone: (delivered) => {
        const list = delivered.map(d => byId.get(d.id)).filter((p): p is CatalogProduct => !!p)
          .map(p => `• ${p.name}${p.price ? ` — R$ ${p.price.toFixed(2).replace(".", ",")}` : ""}${(p.sendImages?.length ?? 1) > 1 ? ` (${p.sendImages!.length} fotos)` : ""}`);
        if (list.length) onSendNote(`📦 Catálogo enviado (${list.length} produto${list.length > 1 ? "s" : ""}):\n${list.join("\n")}`);
      },
    });
    if (started) onSent();
  };

  return { sending: running, includePrice, setIncludePrice, joinPhotos, setJoinPhotos, send };
}
