import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

import { createLogger } from '@/lib/logger';
const log = createLogger('useIntegrationStatusChecker');

export interface IntegrationStatus {
  isConnected: boolean;
  isChecking: boolean;
  error?: string;
  state?: string;
}

type StatusMap = Record<string, IntegrationStatus>;

export function useIntegrationStatusChecker() {
  const [statuses, setStatuses] = useState<StatusMap>({});

  const updateStatus = (id: string, status: Partial<IntegrationStatus>) => {
    setStatuses(prev => ({
      ...prev,
      [id]: {
        isConnected: prev[id]?.isConnected ?? true,
        isChecking: prev[id]?.isChecking ?? false,
        ...status,
      }
    }));
  };

  // Evolution WhatsApp - calls evolution-api with status action
  const checkEvolutionWhatsApp = useCallback(async (integrationId: string, instanceName: string) => {
    updateStatus(integrationId, { isChecking: true });

    try {
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: { 
          action: 'status', 
          instanceName,
          integrationId // Pass integrationId to update DB in edge function
        }
      });

      if (error) throw error;

      const state = data?.state || 'unknown';
      const isConnected = data?.isConnected === true;
      const exists = data?.exists !== false;
      
      // Determine the correct status for the database
      let dbStatus = 'disconnected';
      if (isConnected) {
        dbStatus = 'connected';
      } else if (state === 'connecting') {
        dbStatus = 'pending';
      } else if (!exists) {
        dbStatus = 'disconnected';
      }

      // Update database status (edge function already does this, but ensure consistency)
      await supabase
        .from('integrations')
        .update({ status: dbStatus })
        .eq('id', integrationId);

      updateStatus(integrationId, { isConnected, isChecking: false, state });
      return isConnected;
    } catch (error) {
      log.error('[checkEvolutionWhatsApp] Error:', error);
      
      // On error, mark as disconnected
      await supabase
        .from('integrations')
        .update({ status: 'disconnected' })
        .eq('id', integrationId);
        
      updateStatus(integrationId, { isConnected: false, isChecking: false, error: String(error) });
      return false;
    }
  }, []);

  // Loja Integrada - validates API key via integrationId (server-side lookup)
  const checkLojaIntegrada = useCallback(async (integrationId: string) => {
    updateStatus(integrationId, { isChecking: true });

    try {
      const { data, error } = await supabase.functions.invoke('li-validate', {
        body: { integrationId }
      });

      if (error) throw error;

      const isConnected = data?.valid === true;
      
      await supabase
        .from('integrations')
        .update({ status: isConnected ? 'connected' : 'disconnected' })
        .eq('id', integrationId);

      updateStatus(integrationId, { isConnected, isChecking: false });
      return isConnected;
    } catch (error) {
      log.error('[checkLojaIntegrada] Error:', error);
      updateStatus(integrationId, { isConnected: false, isChecking: false, error: String(error) });
      return false;
    }
  }, []);

  // Bling - validates token by checking bling_connections
  const checkBling = useCallback(async (integrationId: string, tenantId: string) => {
    updateStatus(integrationId, { isChecking: true });

    try {
      const { data: connection, error } = await supabase
        .from('bling_connections')
        .select('token_expires_at, status')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      let isConnected = false;
      if (connection) {
        const expiresAt = new Date(connection.token_expires_at);
        // Bling stores status as 'connected', not 'active'
        isConnected = expiresAt > new Date() && connection.status === 'connected';
      }

      await supabase
        .from('integrations')
        .update({ status: isConnected ? 'connected' : 'disconnected' })
        .eq('id', integrationId);

      updateStatus(integrationId, { isConnected, isChecking: false });
      return isConnected;
    } catch (error) {
      log.error('[checkBling] Error:', error);
      updateStatus(integrationId, { isConnected: false, isChecking: false, error: String(error) });
      return false;
    }
  }, []);

  // Melhor Envio - considera conectado quando existe vínculo/token salvo.
  // A expiração é tratada dentro do dialog específico, sem derrubar o card para "desconectado".
  const checkMelhorEnvio = useCallback(async (integrationId: string, tenantId: string) => {
    updateStatus(integrationId, { isChecking: true });

    try {
      const { data: token, error } = await supabase
        .from('melhor_envio_tokens')
        .select('id, expires_at')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      const isConnected = Boolean(token?.id);

      await supabase
        .from('integrations')
        .update({ status: isConnected ? 'connected' : 'disconnected' })
        .eq('id', integrationId);

      updateStatus(integrationId, { isConnected, isChecking: false });
      return isConnected;
    } catch (error) {
      log.error('[checkMelhorEnvio] Error:', error);
      updateStatus(integrationId, { isConnected: false, isChecking: false, error: String(error) });
      return false;
    }
  }, []);

  // Meta removed - stub for backward compat
  const checkMeta = useCallback(async (_integrationId: string, _tenantId: string) => {
    return false;
  }, []);

  // AI Providers - checks via server-side manage-credentials function
  const checkAIProvider = useCallback(async (integrationId: string, tenantId: string, provider: string) => {
    updateStatus(integrationId, { isChecking: true });

    try {
      const { data, error } = await supabase.functions.invoke('manage-credentials', {
        body: { action: 'provider-status', provider },
      });

      if (error) throw error;

      const isConnected = data?.isConnected ?? false;

      await supabase
        .from('integrations')
        .update({ status: isConnected ? 'connected' : 'disconnected' })
        .eq('id', integrationId);

      updateStatus(integrationId, { isConnected, isChecking: false });
      return isConnected;
    } catch (error) {
      log.error('[checkAIProvider] Error:', error);
      updateStatus(integrationId, { isConnected: false, isChecking: false, error: String(error) });
      return false;
    }
  }, []);

  // Check all integrations based on type
  const checkAllIntegrations = useCallback(async (
    integrations: Array<{
      id: string;
      type: string;
      api_key?: string | null;
      metadata?: unknown;
      tenant_id?: string;
    }>,
    tenantId: string
  ) => {
    const promises = integrations.map(async (integration) => {
      const meta = integration.metadata as any | null;
      const tid = integration.tenant_id || tenantId;

      switch (integration.type) {
        case 'evolution_whatsapp':
          if (meta?.instanceName) {
            return checkEvolutionWhatsApp(integration.id, meta.instanceName as string);
          }
          break;

        case 'loja_integrada':
          return checkLojaIntegrada(integration.id);

        case 'bling':
          return checkBling(integration.id, tid);

        case 'melhor_envio':
          return checkMelhorEnvio(integration.id, tid);


        case 'ai_openai':
          return checkAIProvider(integration.id, tid, 'openai');

        case 'ai_google':
          return checkAIProvider(integration.id, tid, 'google');

        case 'ai_groq':
          return checkAIProvider(integration.id, tid, 'groq');

        case 'ai_mistral':
          return checkAIProvider(integration.id, tid, 'mistral');
      }
      return null;
    });

    await Promise.all(promises);
  }, [checkEvolutionWhatsApp, checkLojaIntegrada, checkBling, checkMelhorEnvio, checkMeta, checkAIProvider]);

  return {
    statuses,
    checkEvolutionWhatsApp,
    checkLojaIntegrada,
    checkBling,
    checkMelhorEnvio,
    checkMeta,
    checkAIProvider,
    checkAllIntegrations,
    getStatus: (id: string) => statuses[id],
  };
}
