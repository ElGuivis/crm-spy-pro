import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import { StoreType, ExistingIntegration, STORE_TYPES } from '@/components/sales/add-store-types';

const log = createLogger('AddStoreConnectionDialog');

export function useAddStoreConnection(open: boolean, onSelectIntegration: (id: string) => void, onSuccess: () => void, onOpenChange: (open: boolean) => void) {
  const [step, setStep] = useState<'select' | 'create' | 'configure'>('select');
  const [existingIntegrations, setExistingIntegrations] = useState<ExistingIntegration[]>([]);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(true);
  const [selectedType, setSelectedType] = useState<StoreType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({ name: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetchExistingIntegrations();
      setStep('select');
      setSelectedType(null);
      setFormData({ name: '' });
    }
  }, [open]);

  const fetchExistingIntegrations = async () => {
    setIsLoadingIntegrations(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tenantId } = await supabase.rpc('get_user_tenant_id', { _user_id: user.id });
      if (!tenantId) return;

      const { data: integrations } = await supabase
        .from('integrations')
        .select('id, name, type, status')
        .eq('tenant_id', tenantId)
        .in('type', ['loja_integrada', 'bling', 'nuvemshop']);

      if (integrations) {
        const integrationsWithStats = await Promise.all(
          integrations.map(async (integration) => {
            const { count } = await supabase
              .from('li_orders')
              .select('id', { count: 'exact', head: true })
              .eq('integration_id', integration.id);
            return { ...integration, ordersCount: count || 0 };
          })
        );
        setExistingIntegrations(integrationsWithStats);
      }
    } catch (error) {
      log.error('Error fetching integrations:', error);
    } finally {
      setIsLoadingIntegrations(false);
    }
  };

  const handleSelectExisting = (integrationId: string) => {
    onSelectIntegration(integrationId);
    onOpenChange(false);
  };

  const handleSelectType = (type: StoreType) => {
    setSelectedType(type);
    setFormData({ name: type.name });
    setStep('configure');
  };

  const handleSave = async () => {
    if (!selectedType) return;

    const apiKey = formData.api_key?.trim();
    if (!apiKey) {
      toast.error('Por favor, preencha a API Key');
      return;
    }

    setIsSaving(true);
    try {
      if (selectedType.id === 'loja_integrada') {
        const { data: validationResult, error: validationError } = await supabase.functions.invoke('li-validate', {
          body: { apiKey }
        });
        if (validationError || !validationResult?.valid) {
          toast.error(validationResult?.error || 'Personal Token inválido');
          setIsSaving(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: tenantId } = await supabase.rpc('get_user_tenant_id', { _user_id: user.id });
      if (!tenantId) throw new Error('Tenant não encontrado');

      const { data: newIntegration, error } = await supabase
        .from('integrations')
        .insert({
          name: formData.name || selectedType.name,
          type: selectedType.id,
          api_key: apiKey,
          tenant_id: tenantId,
          status: 'connected'
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Loja conectada! Sincronização iniciada em segundo plano.');

      if (selectedType.id === 'loja_integrada') {
        supabase.functions.invoke('li-sync', {
          body: { integrationId: newIntegration.id, syncType: 'all' }
        }).catch(err => log.error('Initial sync error:', err));
      }

      onSuccess();
      onSelectIntegration(newIntegration.id);
      onOpenChange(false);
    } catch (error) {
      log.error('Error creating integration:', error);
      toast.error('Erro ao conectar loja');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    step, setStep,
    existingIntegrations,
    isLoadingIntegrations,
    selectedType,
    formData, setFormData,
    isSaving,
    handleSelectExisting,
    handleSelectType,
    handleSave,
    STORE_TYPES,
  };
}
