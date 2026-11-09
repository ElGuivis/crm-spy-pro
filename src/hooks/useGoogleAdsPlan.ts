import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invokeGoogleAds as invoke } from "@/lib/googleAdsInvoke";

const KEY = "google-ads";

/** Ações do plano: gerar análise, aplicar/desfazer no Google Ads, modo da conta e ROAS mínimo. Servidor revalida tudo. */
export function useGoogleAdsPlanActions(accountId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: [KEY] });
  const need = () => { if (!accountId) throw new Error("Nenhuma conta cadastrada"); return accountId; };

  const runStrategy = useMutation({
    mutationFn: async () => invoke("google-ads-strategist", { account_id: need() }),
    onSuccess: () => { refresh(); toast.success("Análise estratégica atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyPlan = useMutation({
    mutationFn: async (recommendationIds: string[]) => {
      const id = need();
      const res = await invoke("google-ads-apply", { action: "apply", account_id: id, recommendation_ids: recommendationIds });
      const failed = (res?.results ?? []).find((r: { ok: boolean }) => !r.ok);
      if (failed) throw new Error(failed.error ?? "Falha ao aplicar");
      return res;
    },
    onSuccess: (res) => { refresh(); toast.success(`${res?.results?.length ?? 0} mudança(s) aplicada(s) no Google Ads e confirmada(s)`); },
    onError: (e: Error) => { refresh(); toast.error(e.message); },
  });

  const revert = useMutation({
    mutationFn: async (auditId: string) => {
      const res = await invoke("google-ads-apply", { action: "revert", account_id: need(), audit_id: auditId });
      const failed = (res?.results ?? []).find((r: { ok: boolean }) => !r.ok);
      if (failed) throw new Error(failed.error ?? "Falha ao desfazer");
      return res;
    },
    onSuccess: () => { refresh(); toast.success("Mudança desfeita"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setMode = useMutation({
    mutationFn: async (mode: "read_only" | "approval") => invoke("google-ads-settings", { action: "set_mode", account_id: need(), mode }),
    onSuccess: (_d, mode) => { refresh(); toast.success(mode === "approval" ? "Modo com aprovação ativado" : "Modo somente leitura ativado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setMinRoas = useMutation({
    mutationFn: async (minRoas: number | null) => {
      await invoke("google-ads-settings", { action: "set_min_roas", account_id: need(), min_roas: minRoas });
      return invoke("google-ads-strategist", { account_id: need() }); // refaz o plano com o novo mínimo
    },
    onSuccess: () => { refresh(); toast.success("ROAS mínimo salvo e plano refeito"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { runStrategy, applyPlan, revert, setMode, setMinRoas };
}
