import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Package, RefreshCw } from "lucide-react";
import { useState } from "react";
import { MelhorEnvioShipment } from "@/hooks/useMelhorEnvio";
import { createLogger } from "@/lib/logger";
import { ShipmentTabResumo } from "./ShipmentTabResumo";
import { ShipmentTabEntrega } from "./ShipmentTabEntrega";
import { ShipmentTabFinanceiro } from "./ShipmentTabFinanceiro";
import { ShipmentTabProdutos, ShipmentTabRastreio } from "./ShipmentTabProdutosRastreio";

const log = createLogger("ShipmentDetailsDialog");

interface ShipmentDetailsDialogProps {
  shipment: MelhorEnvioShipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: (shipmentId: string) => Promise<void>;
  isRefreshing?: boolean;
}

export function ShipmentDetailsDialog({ shipment, open, onOpenChange, onRefresh, isRefreshing = false }: ShipmentDetailsDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!shipment) return null;

  const serviceDetails = shipment.service_details as any;

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      log.error("Failed to copy:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {serviceDetails?.company_picture && (
                <img src={serviceDetails.company_picture} alt={shipment.carrier || ""} className="h-8 w-8 object-contain rounded" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  <span>Envio {shipment.tracking_code || shipment.protocol}</span>
                </div>
                <p className="text-sm text-muted-foreground font-normal">{shipment.carrier} • {shipment.service_name}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => onRefresh(shipment.id)} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />Atualizar
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="resumo" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5 flex-shrink-0">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="entrega">Entrega</TabsTrigger>
            <TabsTrigger value="produtos">Produtos</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="rastreio">Rastreio</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto mt-4">
            <ShipmentTabResumo shipment={shipment} copiedField={copiedField} onCopy={copyToClipboard} />
            <ShipmentTabEntrega shipment={shipment} />
            <ShipmentTabProdutos shipment={shipment} />
            <ShipmentTabFinanceiro shipment={shipment} copiedField={copiedField} onCopy={copyToClipboard} />
            <ShipmentTabRastreio shipment={shipment} copiedField={copiedField} onCopy={copyToClipboard} />
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
