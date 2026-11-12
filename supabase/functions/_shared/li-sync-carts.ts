/**
 * Loja Integrada Coupon Sync + Order Notification Helpers
 * Extracted from li-job-processor/index.ts.
 *
 * NOTE: previously also contained syncAbandonedCarts/updateExistingCarts.
 * The abandoned-cart feature was retired (LI does not expose a real
 * abandoned-cart endpoint), so those helpers were removed alongside the
 * abandoned_cart_* tables.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("li-sync-carts", "shared");

type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export async function syncCoupons(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId: string
): Promise<{ success: boolean; synced: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  let updated = 0;

  try {
    // Fetch coupons from API (limit to recent 200 for incremental sync)
    const response = await fetch(`${LI_API_BASE}/cupom?limit=50&offset=0`, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const coupons = data.objects || [];
    log.info(`[COUPONS] Fetched ${coupons.length} coupons from API`);

    if (coupons.length === 0) {
      return { success: true, synced: 0, updated: 0, errors: [] };
    }

    // Get existing coupons by code
    const couponCodes = coupons.map((c: Record<string, unknown>) => c.codigo);
    const { data: existingCoupons } = await supabase
      .from('generated_coupons')
      .select('coupon_code, li_coupon_id, li_quantidade_usada')
      .eq('integration_id', integrationId)
      .in('coupon_code', couponCodes);

    const existingMap = new Map(
      (existingCoupons || []).map((c: Record<string, unknown>) => [c.coupon_code, c])
    );

    for (const coupon of coupons) {
      try {
        const existing = existingMap.get(coupon.codigo);

        // Map coupon data
        let discountPercentage = 0;
        let couponValue: number | null = null;

        if (coupon.tipo === 'porcentagem') {
          discountPercentage = coupon.valor || 0;
        } else if (coupon.tipo === 'valor_absoluto') {
          couponValue = coupon.valor || 0;
        }

        const dataFim = coupon.data_fim ? new Date(coupon.data_fim).toISOString() : null;

        if (existing) {
          // ALWAYS update existing coupons with ALL fields from API
          const dataInicio = coupon.data_inicio ? new Date(coupon.data_inicio).toISOString() : null;

          // FIX: Track when coupon is used - set used_at if quantidade_usada increased
          const existingData = existing as { li_quantidade_usada?: number };
          const previousUsage = existingData.li_quantidade_usada || 0;
          const currentUsage = coupon.quantidade_usada || 0;
          const wasJustUsed = currentUsage > previousUsage;

          const updateData: Record<string, unknown> = {
            // Discount values
            discount_percentage: discountPercentage,
            coupon_value: couponValue,
            coupon_type: coupon.tipo,
            coupon_description: coupon.descricao || null,
            // Usage tracking
            li_quantidade_usada: currentUsage,
            li_quantidade_uso_maximo: coupon.quantidade_uso_maximo || null,
            // Dates
            li_data_inicio: dataInicio,
            li_data_fim: dataFim,
            expires_at: dataFim || null,
            // Active status
            is_active: coupon.ativo !== false,
            // Sync timestamp
            synced_at: new Date().toISOString()
          };

          // Set used_at if coupon was just used (and not already set)
          if (wasJustUsed) {
            log.info(`[COUPONS] Coupon ${coupon.codigo} was used! Usage: ${previousUsage} -> ${currentUsage}`);
            updateData.used_at = new Date().toISOString();
          }

          await supabase
            .from('generated_coupons')
            .update(updateData)
            .eq('coupon_code', coupon.codigo)
            .eq('integration_id', integrationId);
          updated++;
        } else {
          // Insert new coupon
          const dataInicio = coupon.data_inicio ? new Date(coupon.data_inicio).toISOString() : null;

          const { error: insertError } = await supabase
            .from('generated_coupons')
            .insert({
              tenant_id: tenantId,
              integration_id: integrationId,
              coupon_code: coupon.codigo,
              discount_percentage: discountPercentage,
              coupon_value: couponValue,
              li_coupon_id: coupon.id,
              source: 'imported',
              coupon_type: coupon.tipo,
              coupon_description: coupon.descricao || null,
              li_data_inicio: dataInicio,
              li_data_fim: dataFim,
              li_quantidade_uso_maximo: coupon.quantidade_uso_maximo || null,
              li_quantidade_usada: coupon.quantidade_usada || 0,
              expires_at: dataFim || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            });

          if (!insertError) {
            synced++;
            log.info(`[COUPONS] ✓ Imported: ${coupon.codigo}`);
          } else if (insertError.code !== '23505') {
            errors.push(`Coupon ${coupon.codigo}: ${insertError.message}`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Coupon ${coupon.codigo}: ${msg}`);
      }
    }

    log.info(`[COUPONS] Sync complete: ${synced} new, ${updated} updated`);
    return { success: true, synced, updated, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[COUPONS] Sync error:', msg);
    return { success: false, synced: 0, updated: 0, errors: [msg] };
  }
}

// A notificação de status do pedido mora em order-notifications.ts (reexportada aqui para os chamadores atuais).
export { processOrderNotificationsInJob } from "./order-notifications.ts";
