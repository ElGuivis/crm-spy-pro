import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invokeGoogleAds } from "@/lib/googleAdsInvoke";
import type { EconomicsInputs, EconomicsView, RoasTargets } from "@/lib/googleAdsEconomics";

const KEY = ["google-ads", "economics"];

async function call(accountId: string, body: Record<string, unknown>): Promise<EconomicsView> {
  const data = await invokeGoogleAds("google-ads-economics", { account_id: accountId, ...body });
  const view = data?.results?.[0]?.view as EconomicsView | undefined;
  if (!view) throw new Error("A economia da loja não pôde ser calculada");
  return view;
}

/** Economia real da loja (medida nos pedidos do CRM) + ponto de equilíbrio do ROAS. Recalcula ao abrir. */
export function useGoogleAdsEconomics(accountId: string | undefined) {
  const qc = useQueryClient();
  const view = useQuery({
    queryKey: [...KEY, accountId], enabled: !!accountId, staleTime: 5 * 60_000,
    queryFn: () => call(accountId!, { action: "refresh" }),
  });
  const save = useMutation({
    mutationFn: (b: { inputs?: EconomicsInputs | Omit<EconomicsInputs, "confirmed">; targets?: RoasTargets }) => call(accountId!, { action: "save", ...b }),
    onSuccess: (v) => {
      qc.setQueryData([...KEY, accountId], v);
      qc.invalidateQueries({ queryKey: ["google-ads"] });
      toast.success("Economia da loja salva e recalculada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return { view, save };
}
