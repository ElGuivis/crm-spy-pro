import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReactivationExecution {
  id: string; created_at: string | null; customer_name: string | null; customer_phone: string | null; status: string | null;
  cycle_step: number | null; attempt_no: number | null; coupon_code: string | null; days_inactive: number | null; error_message: string | null;
}
export interface ReactivationResults { sent: number; unreachable: number; failed: number; returned: number; revenue: number }

/** Últimos envios da reativação e o resultado (quem voltou a comprar em até 30 dias). Atualiza a cada minuto com a janela aberta. */
export function useReactivationHistory(configIds: string[], enabled: boolean) {
  const key = configIds.join(",");
  const executions = useQuery({
    queryKey: ["reactivation-executions", key], enabled: enabled && configIds.length > 0, refetchInterval: 60_000, staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("reactivation_executions")
        .select("id, created_at, customer_name, customer_phone, status, cycle_step, attempt_no, coupon_code, days_inactive, error_message")
        .in("config_id", configIds).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as ReactivationExecution[];
    },
  });
  const results = useQuery({
    queryKey: ["reactivation-results", key], enabled: enabled && configIds.length > 0, refetchInterval: 5 * 60_000, staleTime: 60_000,
    queryFn: async (): Promise<ReactivationResults> => {
      const sum: ReactivationResults = { sent: 0, unreachable: 0, failed: 0, returned: 0, revenue: 0 };
      for (const id of configIds) {
        const { data, error } = await supabase.rpc("get_reactivation_results", { p_config_id: id });
        if (error) throw error;
        const r = data?.[0];
        if (r) { sum.sent += Number(r.sent); sum.unreachable += Number(r.unreachable); sum.failed += Number(r.failed); sum.returned += Number(r.returned); sum.revenue += Number(r.revenue); }
      }
      return sum;
    },
  });
  return { executions, results };
}
