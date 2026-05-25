import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, Tag } from "lucide-react";
import { OrderView, getStatusColor } from "./li-order-helpers";
import { LIOrderResumoTab } from "./LIOrderResumoTab";
import { LIOrderItensTab } from "./LIOrderItensTab";
import { LIOrderEntregaTab } from "./LIOrderEntregaTab";
import { LIOrderFinanceiroTab } from "./LIOrderFinanceiroTab";

export type { OrderView, OrderItemView } from "./li-order-helpers";

interface LIOrderDetailsDialogProps {
  order: OrderView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LIOrderDetailsDialog({ order, open, onOpenChange }: LIOrderDetailsDialogProps) {
  if (!order) return null;

  const items = order.items || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Package className="h-5 w-5" />
            <span>Pedido #{order.order_number}</span>
            <Badge variant={getStatusColor(order.status_name)}>
              {order.status_name || "Sem status"}
            </Badge>
            {order.codigo_rastreio && (
              <Badge variant="outline" className="gap-1"><Truck className="h-3 w-3" />Rastreio</Badge>
            )}
            {order.cupom_desconto && (
              <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200"><Tag className="h-3 w-3" />Cupom</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="resumo" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="itens">Itens ({items.length})</TabsTrigger>
            <TabsTrigger value="entrega">Entrega</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          </TabsList>

          <LIOrderResumoTab order={order} />
          <LIOrderItensTab order={order} />
          <LIOrderEntregaTab order={order} />
          <LIOrderFinanceiroTab order={order} />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
