import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  RefreshCw, 
  Package, 
  Truck, 
  CreditCard, 
  User, 
  Store,
  FileText,
  MapPin,
  Copy,
  ExternalLink,
  Cake
} from "lucide-react";
import { format, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

import { createLogger } from '@/lib/logger';
const log = createLogger('BlingOrderDetailsDialog');

interface BlingOrderFull {
  id: string;
  bling_id: number;
  numero: string;
  numero_loja: string | null;
  situacao_nome: string | null;
  situacao_id: number | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  cliente_telefone: string | null;
  cliente_cpf_cnpj: string | null;
  valor_total: number | null;
  valor_produtos: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  outras_despesas: number | null;
  data_criacao: string | null;
  data_saida: string | null;
  data_prevista: string | null;
  forma_pagamento: string | null;
  forma_envio: string | null;
  loja_nome: string | null;
  loja_id: number | null;
  observacoes: string | null;
  observacoes_internas: string | null;
  endereco_entrega: any;
  categoria_id: number | null;
  nota_fiscal_id: number | null;
  total_icms: number | null;
  total_ipi: number | null;
  vendedor_id: number | null;
  intermediador_cnpj: string | null;
  intermediador_nome_usuario: string | null;
  taxa_comissao: number | null;
  custo_frete: number | null;
  valor_base: number | null;
  frete_por_conta: number | null;
  quantidade_volumes: number | null;
  peso_bruto: number | null;
  prazo_entrega: number | null;
  transportador_id: number | null;
  transportador_nome: string | null;
  etiqueta: any;
  volumes: any[];
  parcelas: any[];
  numero_pedido_compra: string | null;
  integration_id: string;
}

interface BlingOrderItem {
  id: string;
  produto_nome: string | null;
  sku: string | null;
  quantidade: number;
  valor_unitario: number | null;
  valor_total: number | null;
  desconto: number | null;
  unidade: string | null;
  aliquota_ipi: number | null;
  descricao_detalhada: string | null;
  comissao_base: number | null;
  comissao_aliquota: number | null;
  comissao_valor: number | null;
  preco_custo: number | null;
}

interface BlingCustomer {
  id: string;
  bling_id: number;
  nome: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  naturalidade: string | null;
  rg: string | null;
}

interface BlingOrderDetailsDialogProps {
  order: BlingOrderFull | null;
  orderItems: BlingOrderItem[];
  loadingItems: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getStatusDisplayName?: (status: string | null, situacaoId: number | null) => string;
  getPaymentDisplayName?: (code: string | null) => string | null;
}

export function BlingOrderDetailsDialog({ 
  order, 
  orderItems, 
  loadingItems, 
  open, 
  onOpenChange,
  getStatusDisplayName,
  getPaymentDisplayName
}: BlingOrderDetailsDialogProps) {
  const { toast } = useToast();
  const [customer, setCustomer] = useState<BlingCustomer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);

  // Fetch customer data when order changes
  useEffect(() => {
    async function fetchCustomer() {
      if (!order?.cliente_id || !order?.integration_id) {
        setCustomer(null);
        return;
      }

      setLoadingCustomer(true);
      try {
        const { data, error } = await supabase
          .from('bling_customers')
          .select('id, bling_id, nome, data_nascimento, sexo, naturalidade, rg')
          .eq('bling_id', order.cliente_id)
          .eq('integration_id', order.integration_id)
          .maybeSingle();

        if (error) {
          log.error('Error fetching customer:', error);
        } else {
          setCustomer(data);
        }
      } catch (err) {
        log.error('Error fetching customer:', err);
      } finally {
        setLoadingCustomer(false);
      }
    }

    if (open && order) {
      fetchCustomer();
    }
  }, [order, open]);

  const calculateAge = (birthDate: string | null): number | null => {
    if (!birthDate) return null;
    try {
      return differenceInYears(new Date(), new Date(birthDate));
    } catch {
      return null;
    }
  };

  const formatBirthday = (birthDate: string | null): string => {
    if (!birthDate) return "-";
    try {
      return format(new Date(birthDate), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "-";
    }
  };

  const getSexoLabel = (sexo: string | null): string => {
    if (!sexo) return "-";
    if (sexo === 'M') return "Masculino";
    if (sexo === 'F') return "Feminino";
    return sexo;
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "R$ 0,00";
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      // Bling often sends only a DATE (no time). When it happens, backend stores it as midnight UTC.
      // If we format using local timezone (ex: Brazil), it may display as the previous day.
      const hasRealTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0;
      if (hasRealTime) {
        return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
      }

      const dd = String(date.getUTCDate()).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = String(date.getUTCFullYear());
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return "-";
    }
  };

  const formatDateShort = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      const date = new Date(dateStr);
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = String(date.getUTCFullYear());
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return "-";
    }
  };

  const getStatusColor = (status: string | null) => {
    if (!status) return "secondary";
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes("pago") || lowerStatus.includes("completo") || lowerStatus.includes("enviado") || lowerStatus.includes("atendido")) {
      return "default";
    }
    if (lowerStatus.includes("aguard") || lowerStatus.includes("pendent") || lowerStatus.includes("aberto")) {
      return "secondary";
    }
    if (lowerStatus.includes("cancel")) {
      return "destructive";
    }
    return "outline";
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: `${label} copiado para a área de transferência.`
    });
  };

  const getFreteResponsavel = (fretePorConta: number | null) => {
    if (fretePorConta === 0) return "Remetente (CIF)";
    if (fretePorConta === 1) return "Destinatário (FOB)";
    if (fretePorConta === 2) return "Terceiros";
    if (fretePorConta === 9) return "Sem frete";
    return "-";
  };

  const displayValue = (value: any) => {
    if (value === null || value === undefined || value === '') return "-";
    return value;
  };

  if (!order) return null;

  const endereco = order.endereco_entrega;
  const hasVolumes = order.volumes && Array.isArray(order.volumes) && order.volumes.length > 0;
  const hasParcelas = order.parcelas && Array.isArray(order.parcelas) && order.parcelas.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl">Pedido #{order.numero}</DialogTitle>
              <Badge variant="outline" className="text-xs">
                Loja: {displayValue(order.numero_loja)}
              </Badge>
            </div>
            <Badge variant={getStatusColor(order.situacao_nome)} className="ml-2">
              {order.situacao_nome || 'Desconhecido'}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <Tabs defaultValue="resumo" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="resumo">Resumo</TabsTrigger>
              <TabsTrigger value="itens">Itens ({orderItems.length})</TabsTrigger>
              <TabsTrigger value="entrega">Entrega</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            </TabsList>

            {/* TAB RESUMO */}
            <TabsContent value="resumo" className="space-y-4 mt-4">
              {/* Main Values */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Produtos</p>
                  <p className="text-lg font-bold">{formatCurrency(order.valor_produtos)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Frete</p>
                  <p className="text-lg font-semibold text-blue-600">{formatCurrency(order.valor_frete)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Desconto</p>
                  <p className="text-lg font-semibold text-red-600">-{formatCurrency(order.valor_desconto)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(order.valor_total)}</p>
                </div>
              </div>

              {/* Client - Always show all fields */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <User className="h-4 w-4" />
                  Cliente
                  {loadingCustomer && <RefreshCw className="h-3 w-3 animate-spin" />}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-3 border rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">Nome</p>
                    <p className="font-medium">{displayValue(order.cliente_nome)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">CPF/CNPJ</p>
                      <p className="font-medium">{displayValue(order.cliente_cpf_cnpj)}</p>
                    </div>
                    {order.cliente_cpf_cnpj && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(order.cliente_cpf_cnpj!, 'CPF/CNPJ')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">E-mail</p>
                      <p className="font-medium">{displayValue(order.cliente_email)}</p>
                    </div>
                    {order.cliente_email && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(order.cliente_email!, 'E-mail')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Telefone</p>
                      <p className="font-medium">{displayValue(order.cliente_telefone)}</p>
                    </div>
                    {order.cliente_telefone && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(order.cliente_telefone!, 'Telefone')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Birthday from customer data */}
                  <div className="flex items-center gap-2">
                    <Cake className="h-4 w-4 text-pink-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Data de Nascimento</p>
                      <p className="font-medium">
                        {customer?.data_nascimento ? (
                          <>
                            {formatBirthday(customer.data_nascimento)}
                            {calculateAge(customer.data_nascimento) !== null && (
                              <span className="text-muted-foreground ml-1">
                                ({calculateAge(customer.data_nascimento)} anos)
                              </span>
                            )}
                          </>
                        ) : "-"}
                      </p>
                    </div>
                  </div>
                  
                  {/* Sex from customer data */}
                  <div>
                    <p className="text-xs text-muted-foreground">Sexo</p>
                    <p className="font-medium">{getSexoLabel(customer?.sexo || null)}</p>
                  </div>
                </div>
              </div>

              {/* Dates and Store - Always show all fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground">Data do Pedido</p>
                  <p className="font-medium">{formatDate(order.data_criacao)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground">Data de Saída</p>
                  <p className="font-medium">{formatDateShort(order.data_saida)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground">Previsão de Entrega</p>
                  <p className="font-medium">{formatDateShort(order.data_prevista)}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center gap-1">
                    <Store className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Loja/Canal</p>
                  </div>
                  <p className="font-medium">{displayValue(order.loja_nome)}</p>
                </div>
              </div>

              {/* Marketplace - Always show */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ExternalLink className="h-4 w-4" />
                  Marketplace / Intermediador
                </div>
                <div className="grid grid-cols-2 gap-4 p-3 border rounded-lg bg-orange-50 dark:bg-orange-950/20">
                  <div>
                    <p className="text-xs text-muted-foreground">Usuário</p>
                    <p className="font-medium">{displayValue(order.intermediador_nome_usuario)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">CNPJ Intermediador</p>
                    <p className="font-medium">{displayValue(order.intermediador_cnpj)}</p>
                  </div>
                </div>
              </div>

              {/* IDs and References - Always show */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Referências
                </div>
                <div className="grid grid-cols-3 gap-4 p-3 border rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground">ID Bling</p>
                    <p className="font-medium">{displayValue(order.bling_id)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Nº Pedido Compra</p>
                    <p className="font-medium">{displayValue(order.numero_pedido_compra)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ID Vendedor</p>
                    <p className="font-medium">{displayValue(order.vendedor_id)}</p>
                  </div>
                </div>
              </div>

              {/* Observations - Always show */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Observações
                </div>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Observação do Cliente</p>
                    <p className="text-sm">{displayValue(order.observacoes)}</p>
                  </div>
                  <div className="p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                    <p className="text-xs text-muted-foreground mb-1">Observação Interna</p>
                    <p className="text-sm">{displayValue(order.observacoes_internas)}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB ITENS */}
            <TabsContent value="itens" className="mt-4">
              {loadingItems ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                </div>
              ) : orderItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum item encontrado</p>
                  <p className="text-xs mt-2">Os itens serão exibidos após a sincronização completa</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-center">Qtd</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Unit.</TableHead>
                        <TableHead className="text-right">Desc.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{displayValue(item.produto_nome)}</p>
                              {item.descricao_detalhada && (
                                <p className="text-xs text-muted-foreground">{item.descricao_detalhada}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{displayValue(item.sku)}</TableCell>
                          <TableCell className="text-center">
                            {item.quantidade} {item.unidade || 'un'}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.preco_custo && item.preco_custo > 0 ? formatCurrency(item.preco_custo) : '-'}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(item.valor_unitario)}</TableCell>
                          <TableCell className="text-right text-red-600">
                            {item.desconto && item.desconto > 0 ? `-${formatCurrency(item.desconto)}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.valor_total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Item commissions if any */}
                  {orderItems.some(item => item.comissao_valor && item.comissao_valor > 0) && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Comissões dos Itens</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Produto</TableHead>
                            <TableHead className="text-right">Base</TableHead>
                            <TableHead className="text-right">Alíquota</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderItems.filter(item => item.comissao_valor && item.comissao_valor > 0).map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{displayValue(item.produto_nome)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(item.comissao_base)}</TableCell>
                              <TableCell className="text-right">{item.comissao_aliquota}%</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(item.comissao_valor)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* TAB ENTREGA */}
            <TabsContent value="entrega" className="space-y-4 mt-4">
              {/* Address - Always show */}
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

              {/* Transport - Always show all fields */}
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
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(vol.codigoRastreamento, 'Código de rastreio')}
                                >
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
            </TabsContent>

            {/* TAB FINANCEIRO */}
            <TabsContent value="financeiro" className="space-y-4 mt-4">
              {/* Financial Summary */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CreditCard className="h-4 w-4" />
                  Resumo Financeiro
                </div>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Produtos</span>
                    <span>{formatCurrency(order.valor_produtos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frete</span>
                    <span>{formatCurrency(order.valor_frete)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Outras Despesas</span>
                    <span>{formatCurrency(order.outras_despesas)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Desconto</span>
                    <span>-{formatCurrency(order.valor_desconto)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(order.valor_total)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Method - Extract from parcelas or show direct field */}
              <div className="p-3 border rounded-lg">
                <p className="text-xs text-muted-foreground">Forma de Pagamento</p>
                <p className="font-medium">
                  {(() => {
                    // Try direct field first
                    if (order.forma_pagamento) {
                      return getPaymentDisplayName?.(order.forma_pagamento) || order.forma_pagamento;
                    }
                    // Try parcelas
                    if (hasParcelas && order.parcelas[0]?.formaPagamento) {
                      const paymentId = String(order.parcelas[0].formaPagamento.id);
                      const customName = getPaymentDisplayName?.(paymentId);
                      if (customName) return customName;
                      if (order.parcelas[0].formaPagamento.descricao) {
                        return order.parcelas[0].formaPagamento.descricao;
                      }
                      return `ID: ${paymentId}`;
                    }
                    return "-";
                  })()}
                </p>
              </div>

              {/* Installments */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Parcelas</p>
                {hasParcelas ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Forma de Pagamento</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Observação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.parcelas.map((parcela: any, idx: number) => {
                        const paymentId = parcela.formaPagamento?.id ? String(parcela.formaPagamento.id) : null;
                        const customPaymentName = paymentId ? getPaymentDisplayName?.(paymentId) : null;
                        const displayPayment = customPaymentName || 
                          parcela.formaPagamento?.descricao || 
                          (paymentId ? `ID: ${paymentId}` : '-');
                        
                        return (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{displayPayment}</TableCell>
                          <TableCell>{formatDateShort(parcela.dataVencimento)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(parcela.valor)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {parcela.observacoes || parcela.observacao || '-'}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-4 border rounded-lg text-center text-muted-foreground">
                    <p>Nenhuma parcela informada</p>
                  </div>
                )}
              </div>

              {/* Marketplace Fees - Always show */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Taxas do Marketplace</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
                    <p className="text-xs text-muted-foreground">Comissão</p>
                    <p className="font-medium text-red-600">
                      {order.taxa_comissao && order.taxa_comissao > 0 
                        ? `-${formatCurrency(order.taxa_comissao)}` 
                        : '-'}
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
                    <p className="text-xs text-muted-foreground">Custo Frete</p>
                    <p className="font-medium text-red-600">
                      {order.custo_frete && order.custo_frete > 0 
                        ? `-${formatCurrency(order.custo_frete)}` 
                        : '-'}
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground">Valor Base</p>
                    <p className="font-medium">{formatCurrency(order.valor_base)}</p>
                  </div>
                </div>
              </div>

              {/* Taxes - Always show */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Tributos</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground">Total ICMS</p>
                    <p className="font-medium">{formatCurrency(order.total_icms)}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground">Total IPI</p>
                    <p className="font-medium">{formatCurrency(order.total_ipi)}</p>
                  </div>
                </div>
              </div>

              {/* Invoice - Always show */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground">Nota Fiscal Vinculada</p>
                  <p className="font-medium">{order.nota_fiscal_id ? `ID: ${order.nota_fiscal_id}` : '-'}</p>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground">ID Categoria</p>
                  <p className="font-medium">{displayValue(order.categoria_id)}</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
