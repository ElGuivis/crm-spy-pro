/**
 * Store Integration Helpers for AI Chat
 * Extracted from ai-chat/index.ts for maintainability.
 */

import type { ServiceClient } from "./supabase-types.ts";
import { createLogger } from "./correlation.ts";
const log = createLogger("ai-chat-store", "shared");


export interface StoreIntegrationInfo {
  type: 'bling' | 'loja_integrada';
  integrationId: string;
  tables: {
    orders: string;
    orderItems: string;
    customers: string;
    products: string;
  };
  fields: {
    cpf: string;
    customerPhone: string;
    orderTracking: string;
  };
}

interface IntegrationRow {
  id: string;
  type: string;
}

interface OrderWithTracking {
  etiqueta?: { codigo?: string } | null;
  volumes?: Array<{ codigoRastreamento?: string }> | null;
  codigo_rastreio?: string | null;
  [key: string]: unknown;
}

export async function getStoreIntegration(
  supabase: ServiceClient,
  tenantId: string,
  storeIntegrationId?: string | null
): Promise<StoreIntegrationInfo | null> {
  let integration: IntegrationRow | null = null;

  // If agent has a specific store configured, use that
  if (storeIntegrationId) {
    const { data } = await supabase
      .from('integrations')
      .select('id, type')
      .eq('id', storeIntegrationId)
      .eq('status', 'connected')
      .single();
    integration = data as IntegrationRow | null;
  }

  // Fallback: find first active store integration
  if (!integration) {
    const { data } = await supabase
      .from('integrations')
      .select('id, type')
      .eq('tenant_id', tenantId)
      .in('type', ['loja_integrada', 'bling'])
      .eq('status', 'connected')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    integration = data as IntegrationRow | null;
  }

  if (!integration) {
    log.info('⚠️ No store integration found');
    return null;
  }

  const isBling = integration.type === 'bling';

  return {
    type: isBling ? 'bling' : 'loja_integrada',
    integrationId: integration.id,
    tables: {
      orders: isBling ? 'bling_orders' : 'li_orders',
      orderItems: isBling ? 'bling_order_items' : 'li_order_items',
      customers: isBling ? 'bling_customers' : 'li_customers',
      products: isBling ? 'bling_products' : 'li_products',
    },
    fields: {
      cpf: isBling ? 'cliente_cpf_cnpj' : 'cliente_cpf',
      customerPhone: isBling ? 'celular' : 'telefone_celular',
      orderTracking: isBling ? 'etiqueta' : 'codigo_rastreio',
    },
  };
}

/** Extract tracking code from order based on integration type */
export function getTrackingCode(order: OrderWithTracking, storeInfo: StoreIntegrationInfo): string {
  if (storeInfo.type === 'bling') {
    if (order.etiqueta?.codigo) return order.etiqueta.codigo;
    if (order.volumes && Array.isArray(order.volumes)) {
      for (const vol of order.volumes) {
        if (vol.codigoRastreamento) return vol.codigoRastreamento;
      }
    }
    return '';
  }
  return (order.codigo_rastreio as string) || '';
}

/** Get customer CPF from order */
export function getOrderCpf(order: Record<string, unknown>, storeInfo: StoreIntegrationInfo): string {
  const cpfField = storeInfo.fields.cpf;
  return ((order[cpfField] as string) || '').replace(/\D/g, '');
}
