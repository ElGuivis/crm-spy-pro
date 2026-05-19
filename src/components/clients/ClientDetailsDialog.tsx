import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone, Mail, MapPin, User, Calendar, Building2,
  ShoppingBag, Package, ChevronDown, ChevronUp, Copy, MessageCircle, Star,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ClientTimeline } from "./ClientTimeline";
import { ClientLoyaltyPanel } from "./ClientLoyaltyPanel";
import type { Tables } from "@/integrations/supabase/types";

interface ClientDetailsDialogProps {
  client: Tables<"li_customers"> | null;
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

const ClientDetailsDialog = ({ client, open, onOpenChange }: ClientDetailsDialogProps) => {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: rfm } = useQuery({
    queryKey: ["client-rfm", client?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_rfm_snapshots")
        .select("segment_name, rfm_score")
        .eq("customer_id", client!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!client?.id && open,
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["client-orders", client?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("li_orders")
        .select("id, order_number, status_name, created_at_remote, totals_json, payment_json, shipping_json")
        .eq("customer_id", client!.id)
        .order("created_at_remote", { ascending: false });
      return data || [];
    },
    enabled: !!client?.id && open,
  });

  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["order-items", expandedOrderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("li_order_items")
        .select("id, name, sku, qty, price")
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

  const rawData = client.raw_json as any;
  const dataNascimento = rawData?.data_nascimento;
  const sexo = rawData?.sexo;
  const tipo = rawData?.tipo;
  const aceitaNewsletter = rawData?.aceita_newsletter;
  const dataCriacao = rawData?.data_criacao;

  let address = client.address_json as any;
  if (!address || (!address.endereco && !address.cidade)) {
    const end = (rawData?.enderecos || []);
    address = end.find((e: any) => e.principal) || end[0] || null;
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} copiado` }));
  };

  const openWhatsApp = () => {
    const phone = (client.phone || "").replace(/\D/g, "");
    if (!phone) return;
    window.open(`https://wa.me/55${phone}`, "_blank");
  };

  const getStatusVariant = (status: string | null) => {
    if (!status) return "secondary";
    const s = status.toLowerCase();
    if (s.includes("pago") || s.includes("aprovado") || s.includes("entregue")) return "default";
    if (s.includes("cancelado") || s.includes("recusado")) return "destructive";
    return "secondary";
  };

  const customerKey = client.phone || client.name || "";
  const integrationId = client.integration_id || "";
  const rfmColor = rfm?.segment_name ? (RFM_COLORS[rfm.segment_name] || "bg-muted text-muted-foreground") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full gradient-whatsapp flex items-center justify-center text-primary-foreground font-semibold text-lg shrink-0">
              {initials(client.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-semibold">{client.name || "Sem nome"}</p>
                {rfm?.segment_name && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rfmColor}`}>
                    {rfm.segment_name}
                  </span>
                )}
              </div>
              {client.doc && (
                <p className="text-sm text-muted-foreground font-normal font-mono">{client.doc}</p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap px-0 -mt-1">
          {client.phone && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => copyToClipboard(client.phone!, "Telefone")}>
                <Copy className="h-3 w-3" /> {client.phone}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openWhatsApp}>
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </Button>
            </>
          )}
          {client.email && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
              onClick={() => copyToClipboard(client.email!, "E-mail")}>
              <Copy className="h-3 w-3" /> {client.email.length > 24 ? client.email.slice(0, 24) + "…" : client.email}
            </Button>
          )}
        </div>

        <Tabs defaultValue="perfil" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="pontos">
              <Star className="h-3.5 w-3.5 mr-1 text-yellow-500" />
              Pontos
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-3 pr-2">
            {/* ── PERFIL ── */}
            <TabsContent value="perfil" className="mt-0 space-y-4">
              {/* Contato */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> Contato
                </h4>
                <div className="grid gap-1.5 text-sm">
                  {client.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" />
                      <a href={`mailto:${client.email}`} className="hover:text-foreground truncate">{client.email}</a>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0" /><span>{client.phone}</span>
                    </div>
                  )}
                  {!client.email && !client.phone && (
                    <p className="text-muted-foreground/70 text-xs">Nenhuma informação de contato</p>
                  )}
                </div>
              </div>
              <Separator />

              {/* Dados pessoais */}
              {(client.doc || dataNascimento || sexo || tipo || aceitaNewsletter !== undefined) && (
                <>
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" /> Dados Pessoais
                    </h4>
                    <div className="grid gap-1.5 text-sm">
                      {client.doc && <div className="flex justify-between"><span className="text-muted-foreground">CPF/CNPJ</span><span className="font-mono">{client.doc}</span></div>}
                      {tipo && <div className="flex justify-between"><span className="text-muted-foreground">Tipo</span><span>{tipo === "PF" ? "Pessoa Física" : tipo === "PJ" ? "Pessoa Jurídica" : tipo}</span></div>}
                      {dataNascimento && <div className="flex justify-between"><span className="text-muted-foreground">Nascimento</span><span>{fmtDate(dataNascimento)?.split(" ")[0]}</span></div>}
                      {sexo && <div className="flex justify-between"><span className="text-muted-foreground">Gênero</span><span>{sexo === "M" ? "Masculino" : sexo === "F" ? "Feminino" : sexo}</span></div>}
                      {aceitaNewsletter !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Newsletter</span><span>{aceitaNewsletter ? "Aceita" : "Não aceita"}</span></div>}
                      {dataCriacao && <div className="flex justify-between"><span className="text-muted-foreground">Cliente desde</span><span>{fmtDate(dataCriacao)}</span></div>}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Endereço */}
              {address && (address.endereco || address.cidade) && (
                <>
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> Endereço
                    </h4>
                    <div className="text-sm space-y-1 bg-muted/30 p-3 rounded-lg">
                      {address.endereco && <p>{address.endereco}{address.numero ? `, nº ${address.numero}` : ""}</p>}
                      {address.bairro && <p className="text-muted-foreground">{address.bairro}</p>}
                      {(address.cidade || address.estado) && <p className="text-muted-foreground">{address.cidade}{address.estado ? ` - ${address.estado}` : ""}</p>}
                      {address.cep && <p className="text-muted-foreground font-mono">{address.cep}</p>}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Pedidos */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5" /> Vendas ({orders?.length || 0})
                </h4>
                {ordersLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : orders && orders.length > 0 ? (
                  <div className="space-y-2">
                    {orders.map((order) => {
                      const totals = order.totals_json as any;
                      return (
                        <div key={order.id} className="border border-border/50 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                            <div>
                              <p className="font-medium text-sm">Pedido #{order.order_number}</p>
                              <p className="text-xs text-muted-foreground">{fmtDate(order.created_at_remote)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <Badge variant={getStatusVariant(order.status_name) as any} className="text-xs">{order.status_name || "Sem status"}</Badge>
                                <p className="text-sm font-semibold mt-1">{fmt(totals?.total)}</p>
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
                                      <div className="min-w-0"><p className="font-medium truncate">{item.name}</p><p className="text-xs text-muted-foreground">{item.sku && `SKU: ${item.sku} · `}Qtd: {item.qty} × {fmt(item.price)}</p></div>
                                      <span className="font-medium ml-3">{fmt((item.price || 0) * (item.qty || 1))}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : <p className="text-xs text-muted-foreground">Sem produtos</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-muted-foreground/70">Nenhuma venda encontrada</p>}
              </div>

              <Separator />
              <div className="space-y-1 text-xs text-muted-foreground">
                <h4 className="flex items-center gap-1.5 font-semibold"><Calendar className="h-3.5 w-3.5" /> Sistema</h4>
                <div className="flex justify-between"><span>Última atualização</span><span>{fmtDate(client.updated_at_local)}</span></div>
                <div className="flex justify-between"><span>ID LI</span><span className="font-mono">{client.loja_integrada_customer_id}</span></div>
              </div>
            </TabsContent>

            {/* ── TIMELINE ── */}
            <TabsContent value="timeline" className="mt-0">
              <ClientTimeline client={client} integrationId={integrationId} />
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

export default ClientDetailsDialog;
