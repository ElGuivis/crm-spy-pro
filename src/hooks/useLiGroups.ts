import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface LiGroup { id: number; nome: string; padrao: boolean }
export interface GroupPreview { members: number; alreadyInGroup: number; toMove: number; from: Record<string, number>; running: number }
export interface GroupJob {
  id: string; label: string; target_group: string | null; status: "running" | "done" | "cancelled"; total: number; done: number; failed: number;
  undo_of: string | null; undone_at: string | null; created_at: string; finished_at: string | null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("li-customer-groups", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const j = ctx ? await ctx.json().catch((): null => null) : null;
    throw new Error(j?.error || error.message);
  }
  if (!data?.success) throw new Error(data?.error || "A loja não respondeu como esperado");
  return data as T;
}

/** Grupos de clientes da Loja Integrada (lidos da loja). */
export function useLiGroups(enabled = true) {
  const { tenantId } = useAuth();
  return useQuery<LiGroup[]>({
    queryKey: ["li-groups", tenantId], enabled: enabled && !!tenantId, staleTime: 5 * 60_000,
    queryFn: async () => (await call<{ groups: LiGroup[] }>({ action: "groups" })).groups,
  });
}

/** Trabalhos de alteração de grupo (atualiza sozinho enquanto algum está rodando). */
export function useGroupJobs() {
  const { tenantId } = useAuth();
  return useQuery<GroupJob[]>({
    queryKey: ["li-group-jobs", tenantId], enabled: !!tenantId,
    refetchInterval: (q) => ((q.state.data ?? []).some((j) => j.status === "running") ? 5_000 : 60_000),
    queryFn: async () => (await call<{ jobs: GroupJob[] }>({ action: "jobs" })).jobs,
  });
}

export function useGroupActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["li-group-jobs"] });
  const fail = (e: Error) => toast.error(e.message);
  return {
    preview: useMutation({ mutationFn: (v: { audienceId: string; group: string }) => call<GroupPreview>({ action: "preview", ...v }), onError: fail }),
    start: useMutation({ mutationFn: (v: { audienceId: string; group: string }) => call<{ jobId: string; total: number }>({ action: "start", confirm: true, ...v }), onSuccess: refresh, onError: fail }),
    cancel: useMutation({ mutationFn: (jobId: string) => call({ action: "cancel", jobId }), onSuccess: refresh, onError: fail }),
    undo: useMutation({ mutationFn: (jobId: string) => call<{ total: number }>({ action: "undo", jobId }), onSuccess: refresh, onError: fail }),
  };
}
