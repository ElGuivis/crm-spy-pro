import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Copy, User, Calendar, FileText, Mail, Phone } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { OrderView, formatCurrency, formatDate, formatCPFCNPJ, copyToClipboard } from "./li-order-helpers";

interface Props { order: OrderView; }

export function LIOrderResumoTab({ order }: Props) {
  return (
    <TabsContent value="resumo" className="space-y-6 mt-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">Subtotal</p>
          <p className="text-lg font-semibold">{formatCurrency(order.valor_subtotal)}</p>
        </div>
        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">Frete</p>
          <p className="text-lg font-semibold">{formatCurrency(order.valor_frete)}</p>
        </div>
        <div className="bg-muted/50 p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">Desconto</p>
          <p className="text-lg font-semibold text-red-600">{order.valor_desconto ? `-${formatCurrency(order.valor_desconto)}` : "-"}</p>
        </div>
        <div className="bg-primary/10 p-4 rounded-lg">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(order.valor_total)}</p>
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3"><User className="h-4 w-4" />Dados do Cliente</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Nome:</span>
              <span className="font-medium">{order.customer_name || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">CPF/CNPJ:</span>
              <div className="flex items-center gap-2">
                <span className="font-medium font-mono">{formatCPFCNPJ(order.customer_doc)}</span>
                {order.customer_doc && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(order.customer_doc!, "CPF/CNPJ")}>
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email:</span>
              <span className="font-medium">{order.customer_email || "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone:</span>
              <span className="font-medium">{order.customer_phone || "-"}</span>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3"><Calendar className="h-4 w-4" />Datas</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className="text-sm text-muted-foreground">Data do Pedido:</span>
            <p className="font-medium">{formatDate(order.created_at_remote)}</p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Última Atualização:</span>
            <p className="font-medium">{formatDate(order.updated_at_remote)}</p>
          </div>
          {order.data_pagamento && (
            <div>
              <span className="text-sm text-muted-foreground">Data Pagamento:</span>
              <p className="font-medium">{formatDate(order.data_pagamento)}</p>
            </div>
          )}
        </div>
      </div>

      {order.observacoes && (
        <>
          <Separator />
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2"><FileText className="h-4 w-4" />Observações</h4>
            <p className="text-sm bg-muted/50 p-3 rounded-lg">{order.observacoes}</p>
          </div>
        </>
      )}
    </TabsContent>
  );
}
