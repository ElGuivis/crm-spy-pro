import { useState } from "react";
import { Send, Loader2, Phone } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTokens } from "@/contexts/TokenContext";
import { useToast } from "@/hooks/use-toast";

import { createLogger } from '@/lib/logger';
const log = createLogger('SendCatalogDialog');

interface CatalogProduct {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  imageUrl: string | null;
  sku: string | null;
  variations: string[];
  source: 'li' | 'bling';
}

interface SendCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: CatalogProduct[];
  integrationId: string;
  onSuccess: () => void;
}

export function SendCatalogDialog({ open, onOpenChange, products, integrationId, onSuccess }: SendCatalogDialogProps) {
  const { tenantId } = useAuth();
  const { refetchBalance } = useTokens();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [includePrice, setIncludePrice] = useState(true);
  const [includeStock, setIncludeStock] = useState(false);
  const [sending, setSending] = useState(false);

  const tokenCost = products.length;

  const handleSend = async () => {
    if (!phone.trim()) {
      toast({ title: "Número obrigatório", description: "Informe o número de WhatsApp do cliente.", variant: "destructive" });
      return;
    }

    if (!tenantId) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send-catalog', {
        body: {
          tenant_id: tenantId,
          integration_id: integrationId,
          phone: phone.trim(),
          include_price: includePrice,
          include_stock: includeStock,
          send_as_document: false,
          products: products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            stock: p.stock,
            image_url: p.imageUrl,
            variations: p.variations,
            source: p.source,
          })),
        },
      });

      if (error) throw error;

      const result = data as { sent: number; failed: number; token_cost: number };

      toast({
        title: "Catálogo enviado!",
        description: `${result.sent} produto${result.sent > 1 ? 's' : ''} enviado${result.sent > 1 ? 's' : ''} com sucesso. ${result.failed > 0 ? `${result.failed} falha(s).` : ''} ${result.token_cost} token${result.token_cost > 1 ? 's' : ''} consumido${result.token_cost > 1 ? 's' : ''}.`,
      });

      await refetchBalance();
      onSuccess();
    } catch (error: any) {
      log.error('Send catalog error:', error);
      toast({
        title: "Erro ao enviar",
        description: error.message || "Não foi possível enviar o catálogo.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar Catálogo via WhatsApp</DialogTitle>
          <DialogDescription>
            {products.length} produto{products.length > 1 ? 's' : ''} selecionado{products.length > 1 ? 's' : ''} — Custo: {tokenCost} token{tokenCost > 1 ? 's' : ''}
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !phone.trim()} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Enviando...' : `Enviar (${tokenCost} tokens)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
