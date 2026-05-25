import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Copy, CreditCard, Tag } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { OrderView, formatCurrency, formatDate, safeString, copyToClipboard } from "./li-order-helpers";

interface Props { order: OrderView; }

export function LIOrderFinanceiroTab({ order }: Props) {
  return (
    <TabsContent value="financeiro" className="space-y-6 mt-4">
      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3"><CreditCard className="h-4 w-4" />Pagamento</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><span className="text-sm text-muted-foreground">Forma:</span><p className="font-medium">{safeString(order.forma_pagamento) || "-"}</p></div>
          <div><span className="text-sm text-muted-foreground">Tipo:</span><p className="font-medium">{safeString(order.pagamento_tipo) || "-"}</p></div>
          {order.pagamento_bandeira && <div><span className="text-sm text-muted-foreground">Bandeira:</span><p className="font-medium">{safeString(order.pagamento_bandeira)}</p></div>}
          {order.pagamento_parcelas && Number(order.pagamento_parcelas) > 1 && <div><span className="text-sm text-muted-foreground">Parcelas:</span><p className="font-medium">{order.pagamento_parcelas}x</p></div>}
          {order.gateway_pagamento && <div><span className="text-sm text-muted-foreground">Gateway:</span><p className="font-medium">{safeString(order.gateway_pagamento)}</p></div>}
          {order.transacao_id && (
            <div>
              <span className="text-sm text-muted-foreground">ID Transação:</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm bg-muted px-2 py-1 rounded">{safeString(order.transacao_id)}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(safeString(order.transacao_id), "ID da transação")}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>
          )}
          {order.data_pagamento && <div><span className="text-sm text-muted-foreground">Data Pagamento:</span><p className="font-medium">{formatDate(order.data_pagamento)}</p></div>}
        </div>
      </div>

      {order.cupom_desconto && (
        <>
          <Separator />
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-3"><Tag className="h-4 w-4" />Cupom de Desconto</h4>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-lg px-4 py-2 bg-green-50 text-green-700 border-green-200">{safeString(order.cupom_desconto)}</Badge>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(safeString(order.cupom_desconto), "Cupom")}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}

      <Separator />

      <div>
        <h4 className="font-semibold mb-3">Resumo Financeiro</h4>
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(order.valor_subtotal)}</span></div>
          <div className="flex justify-between"><span>Frete:</span><span>{formatCurrency(order.valor_frete)}</span></div>
          {order.valor_desconto && order.valor_desconto > 0 && (
            <div className="flex justify-between text-red-600"><span>Desconto:</span><span>-{formatCurrency(order.valor_desconto)}</span></div>
          )}
          <Separator />
          <div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-primary">{formatCurrency(order.valor_total)}</span></div>
        </div>
      </div>
    </TabsContent>
  );
}
