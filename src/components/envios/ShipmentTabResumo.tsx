import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { FileText, ExternalLink } from "lucide-react";
import { MelhorEnvioShipment } from "@/hooks/useMelhorEnvio";
import { formatDate, formatCurrency, getStatusBadge, CopyButton } from "./shipment-tab-utils";

interface ShipmentTabResumoProps {
  shipment: MelhorEnvioShipment;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}

export function ShipmentTabResumo({ shipment, copiedField, onCopy }: ShipmentTabResumoProps) {
  const serviceDetails = shipment.service_details as any;

  return (
    <TabsContent value="resumo" className="space-y-4 m-0">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        {getStatusBadge(shipment.status)}
        {shipment.external_order_number && (
          <Badge variant="outline" className="gap-1">
            <FileText className="h-3 w-3" />Pedido #{shipment.external_order_number}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shipment.tracking_code && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Código de Rastreio</p>
                  <p className="font-mono font-medium">{shipment.tracking_code}</p>
                </div>
                <div className="flex gap-1">
                  <CopyButton text={shipment.tracking_code} fieldName="tracking" copiedField={copiedField} onCopy={onCopy} />
                  {serviceDetails?.tracking_link && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.open(serviceDetails.tracking_link.replace("{tracking}", shipment.tracking_code), "_blank")}>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {shipment.protocol && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Protocolo</p><p className="font-mono font-medium">{shipment.protocol}</p></div>
                <CopyButton text={shipment.protocol} fieldName="protocol" copiedField={copiedField} onCopy={onCopy} />
              </div>
            </CardContent>
          </Card>
        )}
        {shipment.authorization_code && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Código de Autorização</p><p className="font-mono font-medium">{shipment.authorization_code}</p></div>
                <CopyButton text={shipment.authorization_code} fieldName="auth_code" copiedField={copiedField} onCopy={onCopy} />
              </div>
            </CardContent>
          </Card>
        )}
        {shipment.cte_key && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-muted-foreground">Chave CT-e</p><p className="font-mono text-xs truncate max-w-[200px]">{shipment.cte_key}</p></div>
                <CopyButton text={shipment.cte_key} fieldName="cte_key" copiedField={copiedField} onCopy={onCopy} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {shipment.print_url && (
          <Button variant="outline" size="sm" onClick={() => window.open(shipment.print_url!, "_blank")}>
            <FileText className="h-4 w-4 mr-2" />Imprimir Etiqueta
          </Button>
        )}
        {shipment.preview_url && (
          <Button variant="outline" size="sm" onClick={() => window.open(shipment.preview_url!, "_blank")}>
            <ExternalLink className="h-4 w-4 mr-2" />Visualizar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p className="text-muted-foreground">Prazo</p><p className="font-medium">{shipment.delivery_min}-{shipment.delivery_max} dias úteis</p></div>
        <div><p className="text-muted-foreground">Previsão</p><p className="font-medium">{formatDate(shipment.estimated_delivery_at)}</p></div>
        <div><p className="text-muted-foreground">Valor do Frete</p><p className="font-medium">{formatCurrency(shipment.price)}</p></div>
        <div><p className="text-muted-foreground">Última Atualização</p><p className="font-medium">{formatDate(shipment.last_sync_at)}</p></div>
      </div>
    </TabsContent>
  );
}
