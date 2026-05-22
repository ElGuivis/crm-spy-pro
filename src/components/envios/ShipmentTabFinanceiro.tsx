import { Card, CardContent } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { CreditCard, Receipt, Calendar } from "lucide-react";
import { MelhorEnvioShipment } from "@/hooks/useMelhorEnvio";
import { formatDate, formatCurrency, CopyButton } from "./shipment-tab-utils";

interface ShipmentTabFinanceiroProps {
  shipment: MelhorEnvioShipment;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}

export function ShipmentTabFinanceiro({ shipment, copiedField, onCopy }: ShipmentTabFinanceiroProps) {
  const conciliation = shipment.conciliation as any;
  const invoice = shipment.invoice as any;

  return (
    <TabsContent value="financeiro" className="space-y-4 m-0">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Valor do Frete</p><p className="text-xl font-bold text-primary">{formatCurrency(shipment.price)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Desconto</p><p className="text-xl font-bold text-green-600">{formatCurrency(shipment.discount)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Seguro</p><p className="text-xl font-bold">{formatCurrency(shipment.insurance_value)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total</p><p className="text-xl font-bold">{formatCurrency((shipment.price || 0) - (shipment.discount || 0))}</p></CardContent></Card>
      </div>

      {conciliation && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-medium flex items-center gap-2 mb-3"><CreditCard className="h-4 w-4" />Pagamento</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-muted-foreground">Status</p><p className="font-medium capitalize">{conciliation.status || "-"}</p></div>
              <div><p className="text-muted-foreground">Peso Cobrado</p><p className="font-medium">{conciliation.billed_weight ? `${conciliation.billed_weight} kg` : "-"}</p></div>
              <div><p className="text-muted-foreground">Diferença</p><p className="font-medium">{formatCurrency(conciliation.difference)}</p></div>
              <div><p className="text-muted-foreground">Data</p><p className="font-medium">{formatDate(conciliation.date)}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {invoice && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-medium flex items-center gap-2 mb-3"><Receipt className="h-4 w-4" />Nota Fiscal</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Número</p>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{invoice.number || "-"}</p>
                  {invoice.number && <CopyButton text={invoice.number} fieldName="invoice_number" copiedField={copiedField} onCopy={onCopy} />}
                </div>
              </div>
              <div><p className="text-muted-foreground">Série</p><p className="font-medium">{invoice.serie || "-"}</p></div>
              {invoice.key && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Chave NFe</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs truncate">{invoice.key}</p>
                    <CopyButton text={invoice.key} fieldName="invoice_key" copiedField={copiedField} onCopy={onCopy} />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <h4 className="font-medium flex items-center gap-2 mb-3"><Calendar className="h-4 w-4" />Datas</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground">Criado em</p><p className="font-medium">{formatDate(shipment.generated_at)}</p></div>
            <div><p className="text-muted-foreground">Pago em</p><p className="font-medium">{formatDate(shipment.paid_at)}</p></div>
            <div><p className="text-muted-foreground">Postado em</p><p className="font-medium">{formatDate(shipment.posted_at)}</p></div>
            <div><p className="text-muted-foreground">Entregue em</p><p className="font-medium">{formatDate(shipment.delivered_at)}</p></div>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
