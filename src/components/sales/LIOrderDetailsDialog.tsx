import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Copy, Package, Truck, CreditCard, User, MapPin, ExternalLink,
  Calendar, Phone, Mail, Tag, FileText, ShoppingCart
} from "lucide-react";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

// View model - matches what SalesContent passes
interface OrderItemView {
  id: string;
  name: string | null;
  sku: string | null;
  qty: number;
  price: number;
  raw_json: Json;
}

interface OrderView {
  id: string;
  order_number: string;
  status_name: string | null;
  status_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_doc: string | null;
  valor_subtotal: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  valor_total: number | null;
  created_at_remote: string | null;
  updated_at_remote: string | null;
  forma_pagamento: string | null;
  pagamento_tipo: string | null;
  pagamento_parcelas: number | null;
  pagamento_bandeira: string | null;
  pagamento_codigo: string | null;
  gateway_pagamento: string | null;
  transacao_id: string | null;
  data_pagamento: string | null;
  forma_envio: string | null;
  codigo_rastreio: string | null;
  url_rastreio: string | null;
  data_envio: string | null;
  nome_destinatario: string | null;
  telefone_destinatario: string | null;
  endereco: any;
  peso_real: number | null;
  cupom_desconto: string | null;
  observacoes: string | null;
  envios: any;
  parcelas: any;
  items: OrderItemView[];
}

interface LIOrderDetailsDialogProps {
  order: OrderView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatCurrency = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numValue);
};

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "-";
  try {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch { return String(dateString); }
};

const formatCPFCNPJ = (value: string | null | undefined) => {
  if (!value) return "-";
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length === 11) return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (cleaned.length === 14) return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
};

const safeString = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const getStatusColor = (status: string | null) => {
  if (!status) return "secondary";
  const s = status.toLowerCase();
  if (s.includes('pago') || s.includes('aprovado') || s.includes('concluido') || s.includes('entregue')) return "default";
  if (s.includes('pendente') || s.includes('aguardando')) return "secondary";
  if (s.includes('cancelado') || s.includes('estornado')) return "destructive";
  if (s.includes('enviado') || s.includes('transporte')) return "outline";
  return "secondary";
};

const copyToClipboard = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado!`);
};

// Extract item detail from raw_json
const getItemRaw = (item: OrderItemView, key: string): any => {
  if (!item.raw_json || typeof item.raw_json !== 'object' || Array.isArray(item.raw_json)) return null;
  return (item.raw_json as any)[key] ?? null;
};

export function LIOrderDetailsDialog({ order, open, onOpenChange }: LIOrderDetailsDialogProps) {
  if (!order) return null;

  const items = order.items || [];
  const hasTrackingCode = !!order.codigo_rastreio;
  const hasCoupon = !!order.cupom_desconto;
  const endereco = order.endereco || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Package className="h-5 w-5" />
            <span>Pedido #{order.order_number}</span>
            <Badge variant={getStatusColor(order.status_name)}>
              {order.status_name || "Sem status"}
            </Badge>
            {hasTrackingCode && (
              <Badge variant="outline" className="gap-1"><Truck className="h-3 w-3" />Rastreio</Badge>
            )}
            {hasCoupon && (
              <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200"><Tag className="h-3 w-3" />Cupom</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="resumo" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="itens">Itens ({items.length})</TabsTrigger>
            <TabsTrigger value="entrega">Entrega</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          </TabsList>

          {/* RESUMO */}
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

          {/* ITENS */}
          <TabsContent value="itens" className="mt-4">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum item encontrado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => {
                  const imgUrl = getItemRaw(item, 'imagem_url');
                  const variacao = getItemRaw(item, 'variacao');
                  return (
                    <div key={item.id || index} className="border rounded-lg p-4">
                      <div className="flex gap-4">
                        {imgUrl && (
                          <img src={imgUrl} alt={item.name || "Produto"} className="w-16 h-16 object-cover rounded-lg"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h5 className="font-medium">{item.name || "Produto sem nome"}</h5>
                              {item.sku && <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>}
                              {variacao && <p className="text-sm text-muted-foreground">Variação: {variacao}</p>}
                            </div>
                            <Badge variant="outline">{item.qty || 1}x</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Unitário:</span>
                              <p className="font-medium">{formatCurrency(item.price)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Subtotal:</span>
                              <p className="font-semibold">{formatCurrency(item.price * item.qty)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="bg-muted/50 p-4 rounded-lg mt-4">
                  <div className="flex justify-between text-sm">
                    <span>Total de itens:</span>
                    <span className="font-medium">{items.reduce((sum, i) => sum + (i.qty || 1), 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ENTREGA */}
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

          {/* FINANCEIRO */}
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
