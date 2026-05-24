import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BLING_PRODUCT_SELECT } from "@/components/products/product-select-columns";
import { createLogger } from "@/lib/logger";
import type { BlingProduct } from "@/components/products/bling/blingProductHelpers";

const log = createLogger("useBlingProductChildren");

export function useBlingProductChildren(product: BlingProduct | null, enabled: boolean) {
  return useQuery({
    queryKey: ['bling-product-children', product?.bling_id, product?.integration_id],
    queryFn: async () => {
      if (!product?.bling_id || !product?.integration_id) return [];
      const { data, error } = await supabase
        .from('bling_products')
        .select(BLING_PRODUCT_SELECT)
        .eq('integration_id', product.integration_id)
        .eq('produto_pai_id', product.bling_id)
        .order('nome', { ascending: true })
        .returns<BlingProduct[]>();
      if (error) {
        log.error('Error fetching child products:', error);
        return [];
      }
      return data || [];
    },
    enabled: enabled && !!product?.bling_id && !!product?.integration_id,
  });
}
