import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LI_PRODUCT_SELECT } from "@/components/products/product-select-columns";
import type { Product } from "@/components/products/productDetailsHelpers";

/** Produto completo (com `raw_json` inteiro) para o diálogo de detalhes; a lista só carrega o resumo. */
export function useFullProduct(productId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['li-product-full', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('li_products')
        .select(LI_PRODUCT_SELECT)
        .eq('id', productId!)
        .maybeSingle<Product>();
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!productId,
    staleTime: 60_000,
  });
}
