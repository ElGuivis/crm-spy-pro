import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CustomerCommunication {
  suppression: { reason: string; source: string | null; created_at: string } | null;
  phone_blocked: boolean;
  newsletter: { is_baseline: boolean; first_seen_at: string; removed: boolean } | null;
  touches: { purpose: string; channel: string; module_ref: string | null; sent_at: string }[];
  campaigns: { campaign_name: string | null; subject: string | null; flow_kind: string | null; status: string | null; sent_at: string | null }[];
  coupons: { coupon_code: string; origin_type: string | null; created_at: string; expires_at: string | null; used_at: string | null; used_order_value: number | null }[];
}

/** Tudo que uma pessoa recebeu e usou (envios, campanhas, cupons) e se pode receber, ligado pela chave única (e-mail/telefone). */
export function useCustomerCommunication(email: string | null | undefined, phone: string | null | undefined, enabled: boolean) {
  const { tenantId } = useAuth();
  return useQuery<CustomerCommunication>({
    queryKey: ["customer-communication", tenantId, email, phone], enabled: enabled && !!tenantId && !!(email || phone),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_communication", { p_tenant_id: tenantId!, p_email: email ?? "", p_phone: phone ?? undefined, p_limit: 30 });
      if (error) throw error;
      return data as unknown as CustomerCommunication;
    },
  });
}

export interface MessagePerformanceRow {
  purpose: string; touches: number; people: number; email_touches: number; whatsapp_touches: number;
  coupons_issued: number; coupons_redeemed: number; revenue: number;
}

/** Retorno por finalidade: envios x cupons emitidos/usados x receita, nos últimos dias. */
export function useMessagePerformance(days: number) {
  const { tenantId } = useAuth();
  return useQuery<MessagePerformanceRow[]>({
    queryKey: ["message-performance", tenantId, days], enabled: !!tenantId, refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_message_performance", { p_tenant_id: tenantId!, p_days: days });
      if (error) throw error;
      return (data ?? []) as MessagePerformanceRow[];
    },
  });
}
