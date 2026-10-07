import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LI_PRODUCT_SELECT } from "@/components/products/product-select-columns";
import { getRaw, type Product } from "@/components/products/productDetailsHelpers";

/** Fetches all child products of an LI parent product via the `pai` URI field in raw_json. */
export function useChildProducts(product: Product | null, enabled: boolean) {
  return useQuery({
    queryKey: ['li-product-children', product?.loja_integrada_product_id, product?.integration_id],
    queryFn: async () => {
      if (!product?.loja_integrada_product_id || !product?.integration_id) return [];

      const parentId = String(Math.round(Number(product.loja_integrada_product_id)));
      const expectedPaiUri = `/api/v1/produto/${parentId}`;

      // o filtro roda no banco: antes baixava a tabela inteira (~56 MB) para achar as filhas
      const { data, error } = await supabase
        .from('li_products')
        .select(LI_PRODUCT_SELECT)
        .eq('integration_id', product.integration_id)
        .eq('active', true)
        .eq('raw_json->>pai', expectedPaiUri)
        .returns<Product[]>();
      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && !!product?.loja_integrada_product_id && !!product?.integration_id,
  });
}
