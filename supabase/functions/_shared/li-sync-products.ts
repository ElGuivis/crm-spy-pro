/**
 * Loja Integrada Product Sync Functions
 * Extracted from li-job-processor/index.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("li-sync-products", "shared");

type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export async function updateProductInfo(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId: string
): Promise<{ success: boolean; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;

  try {
    // Get products that were synced more than 5 minutes ago, prioritize oldest
    // Reduced from 15 minutes to 5 minutes for near real-time sync
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    // PRIORITIZE child products (variations) as they contain the real stock
    // Fetch 150 child products (75%) and 50 parent products (25%)
    const { data: childProducts, error: childError } = await supabase
      .from('li_products')
      .select('id, loja_integrada_product_id, name')
      .eq('integration_id', integrationId)
      .lt('updated_at_local', fiveMinutesAgo)
      .order('updated_at_local', { ascending: true })
      .limit(150);

    const { data: parentProducts, error: parentError } = await supabase
      .from('li_products')
      .select('id, loja_integrada_product_id, name')
      .eq('integration_id', integrationId)
      .lt('updated_at_local', fiveMinutesAgo)
      .order('updated_at_local', { ascending: true })
      .limit(50);

    if (childError) {
      throw new Error(`DB error (children): ${childError.message}`);
    }
    if (parentError) {
      throw new Error(`DB error (parents): ${parentError.message}`);
    }

    // Combine: children first (they have real stock), then parents
    const productsToUpdate = [...(childProducts || []), ...(parentProducts || [])];

    if (productsToUpdate.length === 0) {
      log.info('[PRODUCT-UPDATE] No products need updating');
      return { success: true, updated: 0, errors: [] };
    }

    log.info(`[PRODUCT-UPDATE] Updating ${productsToUpdate.length} products (${childProducts?.length || 0} children, ${parentProducts?.length || 0} parents)`);

    for (const product of productsToUpdate) {
      try {
        // Fetch current product data from API
        const response = await fetch(`${LI_API_BASE}/produto/${product.loja_integrada_product_id}`, {
          headers: { 'Authorization': authHeader }
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Product was deleted in LI, mark as inactive
            await supabase
              .from('li_products')
              .update({ 
                active: false, 
                updated_at_local: new Date().toISOString() 
              })
              .eq('id', product.id);
            updated++;
            log.info(`[PRODUCT-UPDATE] Marked as inactive (404): ${product.name}`);
            continue;
          }
          errors.push(`Product ${product.loja_integrada_product_id}: API ${response.status}`);
          continue;
        }

        const apiProduct = await response.json();

        // FIXED: Fetch stock from the correct endpoint /produto_estoque/{id}
        // The /produto/{id} endpoint does NOT return stock data
        let estoqueQuantidade = 0;
        let estoqueGerenciado = false;
        try {
          const stockResponse = await fetch(`${LI_API_BASE}/produto_estoque/${product.loja_integrada_product_id}`, {
            headers: { 'Authorization': authHeader }
          });
          
          if (stockResponse.ok) {
            const stockData = await stockResponse.json();
            estoqueGerenciado = stockData.gerenciado === true;
            // Use quantidade_disponivel (available for sale) as primary, fallback to quantidade
            estoqueQuantidade = stockData.quantidade_disponivel ?? stockData.quantidade ?? 0;
            log.info(`[PRODUCT-UPDATE] Stock: ${product.name} = ${estoqueQuantidade} (gerenciado: ${estoqueGerenciado})`);
          } else {
            log.info(`[PRODUCT-UPDATE] Failed to fetch stock for ${product.name}: ${stockResponse.status}`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 25));
        } catch (stockError) {
          log.error(`[PRODUCT-UPDATE] Error fetching stock for ${product.loja_integrada_product_id}:`, stockError);
        }

        // Get image URL if available
        let imagemUrl = null;
        if (apiProduct.imagem_principal) {
          const imgMatch = apiProduct.imagem_principal.match?.(/\/produto_imagem\/(\d+)/);
          if (imgMatch) {
            try {
              const imgRes = await fetch(`${LI_API_BASE}/produto_imagem/${imgMatch[1]}`, {
                headers: { 'Authorization': authHeader }
              });
              if (imgRes.ok) {
                const imgData = await imgRes.json();
                imagemUrl = imgData.grande || imgData.media || imgData.pequena;
              }
            } catch (e) {
              // Ignore image fetch errors
            }
          }
        }

        // Update product with latest data
        const updatePayload: Record<string, unknown> = {
          name: apiProduct.nome || product.name,
          sku: apiProduct.sku || null,
          price: apiProduct.preco_cheio ? parseFloat(apiProduct.preco_cheio) : null,
          promotional_price: apiProduct.preco_promocional ? parseFloat(apiProduct.preco_promocional) : null,
          cost_price: apiProduct.preco_custo ? parseFloat(apiProduct.preco_custo) : null,
          stock: estoqueQuantidade,
          stock_managed: estoqueGerenciado,
          active: apiProduct.ativo !== false,
          raw_json: apiProduct,
          updated_at_remote: apiProduct.data_modificacao || null,
          updated_at_local: new Date().toISOString(),
        };

        if (imagemUrl) {
          updatePayload.image_url = imagemUrl;
        }

        await supabase
          .from('li_products')
          .update(updatePayload)
          .eq('id', product.id);

        updated++;
        log.info(`[PRODUCT-UPDATE] ✓ Updated: ${product.name} (stock: ${estoqueQuantidade})`);

        // Rate limiting: wait 50ms between calls (reduced from 100ms for faster sync)
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Product ${product.loja_integrada_product_id}: ${msg}`);
      }
    }

    log.info(`[PRODUCT-UPDATE] Complete: ${updated} products updated`);
    return { success: true, updated, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[PRODUCT-UPDATE] Error:', msg);
    return { success: false, updated: 0, errors: [msg] };
  }
}

export async function syncNewProducts(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId?: string | null
): Promise<{ success: boolean; synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  try {
    // Get count from API
    const countResponse = await fetch(`${LI_API_BASE}/produto?limit=1`, {
      headers: { 'Authorization': authHeader }
    });

    if (!countResponse.ok) {
      throw new Error(`API error: ${countResponse.status}`);
    }

    const countData = await countResponse.json();
    const totalApiProducts = countData.meta?.total_count || 0;

    // Get count from DB
    const { count: dbProductCount } = await supabase
      .from('li_products')
      .select('*', { count: 'exact', head: true });

    const diff = totalApiProducts - (dbProductCount || 0);
    log.info(`[PRODUCTS] API: ${totalApiProducts}, DB: ${dbProductCount}, Diff: ${diff}`);

    if (diff <= 0) {
      return { success: true, synced: 0, errors: [] };
    }

    // Fetch the last X products
    const productsToFetch = Math.min(diff + 5, 200);
    const offset = Math.max(0, totalApiProducts - productsToFetch);

    const response = await fetch(`${LI_API_BASE}/produto?limit=${productsToFetch}&offset=${offset}`, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const products = data.objects || [];

    // Get existing product IDs from DB
    const productLiIds = products.map((p: Record<string, unknown>) => Number(p.id));
    const { data: existingProducts } = await supabase
      .from('li_products')
      .select('loja_integrada_product_id')
      .in('loja_integrada_product_id', productLiIds);

    const existingLiIds = new Set((existingProducts || []).map((p: Record<string, unknown>) => Number(p.loja_integrada_product_id)));

    // Filter to only new products
    const newProducts = products.filter((p: Record<string, unknown>) => !existingLiIds.has(Number(p.id)));
    log.info(`[PRODUCTS] Found ${newProducts.length} new products to sync`);

    // Fetch and save each new product
    for (const productItem of newProducts) {
      try {
        const productRes = await fetch(`${LI_API_BASE}/produto/${productItem.id}`, {
          headers: { 'Authorization': authHeader }
        });

        if (!productRes.ok) {
          errors.push(`Product ${productItem.id}: API ${productRes.status}`);
          continue;
        }

        const product = await productRes.json();

        // Get image URL
        let imagemUrl = null;
        if (product.imagem_principal) {
          const imgMatch = product.imagem_principal.match?.(/\/produto_imagem\/(\d+)/);
          if (imgMatch) {
            try {
              const imgRes = await fetch(`${LI_API_BASE}/produto_imagem/${imgMatch[1]}`, {
                headers: { 'Authorization': authHeader }
              });
              if (imgRes.ok) {
                const imgData = await imgRes.json();
                imagemUrl = imgData.grande || imgData.media || imgData.pequena;
              }
            } catch (e) {
              log.info(`[PRODUCTS] Could not fetch image for ${product.id}`);
            }
          }
        }

        // FIXED: Fetch stock from correct endpoint /produto_estoque/{id}
        // The /produto/{id} endpoint does NOT return stock data
        let estoqueQuantidade = 0;
        let estoqueGerenciado = false;
        try {
          const stockResponse = await fetch(`${LI_API_BASE}/produto_estoque/${product.id}`, {
            headers: { 'Authorization': authHeader }
          });
          
          if (stockResponse.ok) {
            const stockData = await stockResponse.json();
            estoqueGerenciado = stockData.gerenciado === true;
            // Use quantidade_disponivel (available for sale) as primary
            estoqueQuantidade = stockData.quantidade_disponivel ?? stockData.quantidade ?? 0;
            log.info(`[PRODUCTS] Stock for ${product.nome}: ${estoqueQuantidade} (gerenciado: ${estoqueGerenciado})`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 25));
        } catch (stockError) {
          log.error(`[PRODUCTS] Error fetching stock for ${product.id}:`, stockError);
        }

        // Extract parent product ID
        let produtoPaiId = null;
        if (product.pai) {
          const paiMatch = product.pai.match?.(/\/produto\/(\d+)/);
          if (paiMatch) {
            produtoPaiId = parseInt(paiMatch[1], 10);
          }
        }

        await supabase
          .from('li_products')
          .upsert({
            loja_integrada_product_id: product.id,
            tenant_id: tenantId,
            integration_id: integrationId,
            name: product.nome || 'Sem nome',
            sku: product.sku || null,
            price: product.preco_cheio ? parseFloat(product.preco_cheio) : null,
            promotional_price: product.preco_promocional ? parseFloat(product.preco_promocional) : null,
            cost_price: product.preco_custo ? parseFloat(product.preco_custo) : null,
            stock: estoqueQuantidade,
            stock_managed: estoqueGerenciado,
            active: product.ativo !== false,
            image_url: imagemUrl,
            raw_json: product,
            updated_at_remote: product.data_modificacao || null,
            updated_at_local: new Date().toISOString(),
          }, { onConflict: 'integration_id,loja_integrada_product_id' });

        synced++;
        log.info(`[PRODUCTS] ✓ Synced: ${product.nome} (${product.id})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Product ${productItem.id}: ${msg}`);
      }
    }

    log.info(`[PRODUCTS] Sync complete: ${synced} new products`);
    return { success: true, synced, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[PRODUCTS] Sync error:', msg);
    return { success: false, synced: 0, errors: [msg] };
  }
}
