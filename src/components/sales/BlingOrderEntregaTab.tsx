import { Button } from "@/components/ui/button";
import { MapPin, Truck, Copy } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BlingOrderFull } from "./bling-order-types";
import { displayValue, getFreteResponsavel } from "./bling-order-helpers";

interface Props {
  order: BlingOrderFull;
  copyToClipboard: (text: string, label: string) => void;
}

export function BlingOrderEntregaTab({ order, copyToClipboard }: Props) {
  const endereco = order.endereco_entrega;
  const hasVolumes = order.volumes && Array.isArray(order.volumes) && order.volumes.length > 0;

  return (
    <div className="space-y-4">
      {/* Address */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="h-4 w-4" />
          Endereço de Entrega
        </div>
        <div className="p-4 border rounded-lg">
          {endereco ? (
            <>
              <p className="font-medium">
                {endereco.endereco || endereco.logradouro || '-'}, {endereco.numero || '-'}
                {endereco.complemento && ` - ${endereco.complemento}`}
              </p>
              <p className="text-muted-foreground">
                {endereco.bairro || '-'} - {endereco.cidade || '-'}/{endereco.uf || '-'}
              </p>
              <p className="text-muted-foreground">CEP: {endereco.cep || '-'}</p>
            </>
          ) : (
            <p className="text-muted-foreground">Endereço não informado</p>
          )}
        </div>
      </div>

      {/* Transport */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Truck className="h-4 w-4" />
          Transporte
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Transportadora</p>
            <p className="font-medium">{displayValue(order.transportador_nome)}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">ID Transportadora</p>
            <p className="font-medium">{displayValue(order.transportador_id)}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Forma de Envio</p>
            <p className="font-medium">{displayValue(order.forma_envio)}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Frete por Conta</p>
            <p className="font-medium">{getFreteResponsavel(order.frete_por_conta)}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Volumes</p>
            <p className="font-medium">{displayValue(order.quantidade_volumes)}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Peso Bruto</p>
            <p className="font-medium">{order.peso_bruto ? `${order.peso_bruto} kg` : '-'}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Prazo de Entrega</p>
            <p className="font-medium">{order.prazo_entrega ? `${order.prazo_entrega} dias` : '-'}</p>
          </div>
        </div>
      </div>

      {/* Volumes/Tracking */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Rastreamento</p>
        {hasVolumes ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Volume</TableHead>
                <TableHead>Código de Rastreio</TableHead>
                <TableHead>Serviço</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.volumes.map((vol: any, idx: number) => (
                <TableRow key={idx}>
                  <TableCell>{vol.id || idx + 1}</TableCell>
                  <TableCell>
                    {vol.codigoRastreamento ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{vol.codigoRastreamento}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => copyToClipboard(vol.codigoRastreamento, 'Código de rastreio')}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : '-'}
                  </TableCell>
                  <TableCell>{vol.servico || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4 border rounded-lg text-center text-muted-foreground">
            <p>Nenhum volume/rastreamento informado</p>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Etiqueta</p>
        <div className="p-3 border rounded-lg text-sm">
          {order.etiqueta ? (
            <pre className="whitespace-pre-wrap text-xs">
              {JSON.stringify(order.etiqueta, null, 2)}
            </pre>
          ) : (
            <p className="text-muted-foreground">Nenhuma etiqueta vinculada</p>
          )}
        </div>
      </div>
    </div>
  );
}
