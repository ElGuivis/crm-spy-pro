import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { createLogger } from '@/lib/logger';
const log = createLogger('useIntegrationData');

export type IntegrationCategory = 'ecommerce' | 'whatsapp' | 'shipping' | 'ai' | 'email';

export interface LastSyncByType {
  orders?: string | null;
  customers?: string | null;
  products?: string | null;
  carts?: string | null;
}

export interface IntegrationData {
  id: string;
  name: string;
  type: string;
  status: string;
  category: IntegrationCategory;
  lastSyncAt: string | null;
  lastSyncByType: LastSyncByType;
  initialSyncCompleted: boolean;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  stats: {
    orders?: number;
    customers?: number;
    products?: number;
    carts?: number;
    coupons?: number;
    shipments?: number;
    conversations?: number;
    unreadCount?: number;
  };
}

const categoryMapping: Record<string, IntegrationCategory> = {
  loja_integrada: 'ecommerce',
  bling: 'ecommerce',
  nuvem_shop: 'ecommerce',
  evolution_whatsapp: 'whatsapp',
  whatsapp_official: 'whatsapp',
  melhor_envio: 'shipping',
  ai_openai: 'ai',
  ai_google: 'ai',
  chatwoot: 'whatsapp',
};

const categoryTypes: Record<IntegrationCategory, string[]> = {
  ecommerce: ['loja_integrada', 'bling', 'nuvem_shop'],
  whatsapp: ['evolution_whatsapp', 'whatsapp_official', 'chatwoot'],
  shipping: ['melhor_envio'],
  ai: ['ai_openai', 'ai_google'],
  email: ['smtp', 'ses', 'sendgrid'],
};

export function getCategoryFromType(type: string): IntegrationCategory {
  return categoryMapping[type] || 'ecommerce';
}

export function getTypesForCategory(category: IntegrationCategory): string[] {
  return categoryTypes[category] || [];
}

interface UseIntegrationDataOptions {
  category: IntegrationCategory;
}

export function useIntegrationData({ category }: UseIntegrationDataOptions) {
  const { tenantId } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchIntegrations = useCallback(async () => {
    if (!tenantId) {
      setIntegrations([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const types = getTypesForCategory(category);

      // Fetch integrations by type with new columns
      const { data: integrationsData, error: intError } = await supabase
        .from('integrations')
        .select('id, tenant_id, type, name, status, api_key, metadata, bling_store_ids, store_integration_id, auto_sync_enabled, auto_sync_interval_minutes, last_sync_at, last_orders_sync_at, last_products_sync_at, last_customers_sync_at, error_message, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .in('type', types)
        .order('created_at', { ascending: false });

      if (intError) throw intError;

      if (!integrationsData || integrationsData.length === 0) {
        setIntegrations([]);
        setIsLoading(false);
        return;
      }

      const integrationIds = integrationsData.map(i => i.id);

      // Build stats map
      const statsByIntegration: Record<string, IntegrationData['stats']> = {};
      integrationIds.forEach(id => {
        statsByIntegration[id] = {};
      });

      // Fetch stats based on category - using count: 'exact' to get real counts beyond 1000 limit
      if (category === 'ecommerce') {
        // Get real counts for each integration using count queries
        const countPromises = integrationIds.flatMap(integrationId => [
          supabase.from('li_orders').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ type: 'orders', integrationId, count: r.count || 0 })),
          supabase.from('li_customers').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ type: 'customers', integrationId, count: r.count || 0 })),
          supabase.from('li_products').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ type: 'products', integrationId, count: r.count || 0 })),
          supabase.from('generated_coupons').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ type: 'coupons', integrationId, count: r.count || 0 })),
        ]);
        
        // Also check Bling tables for Bling integrations
        const blingIntegrations = integrationsData.filter(i => i.type === 'bling').map(i => i.id);
        if (blingIntegrations.length > 0) {
          blingIntegrations.forEach(integrationId => {
            countPromises.push(
              supabase.from('bling_orders').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ type: 'orders', integrationId, count: r.count || 0 })),
              supabase.from('bling_customers').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ type: 'customers', integrationId, count: r.count || 0 })),
              supabase.from('bling_products').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ type: 'products', integrationId, count: r.count || 0 }))
            );
          });
        }
        
        const countResults = await Promise.all(countPromises);
        
        countResults.forEach(({ type, integrationId, count }) => {
          if (type === 'orders') {
            statsByIntegration[integrationId].orders = (statsByIntegration[integrationId].orders || 0) + count;
          } else if (type === 'customers') {
            statsByIntegration[integrationId].customers = (statsByIntegration[integrationId].customers || 0) + count;
          } else if (type === 'products') {
            statsByIntegration[integrationId].products = (statsByIntegration[integrationId].products || 0) + count;
          } else if (type === 'carts') {
            statsByIntegration[integrationId].carts = (statsByIntegration[integrationId].carts || 0) + count;
          } else if (type === 'coupons') {
            statsByIntegration[integrationId].coupons = (statsByIntegration[integrationId].coupons || 0) + count;
          }
        });
      } else if (category === 'shipping') {
        const countResults = await Promise.all(
          integrationIds.map(integrationId =>
            supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).then(r => ({ integrationId, count: r.count || 0 }))
          )
        );
        
        countResults.forEach(({ integrationId, count }) => {
          statsByIntegration[integrationId].shipments = count;
        });
      } else if (category === 'whatsapp') {
        const countResults = await Promise.all(
          integrationIds.map(integrationId =>
            supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('integration_id', integrationId).then(r => ({ integrationId, count: r.count || 0 }))
          )
        );
        
        countResults.forEach(({ integrationId, count }) => {
          statsByIntegration[integrationId].conversations = count;
        });
      }

      // Helper function to get the most recent sync date
      const getMostRecentSync = (integration: any): string | null => {
        const dates = [
          integration.last_sync_at,
          integration.last_sync_orders_at,
          integration.last_sync_products_at,
          integration.last_sync_customers_at,
        ].filter(Boolean);
        
        if (dates.length === 0) return null;
        
        return dates.reduce((latest, current) => {
          return new Date(current) > new Date(latest) ? current : latest;
        });
      };

      // Map integrations to IntegrationData
      const integrationsList: IntegrationData[] = integrationsData.map(integration => ({
        id: integration.id,
        name: integration.name,
        type: integration.type,
        status: integration.status,
        category: getCategoryFromType(integration.type),
        lastSyncAt: getMostRecentSync(integration),
        lastSyncByType: {
          orders: (integration as any).last_sync_orders_at || null,
          customers: (integration as any).last_sync_customers_at || null,
          products: (integration as any).last_sync_products_at || null,
          carts: (integration as any).last_carts_sync_at || null,
        },
        initialSyncCompleted: (integration as any).initial_sync_completed || false,
        createdAt: integration.created_at,
        metadata: integration.metadata as any | null,
        stats: statsByIntegration[integration.id] || {},
      }));

      setIntegrations(integrationsList);
    } catch (error) {
      log.error('Error fetching integrations:', error);
      setIntegrations([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, category]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Subscribe to integration changes
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`integrations-${category}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'integrations',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          fetchIntegrations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, category, fetchIntegrations]);

  return {
    integrations,
    isLoading,
    refetch: fetchIntegrations,
  };
}
