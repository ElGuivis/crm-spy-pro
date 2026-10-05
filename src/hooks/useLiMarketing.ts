import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MarketingSettings { sync_unsubscribes: boolean; waitlist_alert: boolean }
const DEFAULTS: MarketingSettings = { sync_unsubscribes: true, waitlist_alert: true };

/** Preferências da integração de marketing com a Loja Integrada (padrão: descadastro em duas vias ligado). */
export function useMarketingSettings() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["li-marketing-settings", tenantId];
  const query = useQuery<MarketingSettings>({
    queryKey: key, enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("li_marketing_settings").select("sync_unsubscribes, waitlist_alert").eq("tenant_id", tenantId!).maybeSingle();
      if (error) throw error;
      return data ?? DEFAULTS;
    },
  });
  const save = useMutation({
    mutationFn: async (patch: Partial<MarketingSettings>) => {
      const { error } = await supabase.from("li_marketing_settings").upsert({ tenant_id: tenantId!, ...(query.data ?? DEFAULTS), ...patch }, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });
  return { settings: query.data ?? DEFAULTS, isLoading: query.isLoading, save };
}

export interface NewsletterStats {
  total: number; baseline: number; fresh: number; customers: number; leads: number; removed: number;
  lastScanAt: string | null; scanning: boolean; baselineDone: boolean; outboxPending: number; outboxFailed: number;
}

/** Números da newsletter da loja: quantos inscritos (histórico × novos), quantos já são clientes e o estado da sincronização. */
export function useNewsletterStats() {
  const { tenantId } = useAuth();
  return useQuery<NewsletterStats>({
    queryKey: ["li-newsletter-stats", tenantId], enabled: !!tenantId, refetchInterval: 60_000,
    queryFn: async () => {
      const count = async (f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => { const { count: c } = await f(base()); return c ?? 0; };
      const base = () => supabase.from("li_newsletter_subscribers").select("li_id", { count: "exact", head: true }).eq("tenant_id", tenantId!);
      const [total, baseline, fresh, customers, removed, state, pending, failed] = await Promise.all([
        count((q) => q.is("removed_at", null)),
        count((q) => q.is("removed_at", null).eq("is_baseline", true)),
        count((q) => q.is("removed_at", null).eq("is_baseline", false)),
        count((q) => q.is("removed_at", null).eq("is_customer", true)),
        count((q) => q.not("removed_at", "is", null)),
        supabase.from("li_newsletter_scan_state").select("last_full_scan_at, scanning, baseline_done").eq("tenant_id", tenantId!).maybeSingle(),
        supabase.from("li_marketing_outbox").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "pending"),
        supabase.from("li_marketing_outbox").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("status", "failed"),
      ]);
      return {
        total, baseline, fresh, customers, leads: Math.max(total - customers, 0), removed,
        lastScanAt: state.data?.last_full_scan_at ?? null, scanning: !!state.data?.scanning, baselineDone: !!state.data?.baseline_done,
        outboxPending: pending.count ?? 0, outboxFailed: failed.count ?? 0,
      };
    },
  });
}

export interface WaitlistRow {
  product_id: number; parent_id: number | null; sku: string | null; name: string | null; subscribers: number; snapshot_stock: number | null;
  current_stock: number | null; delta_7d: number; restocked: boolean; image_url: string | null; snapshot_date: string;
}

/** Painel de reposição: produtos com gente esperando, esgotados primeiro. */
export function useWaitlistPanel() {
  const { tenantId } = useAuth();
  return useQuery<WaitlistRow[]>({
    queryKey: ["li-waitlist-panel", tenantId], enabled: !!tenantId, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_waitlist_panel", { p_tenant_id: tenantId!, p_limit: 500 });
      if (error) throw error;
      return (data ?? []) as WaitlistRow[];
    },
  });
}
