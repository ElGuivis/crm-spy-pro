import { Conversation, Contact } from "@/hooks/useAtendimentos";
import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import { TagEditor } from "./TagEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Phone, Package, Truck, ShoppingCart, X, Tag, Clock, MessageSquare, CalendarDays, Bot, UserCheck, Pin, StickyNote } from "lucide-react";
import { PinnedNotes } from "./PinnedNotes";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CustomerPanelProps {
  conversation: Conversation;
  onClose: () => void;
  integrationId?: string | null;
}

function TimelineEvent({ icon: Icon, label, time, color }: { icon: any; label: string; time: string; color: string }) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5", color)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{time}</p>
      </div>
    </div>
  );
}

export function CustomerPanel({ conversation, onClose, integrationId }: CustomerPanelProps) {
  const contact = conversation.contact;
  const rawPhone = contact?.phone || '';
  const contactMeta = (contact as any)?.metadata as Record<string, string> | null;

  const isLid = rawPhone.includes('@lid');
  const realPhone = isLid
    ? (contactMeta?.real_phone || contactMeta?.lid_phone || null)
    : rawPhone;
  const phone = realPhone || (!isLid ? rawPhone : null);

  const displayPhone = phone
    ? (phone.startsWith('55') && phone.length >= 12 ? phone.slice(2) : phone)
    : isLid ? '(aguardando número)' : 'Sem telefone';

  const { liOrders, blingOrders, shipments, isLoading } = useCustomerOrders(phone || undefined, undefined, integrationId);

  const allOrders = [
    ...liOrders.map((o: any) => ({
      id: o.id, number: o.order_number, status: o.status_name,
      total: o.totals_json?.total,
      date: o.created_at_remote, customer: o.raw_json?.cliente?.nome, source: 'LI',
    })),
    ...blingOrders.map((o: any) => ({
      id: o.id, number: o.numero, status: o.situacao_nome, total: o.valor_total,
      date: o.data_criacao, customer: o.cliente_nome, source: 'Bling',
    })),
  ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  // Build timeline events
  const timelineEvents = [
    ...(conversation.created_at ? [{
      icon: MessageSquare,
      label: 'Conversa criada',
      time: formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true, locale: ptBR }),
      color: 'bg-primary/10 text-primary',
    }] : []),
    ...(conversation.handoff_mode ? [{
      icon: UserCheck,
      label: 'Atendimento humano ativo',
      time: conversation.last_inbound_at 
        ? formatDistanceToNow(new Date(conversation.last_inbound_at), { addSuffix: true, locale: ptBR })
        : 'agora',
      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    }] : []),
    ...(conversation.status === 'closed' ? [{
      icon: X,
      label: 'Conversa encerrada',
      time: 'encerrada',
      color: 'bg-muted text-muted-foreground',
    }] : []),
    ...allOrders.slice(0, 3).map(o => ({
      icon: ShoppingCart,
      label: `Pedido #${o.number} — ${o.status || 'pendente'}`,
      time: o.date ? formatDistanceToNow(new Date(o.date), { addSuffix: true, locale: ptBR }) : '',
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    })),
    ...shipments.slice(0, 2).map((s: any) => ({
      icon: Truck,
      label: `Envio ${s.tracking_code || ''} — ${s.status}`,
      time: s.created_at ? formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: ptBR }) : '',
      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    })),
  ];

  // Summary stats
  const totalSpent = allOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full"
    >
      {/* Header with contact info */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Painel do Cliente</h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
            {(contact?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground truncate">
              {contact?.name || 'Desconhecido'}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span className={isLid && !realPhone ? 'italic' : ''}>
                {displayPhone}
              </span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        {allOrders.length > 0 && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50">
            <div className="text-center flex-1">
              <p className="text-lg font-semibold text-foreground">{allOrders.length}</p>
              <p className="text-[10px] text-muted-foreground">Pedidos</p>
            </div>
            <div className="w-px h-8 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-lg font-semibold text-foreground">
                R$ {totalSpent.toFixed(0)}
              </p>
              <p className="text-[10px] text-muted-foreground">Total gasto</p>
            </div>
            <div className="w-px h-8 bg-border/50" />
            <div className="text-center flex-1">
              <p className="text-lg font-semibold text-foreground">{shipments.length}</p>
              <p className="text-[10px] text-muted-foreground">Envios</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="timeline" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-2 h-9 shrink-0">
          <TabsTrigger value="timeline" className="text-xs h-7 data-[state=active]:bg-muted">
            <Clock className="h-3 w-3 mr-1" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="contact" className="text-xs h-7 data-[state=active]:bg-muted">
            <Tag className="h-3 w-3 mr-1" />
            Contato
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs h-7 data-[state=active]:bg-muted">
            <ShoppingCart className="h-3 w-3 mr-1" />
            Pedidos
            {allOrders.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">{allOrders.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="shipping" className="text-xs h-7 data-[state=active]:bg-muted">
            <Truck className="h-3 w-3 mr-1" />
            Envios
          </TabsTrigger>
        </TabsList>

        {/* Timeline tab */}
        <TabsContent value="timeline" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {timelineEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum evento registrado</p>
              ) : (
                timelineEvents.map((event, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <TimelineEvent {...event} />
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Contact tab */}
        <TabsContent value="contact" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Tags</h4>
                <TagEditor conversationId={conversation.id} />
              </div>
              <Separator />
              <PinnedNotes conversationId={conversation.id} />
              <Separator />
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>Status: <span className="text-foreground capitalize">{conversation.status}</span></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" />
                  <span>Criada: {format(new Date(conversation.created_at), 'dd/MM/yyyy HH:mm')}</span>
                </div>
                {conversation.last_inbound_at && (
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-3 w-3" />
                    <span>Última msg: {formatDistanceToNow(new Date(conversation.last_inbound_at), { addSuffix: true, locale: ptBR })}</span>
                  </div>
                )}
                {conversation.assigned_to && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    <span>Atribuído a um agente</span>
                  </div>
                )}
                {conversation.ai_enabled && (
                  <div className="flex items-center gap-1.5">
                    <Bot className="h-3 w-3" />
                    <span>IA ativa{conversation.bot_state_json?.stage ? ` (${conversation.bot_state_json.stage})` : ''}</span>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Orders tab */}
        <TabsContent value="orders" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-lg border p-2.5 animate-pulse space-y-1.5">
                      <div className="h-3.5 w-20 rounded bg-muted shimmer" />
                      <div className="h-3 w-32 rounded bg-muted shimmer" />
                    </div>
                  ))}
                </div>
              ) : allOrders.length === 0 ? (
                <div className="text-center py-6">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Nenhum pedido encontrado</p>
                </div>
              ) : (
                allOrders.map((order, i) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-lg border p-2.5 space-y-1 hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">#{order.number}</span>
                      <Badge variant="outline" className="text-[10px] h-5">{order.source}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{order.status || '—'}</span>
                      <span className="font-medium text-foreground">{order.total ? `R$ ${Number(order.total).toFixed(2)}` : '—'}</span>
                    </div>
                    {order.date && (
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(order.date), 'dd/MM/yyyy')}
                      </p>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Shipping tab */}
        <TabsContent value="shipping" className="flex-1 m-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {shipments.length === 0 ? (
                <div className="text-center py-6">
                  <Truck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Nenhum envio encontrado</p>
                </div>
              ) : (
                shipments.map((s: any, i: number) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="rounded-lg border p-2.5 space-y-1 hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{s.tracking_code || 'Sem rastreio'}</span>
                      <Badge variant="secondary" className="text-[10px] h-5">{s.status}</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{s.service_name}</p>
                    {s.receiver_name && <p className="text-[10px] text-muted-foreground">{s.receiver_name}</p>}
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
