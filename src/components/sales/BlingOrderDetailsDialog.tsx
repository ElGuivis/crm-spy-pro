import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

import { BlingOrderFull, BlingOrderItem, BlingCustomer, BlingOrderDetailsDialogProps } from "./bling-order-types";
import { getStatusColor, displayValue } from "./bling-order-helpers";
import { BlingOrderResumoTab } from "./BlingOrderResumoTab";
import { BlingOrderItensTab } from "./BlingOrderItensTab";
import { BlingOrderEntregaTab } from "./BlingOrderEntregaTab";
import { BlingOrderFinanceiroTab } from "./BlingOrderFinanceiroTab";

export type { BlingOrderFull, BlingOrderItem, BlingOrderDetailsDialogProps };

const log = createLogger('BlingOrderDetailsDialog');

export function BlingOrderDetailsDialog({
  order,
  orderItems,
  loadingItems,
  open,
  onOpenChange,
  getStatusDisplayName,
  getPaymentDisplayName,
}: BlingOrderDetailsDialogProps) {
  const { toast } = useToast();
  const [customer, setCustomer] = useState<BlingCustomer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  useEffect(() => {
    async function fetchCustomer() {
      if (!order?.cliente_id || !order?.integration_id) { setCustomer(null); return; }
      setLoadingCustomer(true);
      try {
        const { data, error } = await supabase
          .from('bling_customers')
          .select('id, bling_id, nome, data_nascimento, sexo, naturalidade, rg')
          .eq('bling_id', order.cliente_id)
          .eq('integration_id', order.integration_id)
          .maybeSingle();
        if (error) log.error('Error fetching customer:', error);
        else setCustomer(data);
      } catch (err) {
        log.error('Error fetching customer:', err);
      } finally {
        setLoadingCustomer(false);
      }
    }
    if (open && order) fetchCustomer();
  }, [order, open]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: `${label} copiado para a área de transferência.` });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl">Pedido #{order.numero}</DialogTitle>
              <Badge variant="outline" className="text-xs">
                Loja: {displayValue(order.numero_loja)}
              </Badge>
            </div>
            <Badge variant={getStatusColor(order.situacao_nome)} className="ml-2">
              {order.situacao_nome || 'Desconhecido'}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <Tabs defaultValue="resumo" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="itens">Itens ({orderItems.length})</TabsTrigger>
              <TabsTrigger value="entrega">Entrega</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            </TabsList>

            <TabsContent value="resumo" className="mt-4">
              <BlingOrderResumoTab
                order={order}
                customer={customer}
                loadingCustomer={loadingCustomer}
                copyToClipboard={copyToClipboard}
              />
            </TabsContent>

            <TabsContent value="itens" className="mt-4">
              <BlingOrderItensTab orderItems={orderItems} loadingItems={loadingItems} />
            </TabsContent>

            <TabsContent value="entrega" className="mt-4">
              <BlingOrderEntregaTab order={order} copyToClipboard={copyToClipboard} />
            </TabsContent>

            <TabsContent value="financeiro" className="mt-4">
              <BlingOrderFinanceiroTab order={order} getPaymentDisplayName={getPaymentDisplayName} />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
