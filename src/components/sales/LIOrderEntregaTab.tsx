import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Copy, Package, Truck, MapPin, ExternalLink } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { OrderView, formatDate, copyToClipboard } from "./li-order-helpers";

interface Props { order: OrderView; }

export function LIOrderEntregaTab({ order }: Props) {
  const endereco = order.endereco || {};

  return (
    <TabsContent value="entrega" className="space-y-6 mt-4">
      {order.codigo_rastreio && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold flex items-center gap-2 mb-3 text-blue-700 dark:text-blue-300"><Truck className="h-4 w-4" />Rastreamento</h4>
          <div className="flex items-center gap-3">
            <code className="bg-white dark:bg-background px-3 py-2 rounded border font-mono text-lg">{order.codigo_rastreio}</code>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(order.codigo_rastreio!, "Código de rastreio")}><Copy className="h-4 w-4 mr-1" />Copiar</Button>
            {order.url_rastreio && (
              <Button variant="outline" size="sm" onClick={() => window.open(order.url_rastreio!, '_blank')}><ExternalLink className="h-4 w-4 mr-1" />Rastrear</Button>
            )}
          </div>
          {order.data_envio && <p className="text-sm text-muted-foreground mt-2">Enviado em: {formatDate(order.data_envio)}</p>}
        </div>
      )}

      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3"><Package className="h-4 w-4" />Informações de Envio</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-muted-foreground">Forma de Envio:</span>
            <p className="font-medium">{order.forma_envio || "-"}</p>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Peso do Pedido:</span>
            <p className="font-medium">{order.peso_real ? `${order.peso_real} kg` : "-"}</p>
          </div>
          {order.nome_destinatario && <div><span className="text-sm text-muted-foreground">Destinatário:</span><p className="font-medium">{order.nome_destinatario}</p></div>}
          {order.telefone_destinatario && <div><span className="text-sm text-muted-foreground">Telefone:</span><p className="font-medium">{order.telefone_destinatario}</p></div>}
        </div>
      </div>

      <Separator />

      <div>
        <h4 className="font-semibold flex items-center gap-2 mb-3"><MapPin className="h-4 w-4" />Endereço de Entrega</h4>
        <div className="bg-muted/50 p-4 rounded-lg">
          {endereco?.logradouro ? (
            <>
              <p className="font-medium">
                {endereco.logradouro}
                {endereco.numero && `, ${endereco.numero}`}
                {endereco.complemento && ` - ${endereco.complemento}`}
              </p>
              <p className="text-muted-foreground">
                {endereco.bairro && `${endereco.bairro} - `}
                {endereco.cidade}{endereco.estado && ` / ${endereco.estado}`}
              </p>
              {endereco.cep && <p className="text-muted-foreground font-mono">CEP: {endereco.cep}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">Endereço não informado</p>
          )}
        </div>
      </div>
    </TabsContent>
  );
}
