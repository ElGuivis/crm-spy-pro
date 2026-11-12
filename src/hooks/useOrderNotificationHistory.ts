import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NotificationExecution {
  id: string; created_at: string | null; order_number: string | null; status_name: string | null; channel: string | null;
  status: string | null; kind: string; error_message: string | null; message_sent: string | null;
  customer_phone: string | null; customer_email: string | null;
}

/** Últimos envios das notificações de pedido (um registro por pedido, canal e tipo). Atualiza a cada minuto enquanto a tela está aberta. */
export function useOrderNotificationHistory(enabled: boolean) {
  return useQuery({
    queryKey: ["order-notification-history"], enabled, refetchInterval: 60_000, staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_notification_executions")
        .select("id, created_at, order_number, status_name, channel, status, kind, error_message, message_sent, customer_phone, customer_email")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as NotificationExecution[];
    },
  });
}
