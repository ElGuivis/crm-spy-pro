import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const LI_API_BASE = 'https://api.awsli.com.br/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cid = getCorrelationId(req);
  const log = createLogger("li-coupon-sync", cid);

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { integrationId, action = 'full-sync' } = await req.json();
    
    if (!integrationId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'integrationId is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`[COUPON-SYNC] Starting ${action} for integration ${integrationId}`);

    // Validate integration belongs to caller's tenant
    const integration = await requireResource<{ id: string; tenant_id: string; api_key: string }>(
      supabase, "integrations", integrationId, authTenantId, req,
      "id, api_key, tenant_id"
    );

    const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;
    const tenantId = integration.tenant_id;

    // Create sync log entry
    const { data: syncLog, error: logError } = await supabase
      .from('li_sync_logs')
      .insert({
        tenant_id: tenantId,
        integration_id: integrationId,
        sync_type: 'coupons',
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (logError) {
      log.error('[COUPON-SYNC] Failed to create sync log:', logError);
    }

    const syncLogId = syncLog?.id;

    // Fetch coupons from Loja Integrada API
    let allCoupons: Record<string, unknown>[] = [];
    let offset = 0;
    const limit = 50;
    let hasMore = true;
    let totalCount = 0;

    while (hasMore) {
      log.info(`[COUPON-SYNC] Fetching coupons offset=${offset}, limit=${limit}`);
      
      const response = await fetch(`${LI_API_BASE}/cupom?limit=${limit}&offset=${offset}`, {
        headers: { 'Authorization': authHeader }
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`[COUPON-SYNC] API error: ${response.status} - ${errorText}`);
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const coupons = data.objects || [];
      totalCount = data.meta?.total_count || 0;

      log.info(`[COUPON-SYNC] Got ${coupons.length} coupons (total: ${totalCount})`);

      allCoupons = [...allCoupons, ...coupons];
      offset += limit;
      hasMore = coupons.length === limit && offset < totalCount;

      // For check-new action, only fetch the first batch
      if (action === 'check-new' && offset >= 100) {
        hasMore = false;
      }
    }

    log.info(`[COUPON-SYNC] Total fetched: ${allCoupons.length} coupons`);

    // Get existing coupons by code to avoid duplicates
    const couponCodes = allCoupons.map(c => c.codigo);
    const { data: existingCoupons } = await supabase
      .from('generated_coupons')
      .select('coupon_code, li_coupon_id')
      .eq('integration_id', integrationId)
      .in('coupon_code', couponCodes);

    const existingCodesMap = new Map(
      (existingCoupons || []).map(c => [c.coupon_code, c.li_coupon_id])
    );

    let synced = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process each coupon
    for (const coupon of allCoupons) {
      try {
        const existingLiId = existingCodesMap.get(coupon.codigo);
        
        // Map coupon type
        let discountPercentage = 0;
        let couponValue: number | null = null;
        
        if (coupon.tipo === 'porcentagem') {
          discountPercentage = coupon.valor || 0;
        } else if (coupon.tipo === 'valor_absoluto') {
          couponValue = coupon.valor || 0;
        }

        // Parse dates
        const dataInicio = coupon.data_inicio ? new Date(coupon.data_inicio).toISOString() : null;
        const dataFim = coupon.data_fim ? new Date(coupon.data_fim).toISOString() : null;
        
        // Determine status
        const now = new Date();
        const isExpired = dataFim ? new Date(dataFim) < now : false;
        const isUsedMax = coupon.quantidade_uso_maximo && coupon.quantidade_usada >= coupon.quantidade_uso_maximo;

        const couponData = {
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
          expires_at: dataFim || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Default 1 year if no expiry
          used_at: isUsedMax ? new Date().toISOString() : null,
        };

        if (existingLiId) {
          // Update existing coupon with LI data
          const { error: updateError } = await supabase
            .from('generated_coupons')
            .update({
              li_quantidade_usada: coupon.quantidade_usada || 0,
              li_data_fim: dataFim,
            })
            .eq('coupon_code', coupon.codigo)
            .eq('integration_id', integrationId);

          if (updateError) {
            errors.push(`Update ${coupon.codigo}: ${updateError.message}`);
          } else {
            updated++;
          }
        } else {
          // Insert new coupon
          const { error: insertError } = await supabase
            .from('generated_coupons')
            .insert(couponData);

          if (insertError) {
            if (insertError.code === '23505') { // Unique constraint
              skipped++;
            } else {
              errors.push(`Insert ${coupon.codigo}: ${insertError.message}`);
            }
          } else {
            synced++;
            log.info(`[COUPON-SYNC] ✓ Imported: ${coupon.codigo}`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Coupon ${coupon.codigo}: ${msg}`);
      }
    }

    // Update sync log
    if (syncLogId) {
      await supabase
        .from('li_sync_logs')
        .update({
          status: errors.length > 0 ? 'completed_with_errors' : 'completed',
          records_synced: synced,
          completed_at: new Date().toISOString(),
          error_message: errors.length > 0 ? errors.join('; ') : null
        })
        .eq('id', syncLogId);
    }

    log.info(`[COUPON-SYNC] Complete: ${synced} synced, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

    return new Response(JSON.stringify({ 
      success: true, 
      synced,
      updated,
      skipped,
      totalFetched: allCoupons.length,
      totalInApi: totalCount,
      errors: errors.length > 0 ? errors : undefined,
      syncLogId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[COUPON-SYNC] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
