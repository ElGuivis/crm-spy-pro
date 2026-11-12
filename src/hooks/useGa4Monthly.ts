import { useQuery } from "@tanstack/react-query";
import { invokeGoogleAds } from "@/lib/googleAdsInvoke";

export interface Ga4Month { month: string; purchase_revenue: number; refund_amount: number; purchases: number }

/** Receita de compra e reembolso do GA4 por mês (mês = "AAAA-MM-01"). Vazio quando o GA4 não está ligado nesta loja. */
export function useGa4Monthly(enabled = true) {
  return useQuery({
    queryKey: ["ga4", "monthly"], enabled, staleTime: 30 * 60_000, retry: 0,
    queryFn: async () => {
      const data = await invokeGoogleAds("ga4-monthly", {});
      return new Map<string, Ga4Month>(((data?.months ?? []) as Ga4Month[]).map((m) => [m.month, m]));
    },
  });
}
