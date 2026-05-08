import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, MapPin, User, Calendar, Building2, ShoppingBag, Package, ChevronDown, ChevronUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tables } from "@/integrations/supabase/types";

interface ClientDetailsDialogProps {
  client: Tables<"li_customers"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ClientDetailsDialog = ({ client, open, onOpenChange }: ClientDetailsDialogProps) => {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Fetch orders for this client via customer_id FK
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['client-orders', client?.id],
    queryFn: async () => {
      if (!client?.id) return [];
      const { data, error } = await supabase
        .from('li_orders')
        .select('id, order_number, status_name, created_at_remote, totals_json, payment_json, shipping_json')
        .eq('customer_id', client.id)
        .order('created_at_remote', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!client?.id && open
  });

  // Fetch order items for expanded order
  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['order-items', expandedOrderId],
    queryFn: async () => {
      if (!expandedOrderId) return [];
      const { data, error } = await supabase
        .from('li_order_items')
        .select('id, name, sku, qty, price, raw_json')
        .eq('order_id', expandedOrderId);
      if (error) throw error;
      return data;
    },
    enabled: !!expandedOrderId
  });

  if (!client) return null;

  const formatDateTime = (date: string | null) => {
    if (!date) return null;
    try {
      return format(parseISO(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return null;
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getInitials = (name: string | null) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  // Parse address from JSONB, fallback to raw_json.enderecos
  let address = client.address_json as any;
  if (!address || (!address.endereco && !address.cidade)) {
    const raw = client.raw_json as any;
    const enderecos = Array.isArray(raw?.enderecos) ? raw.enderecos : [];
    address = enderecos.find((e: any) => e.principal) || enderecos[0] || null;
  }
  const hasAddress = address && (address.endereco || address.cidade);

  // Extract additional data from raw_json
  const rawData = client.raw_json as any;
  const dataNascimento = rawData?.data_nascimento;
  const sexo = rawData?.sexo;
  const tipo = rawData?.tipo;
  const telefonePrincipal = rawData?.telefone_principal;
  const telefoneComercial = rawData?.telefone_comercial;
  const aceitaNewsletter = rawData?.aceita_newsletter;
  const dataCriacao = rawData?.data_criacao;

  const getStatusColor = (status: string | null) => {
    if (!status) return 'secondary';
    const s = status.toLowerCase();
    if (s.includes('pago') || s.includes('aprovado') || s.includes('entregue')) return 'default';
    if (s.includes('cancelado') || s.includes('recusado')) return 'destructive';
    return 'secondary';
  };

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full gradient-whatsapp flex items-center justify-center text-primary-foreground font-semibold text-lg">
              {getInitials(client.name)}
            </div>
            <div>
              <p className="text-lg font-semibold">{client.name || 'Sem nome'}</p>
              {client.doc && (
                <p className="text-sm text-muted-foreground font-normal font-mono">{client.doc}</p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <div className="space-y-4 mt-4">
            {/* Contato */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Contato
              </h4>
              <div className="grid gap-2 text-sm">
                {client.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <a href={`mailto:${client.email}`} className="hover:text-foreground transition-colors">
                      {client.email}
                    </a>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {telefonePrincipal && telefonePrincipal !== client.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{telefonePrincipal} (principal)</span>
                  </div>
                )}
                {telefoneComercial && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{telefoneComercial} (comercial)</span>
                  </div>
                )}
                {!client.email && !client.phone && !telefonePrincipal && (
                  <p className="text-muted-foreground/70">Nenhuma informação de contato</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Dados Pessoais */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Dados Pessoais
              </h4>
              <div className="grid gap-2 text-sm">
                {client.doc && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">CPF/CNPJ</span>
                    <span className="font-mono">{client.doc}</span>
                  </div>
                )}
                {tipo && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tipo</span>
                    <span>{tipo === 'PF' ? 'Pessoa Física' : tipo === 'PJ' ? 'Pessoa Jurídica' : tipo}</span>
                  </div>
                )}
                {dataNascimento && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Data de Nascimento</span>
                    <span>{formatDateTime(dataNascimento)?.split(' ')[0] || dataNascimento}</span>
                  </div>
                )}
                {sexo && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Gênero</span>
                    <span>{sexo === 'M' ? 'Masculino' : sexo === 'F' ? 'Feminino' : sexo || '-'}</span>
                  </div>
                )}
                {aceitaNewsletter !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Newsletter</span>
                    <span>{aceitaNewsletter ? 'Aceita' : 'Não aceita'}</span>
                  </div>
                )}
                {dataCriacao && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cliente desde</span>
                    <span>{formatDateTime(dataCriacao)}</span>
                  </div>
                )}
                {!client.doc && !dataNascimento && !sexo && !tipo && (
                  <p className="text-muted-foreground/70">Nenhum dado pessoal cadastrado</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Endereço */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Endereço
              </h4>
              {hasAddress ? (
                <div className="text-sm space-y-2 bg-muted/30 p-3 rounded-lg">
                  {address.endereco && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Rua:</span>
                      <span className="text-foreground">
                        {address.endereco}
                        {address.numero && `, nº ${address.numero}`}
                      </span>
                    </div>
                  )}
                  {address.complemento && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Compl.:</span>
                      <span className="text-foreground">{address.complemento}</span>
                    </div>
                  )}
                  {address.bairro && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Bairro:</span>
                      <span className="text-foreground">{address.bairro}</span>
                    </div>
                  )}
                  {(address.cidade || address.estado) && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Cidade:</span>
                      <span className="text-foreground">
                        {address.cidade || 'N/A'}
                        {address.estado && ` - ${address.estado}`}
                      </span>
                    </div>
                  )}
                  {address.cep && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">CEP:</span>
                      <span className="text-foreground font-mono">{address.cep}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">Nenhum endereço cadastrado</p>
              )}
            </div>

            <Separator />

            {/* Vendas / Pedidos */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Vendas ({orders?.length || 0})
              </h4>
              
              {ordersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : orders && orders.length > 0 ? (
                <div className="space-y-2">
                  {orders.map((order) => {
                    const totals = order.totals_json as any;
                    return (
                      <div key={order.id} className="border border-border/50 rounded-lg overflow-hidden">
                        <div 
                          className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => toggleOrderExpand(order.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">Pedido #{order.order_number}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(order.created_at_remote)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <Badge variant={getStatusColor(order.status_name) as any} className="text-xs">
                                {order.status_name || 'Sem status'}
                              </Badge>
                              <p className="text-sm font-semibold mt-1">
                                {formatCurrency(totals?.total)}
                              </p>
                            </div>
                            {expandedOrderId === order.id ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {expandedOrderId === order.id && (
                          <div className="p-3 border-t border-border/50 bg-background">
                            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                              <Package className="h-3.5 w-3.5" />
                              <span>Produtos</span>
                            </div>
                            
                            {itemsLoading ? (
                              <div className="space-y-2">
                                <Skeleton className="h-8 w-full" />
                              </div>
                            ) : orderItems && orderItems.length > 0 ? (
                              <div className="space-y-2">
                                {orderItems.map((item) => (
                                  <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-md text-sm">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">{item.name || 'Produto sem nome'}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {item.sku && `SKU: ${item.sku} • `}
                                        Qtd: {item.qty} × {formatCurrency(item.price)}
                                      </p>
                                    </div>
                                    <span className="font-medium text-sm ml-4">
                                      {formatCurrency((item.price || 0) * (item.qty || 1))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground/70 py-2">
                                Nenhum produto encontrado neste pedido
                              </p>
                            )}

                            <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-2 text-xs">
                              {(order.payment_json as any)?.method && (
                                <div>
                                  <span className="text-muted-foreground">Pagamento:</span>
                                  <span className="ml-1">{(order.payment_json as any).method}</span>
                                </div>
                              )}
                              {(order.shipping_json as any)?.method && (
                                <div>
                                  <span className="text-muted-foreground">Envio:</span>
                                  <span className="ml-1">{(order.shipping_json as any).method}</span>
                                </div>
                              )}
                              {totals?.shipping > 0 && (
                                <div>
                                  <span className="text-muted-foreground">Frete:</span>
                                  <span className="ml-1">{formatCurrency(totals.shipping)}</span>
                                </div>
                              )}
                              {totals?.discount > 0 && (
                                <div>
                                  <span className="text-muted-foreground">Desconto:</span>
                                  <span className="ml-1 text-green-600">-{formatCurrency(totals.discount)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70">Nenhuma venda encontrada para este cliente</p>
              )}
            </div>

            <Separator />

            {/* Datas do Sistema */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Informações do Sistema
              </h4>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Última atualização</span>
                  <span>{formatDateTime(client.updated_at_local)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ID Loja Integrada</span>
                  <span className="font-mono text-xs">{client.loja_integrada_customer_id}</span>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default ClientDetailsDialog;
