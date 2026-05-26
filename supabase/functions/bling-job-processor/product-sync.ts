import { createLogger } from "../_shared/correlation.ts";
import type { ServiceClient } from "../_shared/supabase-types.ts";
import { BLING_API_BASE, RATE_LIMIT_DELAY, delay } from "./job-helpers.ts";

type Log = ReturnType<typeof createLogger>;

export async function syncNewProducts(
  supabase: ServiceClient, accessToken: string, integrationId: string, tenantId: string, lastBlingId: number, log: Log
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  try {
    const allProducts: Record<string, unknown>[] = [];
    for (let page = 1; page <= 2; page++) {
      const response = await fetch(`${BLING_API_BASE}/produtos?pagina=${page}&limite=100`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
      });
      if (!response.ok) { if (response.status === 429) throw new Error('RATE_LIMITED'); throw new Error(`API error: ${response.status}`); }
      const result = await response.json();
      const products = result.data || [];
      allProducts.push(...products);
      if (products.length < 100) break;
      await delay(RATE_LIMIT_DELAY);
    }

    log.info(`[BLING-JOB] Fetched ${allProducts.length} products from API`);
    const newProducts = allProducts.filter((p: Record<string, unknown>) => (p.id as number) > lastBlingId);
    log.info(`[BLING-JOB] Found ${newProducts.length} new products (bling_id > ${lastBlingId})`);
    if (newProducts.length === 0) return { success: true, synced: 0, errors: [] };

    for (const product of newProducts) {
      try {
        const { error } = await supabase.from('bling_products').upsert({
          bling_id: product.id, nome: product.nome, codigo: product.codigo, preco: product.preco,
          preco_custo: product.precoCusto,
          estoque_atual: (product.estoque as Record<string, unknown>)?.saldoVirtualTotal ?? (product.estoque as Record<string, unknown>)?.saldoFisicoTotal ?? 0,
          estoque_minimo: (product.estoque as Record<string, unknown>)?.minimo ?? null,
          situacao: product.situacao, tipo: product.tipo, formato: product.formato,
          unidade: product.unidade || null, gtin: product.gtin || null, gtin_embalagem: product.gtinEmbalagem || null,
          ean: product.ean || null, imagem_url: product.imagemURL || null,
          condicao: product.condicao ?? null, frete_gratis: product.freteGratis === true, sob_encomenda: product.sobEncomenda === true,
          tenant_id: tenantId, integration_id: integrationId, synced_at: new Date().toISOString(),
        }, { onConflict: 'bling_id,integration_id', ignoreDuplicates: false });
        if (error) { errors.push(`Product ${product.nome}: ${error.message}`); }
        else { synced++; log.info(`[BLING-JOB] ✓ Synced new product: ${product.nome} (bling_id: ${product.id})`); }
      } catch (e) { errors.push(`Product ${product.nome}: ${e instanceof Error ? e.message : 'Unknown error'}`); }
    }
    return { success: true, synced, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[BLING-JOB] Product sync error:', msg);
    return { success: false, synced: 0, errors: [msg] };
  }
}
