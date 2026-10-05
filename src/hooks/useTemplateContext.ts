import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWhiteLabel } from "@/hooks/useWhiteLabel";
import { buildProductUrl, useStoreBaseUrl } from "@/hooks/useStoreBaseUrl";
import { useFooterAddress } from "@/hooks/useFooterAddress";
import { hdImageUrl } from "@/lib/product-images";
import { rowsToCards, type ProductCard, type TemplateCtx } from "@/components/email-marketing/editor/templates";

type Data = { bestsellers: ProductCard[]; newest: ProductCard[]; orders: number };

/** Dados da loja que preenchem os modelos: produtos reais, logo, nome da marca e total de pedidos para a prova social. */
export function useTemplateContext(enabled: boolean): { data: Omit<TemplateCtx, "palette"> | null; loading: boolean } {
  const { tenantId } = useAuth();
  const { config } = useWhiteLabel();
  const { baseUrl } = useStoreBaseUrl();
  const { address } = useFooterAddress();

  const { data, isLoading } = useQuery<Data>({
    queryKey: ["template-context", tenantId, baseUrl],
    enabled: enabled && !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const image = (r: { image_path: string | null; image_large: string | null; image_url: string | null }) =>
        r.image_path ? `https://cdn.awsli.com.br/${r.image_path}` : hdImageUrl(r.image_large || r.image_url) || "";
      const link = (p: string | null) => buildProductUrl(baseUrl, p) || "https://example.com";
      const fetchMode = async (mode: string, days: number) => {
        const { data: rows } = await supabase.rpc("get_li_showcase_products", { p_mode: mode, p_limit: 12, p_days: days });
        return rowsToCards(rows ?? [], image, link);
      };
      const [best, newest, ordersRes] = await Promise.all([
        fetchMode("bestsellers", 365), fetchMode("newest", 365),
        supabase.from("li_orders").select("id", { count: "exact", head: true }).not("status_id", "in", "(7,8,16,1020)"),
      ]);
      const total = ordersRes.count ?? 0;
      const orders = total >= 1000 ? Math.floor(total / 100) * 100 : Math.floor(total / 50) * 50; // arredonda para baixo: nunca promete mais que o real
      return { bestsellers: best.length ? best : newest, newest, orders };
    },
  });

  if (!data) return { data: null, loading: isLoading };
  return {
    loading: false,
    data: {
      ...data, logoUrl: config?.logo_url || undefined, brandName: config?.company_name || undefined,
      storeUrl: baseUrl || "https://example.com", address: address || undefined, deadline: format(addDays(new Date(), 3), "dd/MM"),
    },
  };
}
