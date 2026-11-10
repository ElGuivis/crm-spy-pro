import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeGoogleAds as invoke } from "@/lib/googleAdsInvoke";

const KEY = "google-ads";

export interface NegativeProposal {
  id: string; status: string; title: string; rationale: string; error: string | null;
  payload: { campaign_id: number; terms: string[]; term_costs: Array<{ text: string; cost: number }> };
}
export interface RsaDraft { headlines: string[]; descriptions: string[]; final_url: string }
export interface RebuildProposal {
  id: string; status: string; title: string; rationale: string; error: string | null;
  payload: {
    campaign_id: number; ad_group_id: number; needs_copy: boolean; final_url: string | null; ai_generated?: boolean;
    keywords: Array<{ text: string; match_type: "EXACT" | "PHRASE" | "BROAD"; source: string; value: number }>;
    enable_ad_ids: number[]; new_ad: RsaDraft | null;
  };
}

/** Propostas de construção geradas a partir dos dados (negativas e reconstrução de campanhas de Pesquisa). */
export function useGoogleAdsBuildProposals(accountId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "build", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.from("google_ads_recommendations").select("id, kind, status, title, rationale, error, payload")
        .eq("account_id", accountId!).eq("agent", "build_agent").in("status", ["pending", "failed"]).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      return {
        negatives: rows.filter((r) => r.kind === "add_negative_keywords") as unknown as NegativeProposal[],
        rebuilds: rows.filter((r) => r.kind === "rebuild_search_structure") as unknown as RebuildProposal[],
      };
    },
  });
}

export function useGoogleAdsBuildActions(accountId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [KEY] });
  const need = () => { if (!accountId) throw new Error("Nenhuma conta cadastrada"); return accountId; };

  const saveDraft = useMutation({
    mutationFn: async (v: { id: string; patch: Record<string, unknown> }) =>
      invoke("google-ads-apply", { action: "update_draft", account_id: need(), recommendation_id: v.id, patch: v.patch }),
    onSuccess: () => { refresh(); toast.success("Rascunho salvo"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateCopy = useMutation({
    mutationFn: async (id: string) => invoke("google-ads-ai", { action: "draft_ad_copy", account_id: need(), recommendation_id: id }),
    onSuccess: (res) => {
      refresh();
      toast.success(res?.dropped?.length ? `Texto gerado (a IA propôs ${res.dropped.length} item(ns) que foram descartados por regra)` : "Texto do anúncio gerado: revise antes de aplicar");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Salva a seleção atual (se houver) e aplica no Google Ads. O servidor revalida e confere o resultado. */
  const apply = useMutation({
    mutationFn: async (v: { id: string; patch?: Record<string, unknown> }) => {
      const id = need();
      if (v.patch) await invoke("google-ads-apply", { action: "update_draft", account_id: id, recommendation_id: v.id, patch: v.patch });
      const res = await invoke("google-ads-apply", { action: "apply", account_id: id, recommendation_ids: [v.id] });
      const bad = (res?.results ?? []).find((r: { ok: boolean }) => !r.ok);
      if (bad) throw new Error(bad.error ?? "Falha ao aplicar");
      return res;
    },
    onSuccess: () => { refresh(); toast.success("Aplicado no Google Ads e confirmado"); },
    onError: (e: Error) => { refresh(); toast.error(e.message); },
  });

  return { saveDraft, generateCopy, apply };
}
