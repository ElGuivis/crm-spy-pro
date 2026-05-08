import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const LI_API_BASE = 'https://api.awsli.com.br/v1';

Deno.serve(async (req) => {

  const cid = getCorrelationId(req);
  const log = createLogger("li-coupon-create", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const appKey = Deno.env.get('LOJA_INTEGRADA_APP_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { 
      integrationId, 
      codigo, 
      tipo, // 'porcentagem' | 'valor_absoluto'
      valor, 
      dataInicio,
      dataFim, 
      quantidadeUsoMaximo,
      descricao 
    } = await req.json();
    
    // Validation
    if (!integrationId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'integrationId é obrigatório' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!codigo || codigo.length < 3 || codigo.length > 20) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Código do cupom deve ter entre 3 e 20 caracteres' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tipo || !['porcentagem', 'valor_absoluto'].includes(tipo)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Tipo deve ser "porcentagem" ou "valor_absoluto"' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!valor || valor <= 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Valor deve ser maior que zero' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tipo === 'porcentagem' && valor > 100) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Porcentagem não pode ser maior que 100%' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    log.info(`[COUPON-CREATE] Creating coupon ${codigo} for integration ${integrationId}`);

    // Validate integration belongs to tenant (IDOR protection)
    await requireResource(supabase, "integrations", integrationId, authTenantId, req);

    // Get integration details — scoped to caller's tenant
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('id, api_key, tenant_id')
      .eq('id', integrationId)
      .eq('tenant_id', authTenantId)
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Integração não encontrada' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = `chave_api ${integration.api_key} aplicacao ${appKey}`;
    const tenantId = integration.tenant_id;

    // Format dates for LI API (YYYY-MM-DD)
    const formatDateForAPI = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    };

    // Create coupon in Loja Integrada
    const couponPayload = {
      codigo: codigo.toUpperCase(),
      tipo: tipo,
      valor: valor,
      ativo: true,
      data_inicio: dataInicio ? formatDateForAPI(dataInicio) : formatDateForAPI(new Date().toISOString()),
      data_fim: dataFim ? formatDateForAPI(dataFim) : null,
      quantidade_uso_maximo: quantidadeUsoMaximo || null,
      descricao: descricao || `Cupom criado via sistema`
    };

    log.info(`[COUPON-CREATE] Sending to LI API:`, JSON.stringify(couponPayload));

    const response = await fetch(`${LI_API_BASE}/cupom`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(couponPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`[COUPON-CREATE] LI API error: ${response.status} - ${errorText}`);
      
      // Parse error message if possible
      let errorMessage = 'Erro ao criar cupom na Loja Integrada';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.codigo) {
          errorMessage = `Código: ${errorData.codigo.join(', ')}`;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        }
      } catch {
        errorMessage = errorText || errorMessage;
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const liCoupon = await response.json();
    log.info(`[COUPON-CREATE] LI API response:`, JSON.stringify(liCoupon));

    // Save coupon locally
    const localCouponData = {
      tenant_id: tenantId,
      integration_id: integrationId,
      coupon_code: codigo.toUpperCase(),
      discount_percentage: tipo === 'porcentagem' ? valor : 0,
      coupon_value: tipo === 'valor_absoluto' ? valor : null,
      li_coupon_id: liCoupon.id,
      source: 'manual',
      coupon_type: tipo,
      coupon_description: descricao || null,
      li_data_inicio: dataInicio ? new Date(dataInicio).toISOString() : new Date().toISOString(),
      li_data_fim: dataFim ? new Date(dataFim).toISOString() : null,
      li_quantidade_uso_maximo: quantidadeUsoMaximo || null,
      li_quantidade_usada: 0,
      expires_at: dataFim ? new Date(dataFim).toISOString() : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data: savedCoupon, error: saveError } = await supabase
      .from('generated_coupons')
      .insert(localCouponData)
      .select()
      .single();

    if (saveError) {
      log.error(`[COUPON-CREATE] Error saving locally:`, saveError);
      // Coupon was created in LI, just log the error
    }

    log.info(`[COUPON-CREATE] ✓ Created coupon ${codigo} (LI ID: ${liCoupon.id})`);

    return new Response(JSON.stringify({ 
      success: true, 
      coupon: savedCoupon || localCouponData,
      liCouponId: liCoupon.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('[COUPON-CREATE] Error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
