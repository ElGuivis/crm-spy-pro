import { useState } from "react";
import { Send, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toCatalogPayload } from "./sendCatalogChunks";
import { useAuth } from "@/contexts/AuthContext";
import { useCatalogSend } from "@/contexts/CatalogSendContext";
import { useToast } from "@/hooks/use-toast";
import type { CatalogProduct } from "./catalogoHelpers";

interface SendCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: CatalogProduct[];
  integrationId: string;
  onSuccess: () => void;
}

export function SendCatalogDialog({ open, onOpenChange, products, integrationId, onSuccess }: SendCatalogDialogProps) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [includePrice, setIncludePrice] = useState(true);
  const [includeStock, setIncludeStock] = useState(false);
  const [joinPhotos, setJoinPhotos] = useState(true);
  const hasMultiPhotos = products.some((p) => (p.sendImages?.length ?? 1) > 1);

  const { start, running } = useCatalogSend();
  const tokenCost = products.length;

  const handleSend = () => {
    if (!phone.trim()) {
      toast({ title: "Número obrigatório", description: "Informe o número de WhatsApp do cliente.", variant: "destructive" });
      return;
    }
    if (!tenantId) return;
    // O envio roda no popup global (progresso, minimizar, interromper e reenviar o que falhar)
    const started = start({
      base: {
        tenant_id: tenantId, integration_id: integrationId, phone: phone.trim(),
        include_price: includePrice, include_stock: includeStock, send_as_document: false,
        photo_layout: joinPhotos ? 'collage' : 'separate',
      },
      products: products.map(toCatalogPayload),
      collage: joinPhotos,
      label: phone.trim(),
    });
    if (started) onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Catálogo via WhatsApp</DialogTitle>
          <DialogDescription>
            {products.length} produto{products.length > 1 ? 's' : ''} selecionado{products.length > 1 ? 's' : ''}, {products.reduce((n, p) => n + (p.sendImages?.length ?? 1), 0)} foto{products.reduce((n, p) => n + (p.sendImages?.length ?? 1), 0) > 1 ? 's' : ''} — Custo: {tokenCost} token{tokenCost > 1 ? 's' : ''} (1 por produto)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Número do cliente</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="phone"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground">Com DDD. Pode incluir ou não o +55.</p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="include-price">Incluir preço na legenda</Label>
            <Switch id="include-price" checked={includePrice} onCheckedChange={setIncludePrice} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="include-stock">Incluir estoque na legenda</Label>
            <Switch id="include-stock" checked={includeStock} onCheckedChange={setIncludeStock} />
          </div>

          {hasMultiPhotos && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="join-photos" className="leading-tight">Juntar as fotos de cada produto numa imagem só<span className="block text-xs font-normal text-muted-foreground">Com o nome e o preço na legenda. Desligado, cada foto vai numa mensagem.</span></Label>
              <Switch id="join-photos" checked={joinPhotos} onCheckedChange={setJoinPhotos} />
            </div>
          )}


          {/* Preview */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Prévia da legenda:</p>
            <p className="text-sm whitespace-pre-line">
              {`*${products[0]?.name || 'Produto'}*`}
              {includePrice && products[0]?.price ? `\n💰 R$ ${products[0].price.toFixed(2).replace('.', ',')}` : ''}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={running || !phone.trim()} className="gap-2">
            <Send className="h-4 w-4" />
            {running ? 'Envio em andamento...' : `Enviar (${tokenCost} tokens)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
