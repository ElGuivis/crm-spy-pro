import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Box, MapPin } from "lucide-react";
import { MelhorEnvioShipment } from "@/hooks/useMelhorEnvio";
import { formatDate, formatCurrency, CopyButton } from "./shipment-tab-utils";

interface ShipmentTabProdutosRastreioProps {
  shipment: MelhorEnvioShipment;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}

export function ShipmentTabProdutos({ shipment }: Pick<ShipmentTabProdutosRastreioProps, "shipment">) {
  const products = (shipment.products || []) as any[];
  const volumes = (shipment.volumes || []) as any[];

  return (
    <TabsContent value="produtos" className="space-y-4 m-0">
      {products.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead className="text-right">Valor Unit.</TableHead>
                <TableHead className="text-right">Peso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell className="font-medium">{product.name || product.description}</TableCell>
                  <TableCell className="text-center">{product.quantity || 1}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.unitary_value || product.value)}</TableCell>
                  <TableCell className="text-right">{product.weight ? `${product.weight} kg` : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex justify-end gap-4 text-sm">
            <span className="text-muted-foreground">Total: {products.reduce((sum: number, p: any) => sum + (p.quantity || 1), 0)} itens</span>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Box className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>Nenhum produto cadastrado neste envio</p>
        </div>
      )}
      {volumes.length > 0 && (
        <>
          <Separator />
          <h4 className="font-medium">Volumes</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {volumes.map((volume: any, idx: number) => (
              <Card key={idx}>
                <CardContent className="pt-4 text-sm">
                  <p className="font-medium">Volume {idx + 1}</p>
                  <p className="text-muted-foreground">{volume.height}x{volume.width}x{volume.length} cm • {volume.weight} kg</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </TabsContent>
  );
}

export function ShipmentTabRastreio({ shipment, copiedField, onCopy }: ShipmentTabProdutosRastreioProps) {
  const trackingEvents = (shipment.tracking_events || []) as any[];
  const additionalInfo = shipment.additional_info as any;

  return (
    <TabsContent value="rastreio" className="space-y-4 m-0">
      {trackingEvents.length > 0 ? (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-4">
            {trackingEvents.map((event: any, idx: number) => (
              <div key={idx} className="relative flex gap-4 pl-10">
                <div className="absolute left-2 w-5 h-5 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <Card className="flex-1">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{event.title || event.status}</p>
                        {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
                        {event.city && <p className="text-xs text-muted-foreground mt-1"><MapPin className="h-3 w-3 inline mr-1" />{event.city}/{event.state}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(event.date || event.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum evento de rastreio disponível</p>
          <p className="text-sm">O rastreio será atualizado quando o envio for postado</p>
        </div>
      )}
      {additionalInfo && (
        <>
          <Separator />
          <h4 className="font-medium">Informações Adicionais</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {additionalInfo.route && <div><p className="text-muted-foreground">Rota</p><p className="font-medium">{additionalInfo.route}</p></div>}
            {additionalInfo.destination_unit && <div><p className="text-muted-foreground">Unidade Destino</p><p className="font-medium">{additionalInfo.destination_unit}</p></div>}
            {additionalInfo.barcode && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Código de Barras</p>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-xs">{additionalInfo.barcode}</p>
                  <CopyButton text={additionalInfo.barcode} fieldName="barcode" copiedField={copiedField} onCopy={onCopy} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </TabsContent>
  );
}
