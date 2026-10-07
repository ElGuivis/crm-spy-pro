import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { User, Phone, MapPin, Mail, FileText, Truck, Box, Weight, Ruler, Building2, Shield, Receipt } from "lucide-react";
import { MelhorEnvioShipment } from "@/hooks/useMelhorEnvio";

interface ShipmentTabEntregaProps { shipment: MelhorEnvioShipment; }

import { jsonAs, jsonArray, type ShipmentAddress, type ShipmentDimensions, type ShipmentVolume } from "./shipment-json";
export function ShipmentTabEntrega({ shipment }: ShipmentTabEntregaProps) {
  const toAddress = jsonAs<ShipmentAddress>(shipment.to_address);
  const fromAddress = jsonAs<ShipmentAddress>(shipment.from_address);
  const agencyAddress = jsonAs<ShipmentAddress>(shipment.agency_address);
  // `dimensions` vem com nulos na maioria dos envios; o 1º volume (valores em texto) tem as medidas reais
  const dimensions = jsonAs<ShipmentDimensions>(shipment.dimensions);
  const volume = jsonArray<ShipmentVolume>(shipment.volumes)[0];
  const dims = {
    height: dimensions?.height || shipment.height || (volume?.height ? Number(volume.height) : "-"),
    width: dimensions?.width || shipment.width || (volume?.width ? Number(volume.width) : "-"),
    length: dimensions?.length || shipment.length || (volume?.length ? Number(volume.length) : "-"),
  };

  return (
    <TabsContent value="entrega" className="space-y-6 m-0">
      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2"><User className="h-4 w-4" />Destinatário</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <p className="font-medium text-base">{shipment.receiver_name}</p>
              {shipment.receiver_document && <p className="text-muted-foreground flex items-center gap-2"><FileText className="h-3 w-3" />{shipment.receiver_document}</p>}
              {shipment.receiver_phone && <p className="text-muted-foreground flex items-center gap-2"><Phone className="h-3 w-3" />{shipment.receiver_phone}</p>}
              {shipment.receiver_email && <p className="text-muted-foreground flex items-center gap-2"><Mail className="h-3 w-3" />{shipment.receiver_email}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="h-3 w-3 mt-1 flex-shrink-0" />
                <span>{toAddress?.address}, {toAddress?.number}{toAddress?.complement && ` - ${toAddress.complement}`}</span>
              </p>
              <p className="text-muted-foreground">{toAddress?.district} - {shipment.receiver_city}/{shipment.receiver_state}</p>
              <p className="text-muted-foreground">CEP: {toAddress?.postal_code}</p>
              {shipment.receiver_note && <p className="text-muted-foreground italic mt-2">"{shipment.receiver_note}"</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4" />Remetente</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <p className="font-medium text-base">{fromAddress?.name || fromAddress?.company}</p>
              {shipment.sender_document && <p className="text-muted-foreground flex items-center gap-2"><FileText className="h-3 w-3" />{shipment.sender_document}</p>}
              {shipment.sender_phone && <p className="text-muted-foreground flex items-center gap-2"><Phone className="h-3 w-3" />{shipment.sender_phone}</p>}
              {shipment.sender_email && <p className="text-muted-foreground flex items-center gap-2"><Mail className="h-3 w-3" />{shipment.sender_email}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="h-3 w-3 mt-1 flex-shrink-0" />
                <span>{fromAddress?.address}, {fromAddress?.number}{fromAddress?.complement && ` - ${fromAddress.complement}`}</span>
              </p>
              <p className="text-muted-foreground">{fromAddress?.district} - {fromAddress?.city}/{fromAddress?.state_abbr || fromAddress?.state}</p>
              <p className="text-muted-foreground">CEP: {fromAddress?.postal_code}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <h4 className="font-medium flex items-center gap-2"><Box className="h-4 w-4" />Pacote</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground flex items-center gap-1"><Weight className="h-3 w-3" />Peso Real</p><p className="font-medium">{shipment.weight ? `${shipment.weight} kg` : "-"}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground flex items-center gap-1"><Weight className="h-3 w-3" />Peso Cobrado</p><p className="font-medium">{shipment.billed_weight ? `${shipment.billed_weight} kg` : "-"}</p></CardContent></Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1"><Ruler className="h-3 w-3" />Dimensões</p>
              <p className="font-medium">
                {dims.height}x{dims.width}x{dims.length} cm
              </p>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Formato</p><p className="font-medium capitalize">{shipment.format || "-"}</p></CardContent></Card>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {shipment.receipt && <Badge variant="secondary"><Receipt className="h-3 w-3 mr-1" />Aviso de Recebimento</Badge>}
          {shipment.own_hand && <Badge variant="secondary"><User className="h-3 w-3 mr-1" />Mão Própria</Badge>}
          {shipment.collect && <Badge variant="secondary"><Truck className="h-3 w-3 mr-1" />Coleta</Badge>}
          {shipment.non_commercial && <Badge variant="secondary"><Shield className="h-3 w-3 mr-1" />Não Comercial</Badge>}
        </div>
      </div>

      {shipment.agency_name && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2"><Building2 className="h-4 w-4" />Ponto de Coleta (PUDO)</h4>
            <Card>
              <CardContent className="pt-4 text-sm">
                <p className="font-medium">{shipment.agency_name}</p>
                {agencyAddress && <p className="text-muted-foreground">{agencyAddress.address}, {agencyAddress.number} - {agencyAddress.city}/{agencyAddress.state}</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </TabsContent>
  );
}
