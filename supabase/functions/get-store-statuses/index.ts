import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
type ServiceClient = ReturnType<typeof createClient>;
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const BLING_API_BASE = 'https://www.bling.com.br/Api/v3';
const CACHE_TTL_HOURS = 24;

async function ensureValidToken(supabase: ServiceClient, connection: Record<string, unknown>): Promise<string> {
  return ensureBlingToken(supabase, connection, '[get-store-statuses]');
}

// Fetch Bling situacoes from API and cache them
async function fetchAndCacheBlingSituacoes(
  supabase: ServiceClient,
  accessToken: string,
  tenantId: string,
  integrationId: string
): Promise<{ id: number; name: string; color?: string }[]> {
  try {
    // 1. Get all situacoes modules
    log.info('[get-store-statuses] Fetching Bling situacoes modules...');
    const modulosResp = await fetch(`${BLING_API_BASE}/situacoes/modulos`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    if (!modulosResp.ok) {
      log.error('[get-store-statuses] Failed to fetch situacoes modules:', modulosResp.status);
      return [];
    }

    const modulosData = await modulosResp.json();
    const modulos = modulosData.data || [];
    log.info('[get-store-statuses] Found modules:', modulos.map((m: Record<string, unknown>) => m.nome));

    // 2. Find "Vendas" module (ID 98 is typically Vendas in Bling)
    const moduloVendas = modulos.find((m: Record<string, unknown>) => 
      m.id === 98 || 
      m.nome?.toLowerCase().includes('venda') || 
      m.descricao?.toLowerCase().includes('venda')
    );

    if (!moduloVendas) {
      log.info('[get-store-statuses] Vendas module not found, trying first module...');
      // If no Vendas module, try first module or return empty
      if (modulos.length === 0) return [];
    }

    const targetModuloId = moduloVendas?.id || modulos[0]?.id;
    const targetModuloNome = moduloVendas?.nome || modulos[0]?.nome;
    log.info(`[get-store-statuses] Using module: ${targetModuloNome} (ID: ${targetModuloId})`);

    // 3. Fetch situacoes for the module
    const situacoesResp = await fetch(`${BLING_API_BASE}/situacoes/modulos/${targetModuloId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    if (!situacoesResp.ok) {
      log.error('[get-store-statuses] Failed to fetch situacoes:', situacoesResp.status);
      return [];
    }

    const situacoesData = await situacoesResp.json();
    const situacoes = situacoesData.data || [];
    log.info(`[get-store-statuses] Found ${situacoes.length} situacoes`);

    // 4. Cache them in database
    if (situacoes.length > 0) {
      for (const sit of situacoes) {
        await supabase.from('bling_situacoes').upsert({
          tenant_id: tenantId,
          integration_id: integrationId,
          situacao_id: sit.id,
          nome: sit.nome,
          id_herdado: sit.idHerdado || null,
          cor: sit.cor || null,
          modulo_id: targetModuloId,
          modulo_nome: targetModuloNome,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'integration_id,situacao_id' });
      }
      log.info(`[get-store-statuses] Cached ${situacoes.length} situacoes`);
    }

    return situacoes.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.nome,
      color: s.cor || null
    }));
  } catch (error) {
    log.error('[get-store-statuses] Error fetching Bling situacoes:', error);
    return [];
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("get-store-statuses", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { integration_id } = await req.json();

    if (!integration_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'integration_id is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const integration = await requireResource<{ id: string; tenant_id: string; type: string }>(
      supabase, "integrations", integration_id, authTenantId, req,
      "id, tenant_id, type"
    );

    let statuses: { id: number | null; name: string; color?: string | null }[] = [];

    if (integration.type === 'loja_integrada') {
      // FIX: Use predefined Loja Integrada statuses + any custom ones from orders
      // These are the standard LI statuses that may not have orders yet
      const defaultLIStatuses = [
        { id: 1, name: 'Pedido Novo' },
        { id: 2, name: 'Pedido Pago' },
        { id: 3, name: 'Pagamento em Análise' },
        { id: 4, name: 'Pagamento Devolvido' },
        { id: 5, name: 'Pedido em Separação' },
        { id: 6, name: 'Pedido Enviado' },
        { id: 7, name: 'Pedido Entregue' },
        { id: 8, name: 'Pedido Cancelado' },
        { id: 9, name: 'Aguardando Pagamento' },
        { id: 10, name: 'Pagamento Recusado' },
        { id: 11, name: 'Preparando Envio' },
        { id: 12, name: 'Pronto para Retirada' },
      ];
      
      const statusMap = new Map<string, { id: number | null; name: string }>();
      
      // Add default statuses first
      for (const status of defaultLIStatuses) {
        statusMap.set(status.name, status);
      }
      
      // Then fetch any additional/custom statuses from existing orders
      const { data: orders, error: ordersError } = await supabase
        .from('li_orders')
        .select('status_id, status_name')
        .eq('integration_id', integration_id)
        .not('status_name', 'is', null);

      if (!ordersError && orders) {
        for (const order of orders) {
          if (order.status_name && !statusMap.has(order.status_name)) {
            statusMap.set(order.status_name, {
              id: order.status_id || null,
              name: order.status_name,
            });
          }
        }
      }

      statuses = Array.from(statusMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name, 'pt-BR')
      );
    } else if (integration.type === 'nuvem_shop') {
      // Default Nuvemshop statuses
      statuses = [
        { id: 1, name: 'Aberto' },
        { id: 2, name: 'Fechado' },
        { id: 3, name: 'Cancelado' },
        { id: 4, name: 'Aguardando Pagamento' },
        { id: 5, name: 'Pago' },
        { id: 6, name: 'Em Preparação' },
        { id: 7, name: 'Enviado' },
        { id: 8, name: 'Entregue' },
      ];
    } else if (integration.type === 'bling') {
      // Try to get cached situacoes first
      const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();
      
      const { data: cachedSituacoes, error: cacheError } = await supabase
        .from('bling_situacoes')
        .select('situacao_id, nome, cor')
        .eq('integration_id', integration_id)
        .gte('synced_at', cacheThreshold);

      if (!cacheError && cachedSituacoes && cachedSituacoes.length > 0) {
        log.info(`[get-store-statuses] Using ${cachedSituacoes.length} cached situacoes`);
        statuses = cachedSituacoes.map(s => ({
          id: s.situacao_id,
          name: s.nome,
          color: s.cor
        }));
      } else {
        // Cache empty or expired - fetch from Bling API
        log.info('[get-store-statuses] Cache miss, fetching from Bling API...');
        
        // Get Bling connection for this tenant
        const { data: connection, error: connError } = await supabase
          .from('bling_connections')
          .select('id, access_token_encrypted, refresh_token_encrypted, token_expires_at')
          .eq('tenant_id', integration.tenant_id)
          .eq('status', 'active')
          .maybeSingle();

        if (!connError && connection) {
          try {
            const accessToken = await ensureValidToken(supabase, connection);
            statuses = await fetchAndCacheBlingSituacoes(
              supabase, 
              accessToken, 
              integration.tenant_id, 
              integration_id
            );
          } catch (tokenError) {
            log.error('[get-store-statuses] Token error:', tokenError);
          }
        }

        // Fallback: if API call failed, get unique situacoes from orders
        if (statuses.length === 0) {
          log.info('[get-store-statuses] Falling back to unique situacoes from orders...');
          
          const { data: orders } = await supabase
            .from('bling_orders')
            .select('situacao_id, situacao_nome')
            .eq('integration_id', integration_id)
            .not('situacao_id', 'is', null);

          if (orders && orders.length > 0) {
            const statusMap = new Map<number, string>();
            
            for (const order of orders) {
              if (order.situacao_id && !statusMap.has(order.situacao_id)) {
                // Use situacao_nome if available, otherwise use situacao_id
                statusMap.set(order.situacao_id, order.situacao_nome || `Status ${order.situacao_id}`);
              }
            }

            statuses = Array.from(statusMap.entries()).map(([id, name]) => ({
              id,
              name,
              color: null
            })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
          }
        }

        // Last resort: provide default Bling statuses
        if (statuses.length === 0) {
          log.info('[get-store-statuses] Using default Bling statuses');
          statuses = [
            { id: 0, name: 'Em aberto' },
            { id: 1, name: 'Atendido' },
            { id: 2, name: 'Cancelado' },
            { id: 3, name: 'Em andamento' },
            { id: 4, name: 'Venda Agenciada' },
            { id: 5, name: 'Pronto para envio' },
            { id: 6, name: 'Enviado' },
            { id: 7, name: 'Entregue' },
          ];
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      statuses,
      integration_type: integration.type,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Get store statuses error:', errorMessage);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
