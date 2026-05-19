import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone, Mail, MapPin, Cake, Building2, ShoppingBag,
  Package, ChevronDown, ChevronUp, Copy, MessageCircle, Star, Calendar,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BlingClientTimeline } from "./BlingClientTimeline";
import { ClientLoyaltyPanel } from "./ClientLoyaltyPanel";
import type { Tables } from "@/integrations/supabase/types";

interface BlingClientDetailsDialogProps {
  client: Tables<"bling_customers"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RFM_COLORS: Record<string, string> = {
  Champions: "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Loyal Customers": "bg-green-100 text-green-800 border-green-300",
  "Potential Loyalist": "bg-blue-100 text-blue-800 border-blue-300",
  "At Risk": "bg-orange-100 text-orange-800 border-orange-300",
  "Cant Lose Them": "bg-red-100 text-red-800 border-red-300",
};

const BlingClientDetailsDialog = ({ client, open, onOpenChange }: BlingClientDetailsDialogProps) => {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: rfm } = useQuery({
    queryKey: ["bling-client-rfm", client?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_rfm_snapshots")
        .select("segment_name")
        .eq("customer_id", client!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!client?.id && open,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["bling-client-orders", client?.bling_id, client?.integration_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bling_orders")
        .select("id, numero, data_criacao, situacao_nome, valor_total, valor_frete, valor_desconto, forma_pagamento, forma_envio")
        .eq("integration_id", client!.integration_id)
        .eq("cliente_id", client!.bling_id)
        .order("data_criacao", { ascending: false });
      return data || [];
    },
    enabled: !!client?.bling_id && !!client?.integration_id && open,
  });

  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["bling-order-items", expandedOrderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bling_order_items")
        .select("id, produto_nome, sku, quantidade, valor_unitario, valor_total")
        .eq("order_id", expandedOrderId!);
      return data || [];
    },
    enabled: !!expandedOrderId,
  });

  if (!client) return null;

  const fmt = (v: number | null) =>
    v == null ? "-" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const fmtDate = (d: string | null) => {
    if (!d) return null;
    try { return format(parseISO(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return null; }
  };
  const initials = (name: string | null) =>
    name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "??";

  const phone = client.celular || client.telefone || null;
  const endereco = (client.endereco as any)?.geral || (client.endereco as any) || null;
  const rfmColor = rfm?.segment_name ? (RFM_COLORS[rfm.segment_name] || "bg-muted text-muted-foreground") : "";
  const customerKey = phone || client.nome || "";
  const integrationId = client.integration_id || "";
  const totalSpent = orders?.reduce((s, o) => s + (o.valor_total || 0), 0) || 0;

  const copy = (text: string, label: string) =>
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} copiado` }));

  const openWhatsApp = () => {
    const p = (phone || "").replace(/\D/g, "");
    if (p) window.open(`https://wa.me/55${p}`, "_blank");
  };

  const getStatusVariant = (s: string | null) => {
    if (!s) return "secondary";
    const sl = s.toLowerCase();
    if (sl.includes("pago") || sl.includes("aprovado") || sl.includes("entregue") || sl.includes("atendido")) return "default";
    if (sl.includes("cancelado") || sl.includes("recusado")) return "destructive";
    return "secondary";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg shrink-0">
              {initials(client.nome)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-semibold">{client.nome || "Sem nome"}</p>
                {rfm?.segment_name && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rfmColor}`}>
                    {rfm.segment_name}
                  </span>
                )}
              </div>
              {client.fantasia && <p className="text-sm text-muted-foreground font-normal">{client.fantasia}</p>}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap -mt-1">
          {phone && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => copy(phone, "Telefone")}>
                <Copy className="h-3 w-3" /> {phone}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openWhatsApp}>
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </Button>
            </>
          )}
          {client.email && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => copy(client.email!, "E-mail")}>
              <Copy className="h-3 w-3" /> {client.email.length > 24 ? client.email.slice(0, 24) + "…" : client.email}
            </Button>
          )}
        </div>

        <Tabs defaultValue="perfil" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="pontos"><Star className="h-3.5 w-3.5 mr-1 text-yellow-500" />Pontos</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-3 pr-2">
            {/* ── PERFIL ── */}
            <TabsContent value="perfil" className="mt-0 space-y-4">
              {/* Resumo */}
              {orders && orders.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Total de Vendas</p>
                      <p className="text-lg font-bold">{orders.length}</p>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">Valor Total</p>
                      <p className="text-lg font-bold text-green-600">{fmt(totalSpent)}</p>
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Contato */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contato</h4>
                <div className="grid gap-1.5 text-sm">
                  {client.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4 shrink-0" /><a href={`mailto:${client.email}`} className="hover:text-foreground truncate">{client.email}</a></div>}
                  {client.celular && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4 shrink-0" /><span>{client.celular}</span><Badge variant="secondary" className="text-xs">Celular</Badge></div>}
                  {client.telefone && client.telefone !== client.celular && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4 shrink-0" /><span>{client.telefone}</span><Badge variant="outline" className="text-xs">Fixo</Badge></div>}
                  {!client.email && !client.celular && !client.telefone && <p className="text-muted-foreground/70 text-xs">Nenhuma informação de contato</p>}
                </div>
              </div>
              <Separator />

              {/* Dados pessoais */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Dados Pessoais</h4>
                <div className="grid gap-1.5 text-sm">
                  {client.cpf_cnpj && <div className="flex justify-between"><span className="text-muted-foreground">{client.tipo_pessoa === "J" ? "CNPJ" : "CPF"}</span><span className="font-mono">{client.cpf_cnpj}</span></div>}
                  {client.data_nascimento && <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Cake className="h-3 w-3" />Nascimento</span><span>{fmtDate(client.data_nascimento)?.split(" ")[0]}</span></div>}
                  {client.sexo && <div className="flex justify-between"><span className="text-muted-foreground">Gênero</span><span>{client.sexo === "M" ? "Masculino" : client.sexo === "F" ? "Feminino" : client.sexo}</span></div>}
                  {client.situacao && <div className="flex justify-between"><span className="text-muted-foreground">Situação</span><Badge variant={client.situacao === "A" ? "default" : "secondary"}>{client.situacao === "A" ? "Ativo" : "Inativo"}</Badge></div>}
                </div>
              </div>

              {/* Endereço */}
              {endereco && (endereco.endereco || endereco.municipio) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Endereço</h4>
                    <div className="text-sm space-y-1 bg-muted/30 p-3 rounded-lg">
                      {endereco.endereco && <p>{endereco.endereco}{endereco.numero ? `, nº ${endereco.numero}` : ""}</p>}
                      {endereco.bairro && <p className="text-muted-foreground">{endereco.bairro}</p>}
                      {(endereco.municipio || endereco.uf) && <p className="text-muted-foreground">{endereco.municipio}{endereco.uf ? ` - ${endereco.uf}` : ""}</p>}
                      {endereco.cep && <p className="text-muted-foreground font-mono">{endereco.cep}</p>}
                    </div>
                  </div>
                </>
              )}
              <Separator />

              {/* Pedidos */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><ShoppingBag className="h-3.5 w-3.5" /> Vendas ({orders?.length || 0})</h4>
                {ordersLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : orders && orders.length > 0 ? (
                  <div className="space-y-2">
                    {orders.map((order) => (
                      <div key={order.id} className="border border-border/50 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                          <div>
                            <p className="font-medium text-sm">Pedido #{order.numero}</p>
                            <p className="text-xs text-muted-foreground">{fmtDate(order.data_criacao)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <Badge variant={getStatusVariant(order.situacao_nome) as any} className="text-xs">{order.situacao_nome || "Sem status"}</Badge>
                              <p className="text-sm font-semibold mt-1">{fmt(order.valor_total)}</p>
                            </div>
                            {expandedOrderId === order.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                        {expandedOrderId === order.id && (
                          <div className="p-3 border-t border-border/50">
                            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground"><Package className="h-3.5 w-3.5" /><span>Produtos</span></div>
                            {itemsLoading ? <Skeleton className="h-8 w-full" /> : orderItems && orderItems.length > 0 ? (
                              <div className="space-y-1.5">
                                {orderItems.map(item => (
                                  <div key={item.id} className="flex justify-between py-1.5 px-2 bg-muted/20 rounded text-sm">
                                    <div className="min-w-0"><p className="font-medium truncate">{item.produto_nome}</p><p className="text-xs text-muted-foreground">{item.sku && `SKU: ${item.sku} · `}Qtd: {item.quantidade} × {fmt(item.valor_unitario)}</p></div>
                                    <span className="font-medium ml-3">{fmt(item.valor_total)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-xs text-muted-foreground">Sem produtos</p>}
                            <div className="mt-2 pt-2 border-t border-border/30 grid grid-cols-2 gap-1 text-xs">
                              {order.forma_pagamento && <div><span className="text-muted-foreground">Pagamento: </span>{order.forma_pagamento}</div>}
                              {order.forma_envio && <div><span className="text-muted-foreground">Envio: </span>{order.forma_envio}</div>}
                              {order.valor_frete != null && order.valor_frete > 0 && <div><span className="text-muted-foreground">Frete: </span>{fmt(order.valor_frete)}</div>}
                              {order.valor_desconto != null && order.valor_desconto > 0 && <div><span className="text-muted-foreground">Desconto: </span><span className="text-green-600">-{fmt(order.valor_desconto)}</span></div>}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground/70">Nenhuma venda encontrada</p>}
              </div>

              <Separator />
              <div className="space-y-1 text-xs text-muted-foreground">
                <h4 className="flex items-center gap-1.5 font-semibold"><Calendar className="h-3.5 w-3.5" /> Sistema</h4>
                {client.data_inclusao && <div className="flex justify-between"><span>Cadastrado em</span><span>{fmtDate(client.data_inclusao)}</span></div>}
                {client.synced_at && <div className="flex justify-between"><span>Sincronizado em</span><span>{fmtDate(client.synced_at)}</span></div>}
              </div>
            </TabsContent>

            {/* ── TIMELINE ── */}
            <TabsContent value="timeline" className="mt-0">
              <BlingClientTimeline client={client} />
            </TabsContent>

            {/* ── PONTOS ── */}
            <TabsContent value="pontos" className="mt-0">
              <ClientLoyaltyPanel integrationId={integrationId} customerExternalId={customerKey} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default BlingClientDetailsDialog;
