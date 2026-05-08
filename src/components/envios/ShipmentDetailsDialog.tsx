import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Package, User, Phone, MapPin, Mail, FileText, DollarSign, Truck, 
  Calendar, ExternalLink, RefreshCw, Copy, Check, Box, Receipt,
  Clock, CheckCircle2, XCircle, AlertCircle, RotateCcw, CreditCard,
  Weight, Ruler, Building2, Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { MelhorEnvioShipment } from '@/hooks/useMelhorEnvio';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { createLogger } from '@/lib/logger';
const log = createLogger('ShipmentDetailsDialog');

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  posted: { label: 'Postado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Package },
  in_transit: { label: 'Em Trânsito', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck },
  delivered: { label: 'Entregue', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  canceled: { label: 'Cancelado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  expired: { label: 'Expirado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: AlertCircle },
  returning: { label: 'Retornando', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: RotateCcw },
  returned: { label: 'Devolvido', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: RotateCcw },
};

interface ShipmentDetailsDialogProps {
  shipment: MelhorEnvioShipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: (shipmentId: string) => Promise<void>;
  isRefreshing?: boolean;
}

export function ShipmentDetailsDialog({ 
  shipment, 
  open, 
  onOpenChange, 
  onRefresh,
  isRefreshing = false 
}: ShipmentDetailsDialogProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!shipment) return null;

  const toAddress = shipment.to_address as any;
  const fromAddress = shipment.from_address as any;
  const trackingEvents = (shipment.tracking_events || []) as any[];
  const invoice = shipment.invoice as any;
  const products = (shipment.products || []) as any[];
  const volumes = (shipment.volumes || []) as any[];
  const serviceDetails = shipment.service_details as any;
  const financialDetails = shipment.financial_details as any;
  const conciliation = shipment.conciliation as any;
  const additionalInfo = shipment.additional_info as any;
  const agencyAddress = shipment.agency_address as any;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return '-';
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      log.error('Failed to copy:', err);
    }
  };

  const getStatusBadge = (status: string | null) => {
    const config = statusConfig[status || 'pending'] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} gap-1 text-sm px-3 py-1`}>
        <Icon className="h-4 w-4" />
        {config.label}
      </Badge>
    );
  };

  const CopyButton = ({ text, fieldName }: { text: string; fieldName: string }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={() => copyToClipboard(text, fieldName)}
    >
      {copiedField === fieldName ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {serviceDetails?.company_picture && (
                <img 
                  src={serviceDetails.company_picture} 
                  alt={shipment.carrier || ''} 
                  className="h-8 w-8 object-contain rounded"
                />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  <span>Envio {shipment.tracking_code || shipment.protocol}</span>
                </div>
                <p className="text-sm text-muted-foreground font-normal">
                  {shipment.carrier} • {shipment.service_name}
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onRefresh(shipment.id)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar
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
            {/* Tab: Resumo */}
            <TabsContent value="resumo" className="space-y-4 m-0">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                {getStatusBadge(shipment.status)}
                {shipment.external_order_number && (
                  <Badge variant="outline" className="gap-1">
                    <FileText className="h-3 w-3" />
                    Pedido #{shipment.external_order_number}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tracking Code */}
                {shipment.tracking_code && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Código de Rastreio</p>
                          <p className="font-mono font-medium">{shipment.tracking_code}</p>
                        </div>
                        <div className="flex gap-1">
                          <CopyButton text={shipment.tracking_code} fieldName="tracking" />
                          {serviceDetails?.tracking_link && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => window.open(serviceDetails.tracking_link.replace('{tracking}', shipment.tracking_code), '_blank')}
                            >
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Protocol */}
                {shipment.protocol && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Protocolo</p>
                          <p className="font-mono font-medium">{shipment.protocol}</p>
                        </div>
                        <CopyButton text={shipment.protocol} fieldName="protocol" />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Authorization Code */}
                {shipment.authorization_code && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Código de Autorização</p>
                          <p className="font-mono font-medium">{shipment.authorization_code}</p>
                        </div>
                        <CopyButton text={shipment.authorization_code} fieldName="auth_code" />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* CTE Key */}
                {shipment.cte_key && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Chave CT-e</p>
                          <p className="font-mono text-xs truncate max-w-[200px]">{shipment.cte_key}</p>
                        </div>
                        <CopyButton text={shipment.cte_key} fieldName="cte_key" />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Print/Preview Links */}
              <div className="flex gap-2 flex-wrap">
                {shipment.print_url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(shipment.print_url!, '_blank')}>
                    <FileText className="h-4 w-4 mr-2" />
                    Imprimir Etiqueta
                  </Button>
                )}
                {shipment.preview_url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(shipment.preview_url!, '_blank')}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Visualizar
                  </Button>
                )}
              </div>

              {/* Quick Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Prazo</p>
                  <p className="font-medium">{shipment.delivery_min}-{shipment.delivery_max} dias úteis</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Previsão</p>
                  <p className="font-medium">{formatDate(shipment.estimated_delivery_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valor do Frete</p>
                  <p className="font-medium">{formatCurrency(shipment.price)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Última Atualização</p>
                  <p className="font-medium">{formatDate(shipment.last_sync_at)}</p>
                </div>
              </div>
            </TabsContent>

            {/* Tab: Entrega */}
            <TabsContent value="entrega" className="space-y-6 m-0">
              {/* Recipient */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Destinatário
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-sm">
                      <p className="font-medium text-base">{shipment.receiver_name}</p>
                      {shipment.receiver_document && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <FileText className="h-3 w-3" />
                          {shipment.receiver_document}
                        </p>
                      )}
                      {shipment.receiver_phone && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {shipment.receiver_phone}
                        </p>
                      )}
                      {shipment.receiver_email && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          {shipment.receiver_email}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-sm">
                      <p className="flex items-start gap-2">
                        <MapPin className="h-3 w-3 mt-1 flex-shrink-0" />
                        <span>
                          {toAddress?.address}, {toAddress?.number}
                          {toAddress?.complement && ` - ${toAddress.complement}`}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        {toAddress?.district} - {shipment.receiver_city}/{shipment.receiver_state}
                      </p>
                      <p className="text-muted-foreground">CEP: {toAddress?.postal_code}</p>
                      {shipment.receiver_note && (
                        <p className="text-muted-foreground italic mt-2">
                          "{shipment.receiver_note}"
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Separator />

              {/* Sender */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Remetente
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-sm">
                      <p className="font-medium text-base">{fromAddress?.name || fromAddress?.company}</p>
                      {shipment.sender_document && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <FileText className="h-3 w-3" />
                          {shipment.sender_document}
                        </p>
                      )}
                      {shipment.sender_phone && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Phone className="h-3 w-3" />
                          {shipment.sender_phone}
                        </p>
                      )}
                      {shipment.sender_email && (
                        <p className="text-muted-foreground flex items-center gap-2">
                          <Mail className="h-3 w-3" />
                          {shipment.sender_email}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 space-y-2 text-sm">
                      <p className="flex items-start gap-2">
                        <MapPin className="h-3 w-3 mt-1 flex-shrink-0" />
                        <span>
                          {fromAddress?.address}, {fromAddress?.number}
                          {fromAddress?.complement && ` - ${fromAddress.complement}`}
                        </span>
                      </p>
                      <p className="text-muted-foreground">
                        {fromAddress?.district} - {fromAddress?.city}/{fromAddress?.state_abbr || fromAddress?.state}
                      </p>
                      <p className="text-muted-foreground">CEP: {fromAddress?.postal_code}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Separator />

              {/* Package Info */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  Pacote
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Weight className="h-3 w-3" />
                        Peso Real
                      </p>
                      <p className="font-medium">{shipment.weight ? `${shipment.weight} kg` : '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Weight className="h-3 w-3" />
                        Peso Cobrado
                      </p>
                      <p className="font-medium">{shipment.billed_weight ? `${shipment.billed_weight} kg` : '-'}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Ruler className="h-3 w-3" />
                        Dimensões
                      </p>
                      <p className="font-medium">
                        {(shipment.dimensions as any)?.height || shipment.height}x
                        {(shipment.dimensions as any)?.width || shipment.width}x
                        {(shipment.dimensions as any)?.length || shipment.length} cm
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Formato</p>
                      <p className="font-medium capitalize">{shipment.format || '-'}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Special Options */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {shipment.receipt && (
                    <Badge variant="secondary">
                      <Receipt className="h-3 w-3 mr-1" />
                      Aviso de Recebimento
                    </Badge>
                  )}
                  {shipment.own_hand && (
                    <Badge variant="secondary">
                      <User className="h-3 w-3 mr-1" />
                      Mão Própria
                    </Badge>
                  )}
                  {shipment.collect && (
                    <Badge variant="secondary">
                      <Truck className="h-3 w-3 mr-1" />
                      Coleta
                    </Badge>
                  )}
                  {shipment.non_commercial && (
                    <Badge variant="secondary">
                      <Shield className="h-3 w-3 mr-1" />
                      Não Comercial
                    </Badge>
                  )}
                </div>
              </div>

              {/* Agency PUDO */}
              {shipment.agency_name && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Ponto de Coleta (PUDO)
                    </h4>
                    <Card>
                      <CardContent className="pt-4 text-sm">
                        <p className="font-medium">{shipment.agency_name}</p>
                        {agencyAddress && (
                          <p className="text-muted-foreground">
                            {agencyAddress.address}, {agencyAddress.number} - {agencyAddress.city}/{agencyAddress.state}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Tab: Produtos */}
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
                          <TableCell className="text-right">{product.weight ? `${product.weight} kg` : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end gap-4 text-sm">
                    <span className="text-muted-foreground">
                      Total: {products.reduce((sum: number, p: any) => sum + (p.quantity || 1), 0)} itens
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Box className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum produto cadastrado neste envio</p>
                </div>
              )}

              {/* Volumes */}
              {volumes.length > 0 && (
                <>
                  <Separator />
                  <h4 className="font-medium">Volumes</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {volumes.map((volume: any, idx: number) => (
                      <Card key={idx}>
                        <CardContent className="pt-4 text-sm">
                          <p className="font-medium">Volume {idx + 1}</p>
                          <p className="text-muted-foreground">
                            {volume.height}x{volume.width}x{volume.length} cm • {volume.weight} kg
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Tab: Financeiro */}
            <TabsContent value="financeiro" className="space-y-4 m-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Valor do Frete</p>
                    <p className="text-xl font-bold text-primary">{formatCurrency(shipment.price)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Desconto</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(shipment.discount)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Seguro</p>
                    <p className="text-xl font-bold">{formatCurrency(shipment.insurance_value)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="text-xl font-bold">
                      {formatCurrency((shipment.price || 0) - (shipment.discount || 0))}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Payment Info */}
              {conciliation && (
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-3">
                      <CreditCard className="h-4 w-4" />
                      Pagamento
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <p className="font-medium capitalize">{conciliation.status || '-'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Peso Cobrado</p>
                        <p className="font-medium">{conciliation.billed_weight ? `${conciliation.billed_weight} kg` : '-'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Diferença</p>
                        <p className="font-medium">{formatCurrency(conciliation.difference)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Data</p>
                        <p className="font-medium">{formatDate(conciliation.date)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Invoice */}
              {invoice && (
                <Card>
                  <CardContent className="pt-4">
                    <h4 className="font-medium flex items-center gap-2 mb-3">
                      <Receipt className="h-4 w-4" />
                      Nota Fiscal
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Número</p>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{invoice.number || '-'}</p>
                          {invoice.number && <CopyButton text={invoice.number} fieldName="invoice_number" />}
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Série</p>
                        <p className="font-medium">{invoice.serie || '-'}</p>
                      </div>
                      {invoice.key && (
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Chave NFe</p>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-xs truncate">{invoice.key}</p>
                            <CopyButton text={invoice.key} fieldName="invoice_key" />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Dates */}
              <Card>
                <CardContent className="pt-4">
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <Calendar className="h-4 w-4" />
                    Datas
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Criado em</p>
                      <p className="font-medium">{formatDate(shipment.generated_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pago em</p>
                      <p className="font-medium">{formatDate(shipment.paid_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Postado em</p>
                      <p className="font-medium">{formatDate(shipment.posted_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Entregue em</p>
                      <p className="font-medium">{formatDate(shipment.delivered_at)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Rastreio */}
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
                                {event.description && (
                                  <p className="text-sm text-muted-foreground">{event.description}</p>
                                )}
                                {event.city && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    <MapPin className="h-3 w-3 inline mr-1" />
                                    {event.city}/{event.state}
                                  </p>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(event.date || event.created_at)}
                              </p>
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

              {/* Additional Info */}
              {additionalInfo && (
                <>
                  <Separator />
                  <h4 className="font-medium">Informações Adicionais</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {additionalInfo.route && (
                      <div>
                        <p className="text-muted-foreground">Rota</p>
                        <p className="font-medium">{additionalInfo.route}</p>
                      </div>
                    )}
                    {additionalInfo.destination_unit && (
                      <div>
                        <p className="text-muted-foreground">Unidade Destino</p>
                        <p className="font-medium">{additionalInfo.destination_unit}</p>
                      </div>
                    )}
                    {additionalInfo.barcode && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground">Código de Barras</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs">{additionalInfo.barcode}</p>
                          <CopyButton text={additionalInfo.barcode} fieldName="barcode" />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
