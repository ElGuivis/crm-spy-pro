import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireInternalAuth } from "../_shared/auth-guard.ts"
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("rfm-cron-trigger", cid);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    requireInternalAuth(req)

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Find all active integrations that are store types (loja_integrada or bling)
    const { data: integrations, error: intErr } = await supabaseAdmin
      .from('integrations')
      .select('id, type, tenant_id')
      .in('type', ['loja_integrada', 'bling_v3'])
      .eq('status', 'connected')

    if (intErr) throw intErr

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No active store integrations found',
        processed: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const results: { integration_id: string; source_type: string; success: boolean; error?: string; total?: number }[] = []

    for (const integration of integrations) {
      const sourceType = integration.type === 'bling_v3' ? 'bling' : 'loja_integrada'

      try {
        // Call rfm-calculator directly via HTTP with service role key
        const calcUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/rfm-calculator`
        const response = await fetch(calcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            integration_id: integration.id,
            source_type: sourceType,
          }),
        })

        const data = await response.json()

        if (!response.ok || data.error) {
          results.push({
            integration_id: integration.id,
            source_type: sourceType,
            success: false,
            error: data.error || `HTTP ${response.status}`,
          })
        } else {
          results.push({
            integration_id: integration.id,
            source_type: sourceType,
            success: true,
            total: data.total_processed,
          })
        }
      } catch (err) {
        results.push({
          integration_id: integration.id,
          source_type: sourceType,
          success: false,
          error: err.message,
        })
      }
    }

    log.info('RFM Cron Trigger results:', JSON.stringify(results))

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    log.error('RFM Cron Trigger error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
