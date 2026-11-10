import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const STATEMENT_PAGE_SIZE = 25;

export const CASHBACK_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando liberação",
  available: "Disponível",
  used: "Usado",
  expired: "Vencido",
  cancelled: "Cancelado",
  skipped: "Ignorado",
  failed: "Falhou",
};

export function useCashbackTotals(enabled: boolean) {
  return useQuery({
    queryKey: ["cashback-totals"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cashback_totals");
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.display_status, { credits: Number(r.credits), amount: Number(r.amount) }]));
    },
  });
}

export function useCashbackStatement(enabled: boolean, search: string, status: string, page: number) {
  return useQuery({
    queryKey: ["cashback-statement", search, status, page],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cashback_statement", {
        p_search: search.trim() || undefined,
        p_status: status || undefined,
        p_limit: STATEMENT_PAGE_SIZE,
        p_offset: page * STATEMENT_PAGE_SIZE,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCashbackExclusions(enabled: boolean) {
  const qc = useQueryClient();
  const { tenant } = useAuth();
  const list = useQuery({
    queryKey: ["cashback-exclusions"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("cashback_exclusions").select("id, name, email, phone, reason, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async (v: { name: string; email: string; phone: string; reason: string }) => {
      if (!tenant?.id) throw new Error("Sem loja ativa");
      const { error } = await supabase.from("cashback_exclusions").insert({
        tenant_id: tenant.id, name: v.name.trim() || null, email: v.email.trim().toLowerCase() || null,
        phone: v.phone.trim() || null, reason: v.reason.trim() || null,
        customer_key: "", // preenchida pelo gatilho do banco (e-mail minúsculo, senão telefone com 55)
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashback-exclusions"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cashback_exclusions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashback-exclusions"] }),
  });
  return { list, add, remove };
}
