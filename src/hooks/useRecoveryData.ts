import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RecoveryKind } from "@/lib/recovery";

export interface FunnelRow {
  kind: RecoveryKind; captured: number; with_contact: number; contacted: number; opened: number; clicked: number;
  recovered_ours: number; recovered_other: number; revenue_ours: number; whatsapp_sent: number;
}

/** Funil da recuperação (capturados → contatados → abriram → clicaram → recuperados) por tipo. */
export function useRecoveryFunnel(days: number) {
  const { tenantId } = useAuth();
  return useQuery<Record<RecoveryKind, FunnelRow>>({
    queryKey: ["recovery-funnel", tenantId, days],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_abandonment_funnel", { p_tenant_id: tenantId!, p_days: days });
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.kind, { ...r, revenue_ours: Number(r.revenue_ours) } as FunnelRow])) as Record<RecoveryKind, FunnelRow>;
    },
  });
}

export interface CapturedRow {
  id: string; kind: RecoveryKind; value: number; items: { name: string | null; quantity: number }[];
  recipient_email: string | null; recipient_name: string | null; recipient_phone: string | null;
  event_at: string | null; flow_status: string; recovered_via: string | null; recovered_total: number | null; li_status: string | null;
  sends: { step_id: string; channel: string; status: string; reason: string | null; sent_at: string | null }[];
  /** Por que o fluxo NÃO vai atender este abandono (mesmas regras do abandonment-processor); null = pode atender. */
  hold: string | null;
}

interface FlowRule { kind: string; enabled: boolean; enabled_at: string | null; max_event_age_hours: number; min_value: number }

/** Espelha o filtro de candidatos do abandonment-processor (index.ts): ligado, depois de enabled_at, idade, saiu da loja, contato, valor. */
function holdReason(r: { kind: string; event_at: string | null; gone_at: string | null; value: number; recipient_email: string | null; recipient_phone: string | null; flow_status: string }, hasSends: boolean, flow: FlowRule | undefined): string | null {
  if (r.flow_status !== "open") return null;
  if (!flow || !flow.enabled) return "Sem fluxo ligado para este tipo";
  if (!r.event_at) return null;
  const at = Date.parse(r.event_at);
  if (flow.enabled_at && at < Date.parse(flow.enabled_at)) return "Abandono anterior à ativação do fluxo";
  if (!r.recipient_email && !r.recipient_phone) return "Sem e-mail nem telefone";
  if (r.gone_at) return "Carrinho saiu da loja (comprou ou esvaziou)";
  if (r.kind !== "browse" && r.kind !== "welcome" && flow.min_value > 0 && r.value < flow.min_value) return "Abaixo do valor mínimo do fluxo";
  if (!hasSends && Date.now() - at > flow.max_event_age_hours * 3_600_000) return "Antigo demais para o fluxo";
  return null;
}

/** Abandonos capturados da loja (mais recentes primeiro) com o que já foi enviado a cada um. */
export function useCapturedAbandonments(kind: RecoveryKind | "all", limit = 100) {
  const { tenantId } = useAuth();
  return useQuery<CapturedRow[]>({
    queryKey: ["recovery-captured", tenantId, kind, limit],
    enabled: !!tenantId,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase.from("li_abandonment_campaigns")
        .select("id, kind, value, items, recipient_email, recipient_name, recipient_phone, event_at, gone_at, flow_status, recovered_via, recovered_total, li_status")
        .eq("tenant_id", tenantId!).order("event_at", { ascending: false }).limit(limit);
      if (kind !== "all") q = q.eq("kind", kind);
      const [{ data, error }, { data: flows }] = await Promise.all([
        q,
        supabase.from("abandonment_flows").select("kind, enabled, enabled_at, max_event_age_hours, min_value").eq("tenant_id", tenantId!),
      ]);
      if (error) throw error;
      const flowByKind = new Map((flows ?? []).map((f) => [f.kind, { ...f, min_value: Number(f.min_value) || 0 } as FlowRule]));
      const ids = (data ?? []).map((r) => r.id);
      const sends = ids.length
        ? (await supabase.from("abandonment_flow_sends").select("abandonment_id, step_id, channel, status, reason, sent_at").in("abandonment_id", ids)).data ?? []
        : [];
      return (data ?? []).map((r) => {
        const own = sends.filter((s) => s.abandonment_id === r.id);
        const value = Number(r.value);
        return {
          ...r, kind: r.kind as RecoveryKind, value, items: (Array.isArray(r.items) ? r.items : []) as CapturedRow["items"],
          sends: own, hold: holdReason({ ...r, value }, own.length > 0, flowByKind.get(r.kind)),
        };
      }) as CapturedRow[];
    },
  });
}

export interface NativeState { kind: RecoveryKind; on: boolean; automationId: number | null; title: string | null; delays: number[] }
export interface NativeStatus {
  native: NativeState[]; storeId: number | null; subjectLlm: boolean; nativeWhatsApp: boolean;
  window: { start: string | null; end: string | null } | null;
  webhooks: { registered: boolean; error: string | null }; storeUrl: string | null;
  history: { toggle_key: string; from_state: boolean | null; to_state: boolean; created_at: string }[];
}

/** Estado REAL das automações nativas da Loja Integrada (lido da loja a cada abertura). */
export function useNativeStatus() {
  const { tenantId } = useAuth();
  return useQuery<NativeStatus>({
    queryKey: ["li-native", tenantId],
    enabled: !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("li-marketing", { body: { action: "status" } });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Não consegui ler a Loja Integrada");
      return data as NativeStatus;
    },
  });
}

export function useToggleNative() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async (v: { kind: RecoveryKind; enabled: boolean; acknowledge?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("li-marketing", { body: { action: "toggle", ...v } });
      // a função devolve 409 com needsAck quando falta o nosso fluxo cobrir: o corpo vem em error.context
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json().catch((): null => null) : null;
        if (body?.needsAck) throw Object.assign(new Error(body.error), { needsAck: true });
        throw new Error(body?.error || error.message);
      }
      if (!data?.success) throw new Error(data?.error || "A loja não aplicou a mudança");
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["li-native", tenantId] }); },
    onError: (e: Error & { needsAck?: boolean }) => { if (!e.needsAck) toast.error(e.message); },
  });
}
