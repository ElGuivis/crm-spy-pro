import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingBag, Star, Gift } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type TEvent = {
  id: string;
  date: Date;
  type: "order" | "loyalty_earn" | "loyalty_redeem";
  title: string;
  subtitle?: string;
  amount?: string;
};

interface BlingClientTimelineProps {
  client: Tables<"bling_customers">;
}

export function BlingClientTimeline({ client }: BlingClientTimelineProps) {
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const { data: orders = [] } = useQuery({
    queryKey: ["bling-client-orders-timeline", client.bling_id, client.integration_id],
    queryFn: async () => {
      if (!client.bling_id || !client.integration_id) return [];
      const { data } = await supabase
        .from("bling_orders")
        .select("id, numero, situacao_nome, data_criacao, valor_total")
        .eq("integration_id", client.integration_id)
        .eq("cliente_id", client.bling_id)
        .order("data_criacao", { ascending: false })
        .limit(30);
      return data || [];
    },
    enabled: !!client.bling_id && !!client.integration_id,
  });

  const customerKey = client.celular || client.telefone || client.nome || "";
  const { data: loyaltyRows = [] } = useQuery({
    queryKey: ["bling-client-loyalty-timeline", client.integration_id, customerKey],
    queryFn: async () => {
      if (!customerKey) return [];
      const { data } = await supabase
        .from("loyalty_points" as any)
        .select("id, points, type, description, created_at")
        .eq("integration_id", client.integration_id)
        .eq("customer_external_id", customerKey)
        .order("created_at", { ascending: false })
        .limit(30);
      return (data as any[]) || [];
    },
    enabled: !!customerKey && !!client.integration_id,
  });

  const events: TEvent[] = [
    ...orders.map((o) => ({
      id: `order-${o.id}`,
      date: new Date(o.data_criacao || ""),
      type: "order" as const,
      title: `Pedido #${o.numero}`,
      subtitle: o.situacao_nome || undefined,
      amount: o.valor_total ? fmt.format(o.valor_total) : undefined,
    })),
    ...loyaltyRows.map((l: any) => ({
      id: `loyalty-${l.id}`,
      date: new Date(l.created_at),
      type: l.type === "redeem" ? ("loyalty_redeem" as const) : ("loyalty_earn" as const),
      title: l.type === "redeem" ? "Resgate de pontos" : "Pontos creditados",
      subtitle: l.description || undefined,
      amount: l.type === "redeem" ? `-${Math.abs(l.points)} pts` : `+${l.points} pts`,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  if (events.length === 0) {
    return <div className="text-center py-10 text-muted-foreground text-sm">Nenhum evento registrado ainda.</div>;
  }

  const iconFor = (type: TEvent["type"]) => {
    if (type === "order") return <ShoppingBag className="h-3.5 w-3.5 text-white" />;
    if (type === "loyalty_earn") return <Star className="h-3.5 w-3.5 text-white" />;
    return <Gift className="h-3.5 w-3.5 text-white" />;
  };
  const bgFor = (type: TEvent["type"]) =>
    type === "order" ? "bg-blue-500" : type === "loyalty_earn" ? "bg-yellow-500" : "bg-purple-500";
  const amountColor = (type: TEvent["type"]) =>
    type === "loyalty_earn" ? "text-green-600" : type === "loyalty_redeem" ? "text-purple-600" : "";

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <div key={event.id} className="flex gap-3 pb-4 relative">
          {i < events.length - 1 && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
          <div className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center mt-0.5 ${bgFor(event.type)}`}>
            {iconFor(event.type)}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{event.title}</p>
                {event.subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.subtitle}</p>}
              </div>
              <div className="text-right shrink-0">
                {event.amount && <p className={`text-xs font-semibold ${amountColor(event.type)}`}>{event.amount}</p>}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {format(event.date, "dd/MM/yy", { locale: ptBR })}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
