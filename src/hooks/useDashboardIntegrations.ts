import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getIntegrationLogoUrl } from '@/lib/integration-logos';
import { createLogger } from '@/lib/logger';

const logger = createLogger('Dashboard');

export interface Integration {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'pending' | 'disconnected';
  description: string;
  logo: string;
}

const integrationNames: Record<string, string> = {
  'loja_integrada': 'Loja Integrada',
  'whatsapp': 'WhatsApp Business',
  'evolution': 'WhatsApp (Evolution)',
  'melhor_envio': 'Melhor Envio',
  'nuvemshop': 'Nuvem Shop',
  'chatwoot': 'Chatwoot',
  'email': 'Email',
  'bling': 'Bling ERP',
};

export function useDashboardIntegrations() {
  const { tenantId } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    const fetchIntegrations = async () => {
      try {
        const { data } = await supabase.from('integrations').select('id, name, type, status').eq('tenant_id', tenantId).order('created_at', { ascending: false });
        if (data) {
          const mappedIntegrations: Integration[] = data.map(int => ({
            id: int.id,
            name: int.name || integrationNames[int.type] || int.type,
            type: int.type,
            status: int.status === 'connected' ? 'connected' : int.status === 'error' ? 'disconnected' : 'pending',
            description: int.status === 'connected' ? 'Conexão ativa' : int.status === 'error' ? 'Erro na conexão' : 'Pendente de configuração',
            logo: getIntegrationLogoUrl(int.type) || 'https://cdn-icons-png.flaticon.com/512/2920/2920277.png',
          }));
          setIntegrations(mappedIntegrations);
        }
      } catch (error) {
        logger.error('Error fetching integrations', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchIntegrations();
  }, [tenantId]);

  return { integrations, isLoading };
}
