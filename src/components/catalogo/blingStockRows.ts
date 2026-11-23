import { supabase } from "@/integrations/supabase/client";
import type { BlingChildRow } from "./blingVariations";

const PAGE = 1000; // limite de linhas por resposta do PostgREST

/** Todas as linhas da integração (só 4 colunas; ~4,5 mil linhas em páginas de 1.000). */
export async function fetchBlingStockRows(integrationId: string): Promise<BlingChildRow[]> {
  const all: BlingChildRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("bling_products")
      .select("bling_id, produto_pai_id, nome, estoque_atual")
      .eq("integration_id", integrationId)
      .order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as BlingChildRow[]));
    if (!data || data.length < PAGE) return all;
  }
}
