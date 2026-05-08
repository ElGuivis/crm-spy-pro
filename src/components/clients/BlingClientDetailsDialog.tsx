import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, MapPin, Cake, User, Calendar, Building2, ShoppingBag, Package, ChevronDown, ChevronUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tables } from "@/integrations/supabase/types";

interface BlingClientDetailsDialogProps {
  client: Tables<"bling_customers"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BlingClientDetailsDialog = ({ client, open, onOpenChange }: BlingClientDetailsDialogProps) => {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Fetch orders for this client by cliente_id
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['bling-client-orders', client?.bling_id, client?.integration_id],
    queryFn: async () => {
      if (!client?.bling_id || !client?.integration_id) return [];
      
      const { data, error } = await supabase
        .from('bling_orders')
        .select('id, numero, data_criacao, situacao_nome, valor_total, valor_produtos, valor_frete, valor_desconto, forma_pagamento, forma_envio, loja_nome')
        .eq('integration_id', client.integration_id)
        .eq('cliente_id', client.bling_id)
        .order('data_criacao', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!client?.bling_id && !!client?.integration_id && open
  });

  // Fetch order items for expanded order
  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['bling-order-items', expandedOrderId],
    queryFn: async () => {
      if (!expandedOrderId) return [];
      
      const { data, error } = await supabase
        .from('bling_order_items')
        .select('id, produto_nome, sku, quantidade, valor_unitario, valor_total, unidade, desconto')
        .eq('order_id', expandedOrderId);
      
      if (error) throw error;
      return data;
    },
    enabled: !!expandedOrderId
  });

  if (!client) return null;

  const enderecoRaw = client.endereco as any;
  const endereco = enderecoRaw?.geral || enderecoRaw;

  const formatDate = (date: string | null) => {
    if (!date) return null;
    try {
      return format(parseISO(date), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return null;
    }
  };

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

  const hasAddress = endereco?.endereco || endereco?.municipio;

  const getStatusColor = (status: string | null) => {
    if (!status) return 'secondary';
    const statusLower = status.toLowerCase();
    if (statusLower.includes('pago') || statusLower.includes('aprovado') || statusLower.includes('entregue') || statusLower.includes('atendido')) return 'default';
    if (statusLower.includes('cancelado') || statusLower.includes('recusado')) return 'destructive';
    if (statusLower.includes('aguardando') || statusLower.includes('pendente')) return 'secondary';
    return 'outline';
  };

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Calculate total spent
  const totalSpent = orders?.reduce((sum, order) => sum + (order.valor_total || 0), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
              {getInitials(client.nome)}
            </div>
            <div>
              <p className="text-lg font-semibold">{client.nome || 'Sem nome'}</p>
              {client.fantasia && (
                <p className="text-sm text-muted-foreground font-normal">{client.fantasia}</p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <div className="space-y-4 mt-4">
            {/* Resumo */}
            {orders && orders.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/30 p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground">Total de Vendas</p>
                    <p className="text-lg font-bold">{orders.length}</p>
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg">
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(totalSpent)}</p>
                  </div>
                </div>
                <Separator />
              </>
            )}

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
                {client.celular && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{client.celular}</span>
                    <Badge variant="secondary" className="text-xs">Celular</Badge>
                  </div>
                )}
                {client.telefone && client.telefone !== client.celular && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{client.telefone}</span>
                    <Badge variant="outline" className="text-xs">Fixo</Badge>
                  </div>
                )}
                {!client.email && !client.celular && !client.telefone && (
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
                {client.cpf_cnpj && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{client.tipo_pessoa === 'J' ? 'CNPJ' : 'CPF'}</span>
                    <span className="font-mono">{client.cpf_cnpj}</span>
                  </div>
                )}
                {client.ie && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">IE</span>
                    <span className="font-mono">{client.ie}</span>
                  </div>
                )}
                {client.rg && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">RG</span>
                    <span className="font-mono">{client.rg}{client.orgao_emissor ? ` - ${client.orgao_emissor}` : ''}</span>
                  </div>
                )}
                {client.data_nascimento && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Cake className="h-3.5 w-3.5" />
                      Data de Nascimento
                    </span>
                    <span>{formatDate(client.data_nascimento)}</span>
                  </div>
                )}
                {client.sexo && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sexo</span>
                    <span>{client.sexo === 'M' ? 'Masculino' : client.sexo === 'F' ? 'Feminino' : client.sexo}</span>
                  </div>
                )}
                {client.naturalidade && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Naturalidade</span>
                    <span>{client.naturalidade}</span>
                  </div>
                )}
                {!client.cpf_cnpj && !client.data_nascimento && !client.sexo && !client.rg && (
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
                  {(endereco?.endereco || endereco?.numero) && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Rua:</span>
                      <span className="text-foreground">
                        {endereco?.endereco || 'N/A'}
                        {endereco?.numero && `, nº ${endereco.numero}`}
                      </span>
                    </div>
                  )}
                  {endereco?.complemento && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Compl.:</span>
                      <span className="text-foreground">{endereco.complemento}</span>
                    </div>
                  )}
                  {endereco?.bairro && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Bairro:</span>
                      <span className="text-foreground">{endereco.bairro}</span>
                    </div>
                  )}
                  {(endereco?.municipio || endereco?.uf) && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">Cidade:</span>
                      <span className="text-foreground">
                        {endereco?.municipio || 'N/A'}
                        {endereco?.uf && ` - ${endereco.uf}`}
                      </span>
                    </div>
                  )}
                  {endereco?.cep && (
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground min-w-[60px]">CEP:</span>
                      <span className="text-foreground font-mono">{endereco.cep}</span>
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
                  {orders.map((order) => (
                    <div key={order.id} className="border border-border/50 rounded-lg overflow-hidden">
                      {/* Order Header */}
                      <div 
                        className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleOrderExpand(order.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">Pedido #{order.numero}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(order.data_criacao)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <Badge variant={getStatusColor(order.situacao_nome) as any} className="text-xs">
                              {order.situacao_nome || 'Sem status'}
                            </Badge>
                            <p className="text-sm font-semibold mt-1">
                              {formatCurrency(order.valor_total)}
                            </p>
                          </div>
                          {expandedOrderId === order.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Order Items (Expanded) */}
                      {expandedOrderId === order.id && (
                        <div className="p-3 border-t border-border/50 bg-background">
                          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                            <Package className="h-3.5 w-3.5" />
                            <span>Produtos</span>
                          </div>
                          
                          {itemsLoading ? (
                            <div className="space-y-2">
                              <Skeleton className="h-8 w-full" />
                              <Skeleton className="h-8 w-full" />
                            </div>
                          ) : orderItems && orderItems.length > 0 ? (
                            <div className="space-y-2">
                              {orderItems.map((item) => (
                                <div 
                                  key={item.id} 
                                  className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-md text-sm"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{item.produto_nome || 'Produto sem nome'}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.sku && `SKU: ${item.sku} • `}
                                      Qtd: {item.quantidade} × {formatCurrency(item.valor_unitario)}
                                    </p>
                                  </div>
                                  <span className="font-medium text-sm ml-4">
                                    {formatCurrency(item.valor_total)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground/70 py-2">
                              Nenhum produto encontrado neste pedido
                            </p>
                          )}

                          {/* Order Details */}
                          <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 gap-2 text-xs">
                            {order.forma_pagamento && (
                              <div>
                                <span className="text-muted-foreground">Pagamento:</span>
                                <span className="ml-1">{order.forma_pagamento}</span>
                              </div>
                            )}
                            {order.forma_envio && (
                              <div>
                                <span className="text-muted-foreground">Envio:</span>
                                <span className="ml-1">{order.forma_envio}</span>
                              </div>
                            )}
                            {order.valor_frete !== null && order.valor_frete > 0 && (
                              <div>
                                <span className="text-muted-foreground">Frete:</span>
                                <span className="ml-1">{formatCurrency(order.valor_frete)}</span>
                              </div>
                            )}
                            {order.valor_desconto !== null && order.valor_desconto > 0 && (
                              <div>
                                <span className="text-muted-foreground">Desconto:</span>
                                <span className="ml-1 text-green-600">-{formatCurrency(order.valor_desconto)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
                {client.data_inclusao && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cadastrado em</span>
                    <span>{formatDateTime(client.data_inclusao)}</span>
                  </div>
                )}
                {client.synced_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sincronizado em</span>
                    <span>{formatDateTime(client.synced_at)}</span>
                  </div>
                )}
                {client.situacao && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Situação</span>
                    <Badge variant={client.situacao === 'A' ? 'default' : 'secondary'}>
                      {client.situacao === 'A' ? 'Ativo' : client.situacao === 'I' ? 'Inativo' : client.situacao}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default BlingClientDetailsDialog;
