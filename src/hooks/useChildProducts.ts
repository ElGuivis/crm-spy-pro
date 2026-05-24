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

      const pageSize = 1000;
      let from = 0;
      const allChildren: Product[] = [];

      while (true) {
        const { data, error } = await supabase
          .from('li_products')
          .select(LI_PRODUCT_SELECT)
          .eq('integration_id', product.integration_id)
          .eq('active', true)
          .range(from, from + pageSize - 1)
          .returns<Product[]>();

        if (error) break;

        const matches = ((data || []) as Product[]).filter(p => getRaw(p, 'pai') === expectedPaiUri);
        allChildren.push(...matches);

        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      return allChildren;
    },
    enabled: enabled && !!product?.loja_integrada_product_id && !!product?.integration_id,
  });
}
