import { useState, useEffect } from 'react';
import { Store, Plus, Loader2, Check, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { createLogger } from '@/lib/logger';
const log = createLogger('AddStoreConnectionDialog');

interface StoreType {
  id: string;
  name: string;
  description: string;
  logo?: string;
  color: string;
  fields: { name: string; label: string; placeholder: string; type: string }[];
}

const STORE_TYPES: StoreType[] = [
  {
    id: 'loja_integrada',
    name: 'Loja Integrada',
    description: 'Sincronização automática de pedidos, produtos e clientes',
    logo: 'https://static.lojaintegrada.com.br/img/logo-li.svg',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    fields: [
      { name: 'api_key', label: 'API Key', placeholder: 'Sua chave de API', type: 'password' }
    ]
  },
  {
    id: 'bling',
    name: 'Bling',
    description: 'ERP completo para e-commerce',
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    fields: [
      { name: 'api_key', label: 'API Key', placeholder: 'Sua chave de API do Bling', type: 'password' }
    ]
  },
  {
    id: 'nuvem_shop',
    name: 'Nuvem Shop',
    description: 'Plataforma de e-commerce completa',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    fields: [
      { name: 'api_key', label: 'Access Token', placeholder: 'Seu access token', type: 'password' }
    ]
  }
];

interface ExistingIntegration {
  id: string;
  name: string;
  type: string;
  status: string;
  ordersCount?: number;
}

interface AddStoreConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectIntegration: (integrationId: string) => void;
  onSuccess: () => void;
}

export function AddStoreConnectionDialog({ 
  open, 
  onOpenChange, 
  onSelectIntegration,
  onSuccess 
}: AddStoreConnectionDialogProps) {
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

      // Use the database function to get tenant_id
      const { data: tenantId } = await supabase
        .rpc('get_user_tenant_id', { _user_id: user.id });

      if (!tenantId) return;

      const ecommerceTypes = ['loja_integrada', 'bling', 'nuvem_shop'];
      
      const { data: integrations } = await supabase
        .from('integrations')
        .select('id, name, type, status')
        .eq('tenant_id', tenantId)
        .in('type', ecommerceTypes);

      if (integrations) {
        // Fetch order counts for each integration
        const integrationsWithStats = await Promise.all(
          integrations.map(async (integration) => {
            const { count } = await supabase
              .from('li_orders')
              .select('id', { count: 'exact', head: true })
              .eq('integration_id', integration.id);
            
            return {
              ...integration,
              ordersCount: count || 0
            };
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
      // Validate API key for Loja Integrada
      if (selectedType.id === 'loja_integrada') {
        const { data: validationResult, error: validationError } = await supabase.functions.invoke('li-validate', {
          body: { apiKey }
        });

        if (validationError || !validationResult?.valid) {
          toast.error(validationResult?.error || 'API Key inválida');
          setIsSaving(false);
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Use the database function to get tenant_id
      const { data: tenantId } = await supabase
        .rpc('get_user_tenant_id', { _user_id: user.id });

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
      
      // Disparar sincronização inicial para todos os tipos de dados
      if (selectedType.id === 'loja_integrada') {
        // Sync all data types in background
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

  const getStoreIcon = (type: string) => {
    const storeType = STORE_TYPES.find(s => s.id === type);
    if (storeType?.logo) {
      return (
        <img 
          src={storeType.logo} 
          alt={storeType.name} 
          className="h-6 w-6 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
      );
    }
    return <Store className="h-5 w-5" />;
  };

  const getStoreColor = (type: string) => {
    return STORE_TYPES.find(s => s.id === type)?.color || 'bg-muted text-muted-foreground';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'select' && 'Conectar Loja'}
            {step === 'create' && 'Escolher Plataforma'}
            {step === 'configure' && `Configurar ${selectedType?.name}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Selecione uma loja existente ou crie uma nova conexão'}
            {step === 'create' && 'Escolha a plataforma de e-commerce que deseja conectar'}
            {step === 'configure' && 'Preencha as credenciais para conectar sua loja'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === 'select' && (
            <>
              {isLoadingIntegrations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {existingIntegrations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Lojas Existentes</p>
                      {existingIntegrations.map((integration) => (
                        <button
                          key={integration.id}
                          onClick={() => handleSelectExisting(integration.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                        >
                          <div className={`p-2 rounded-lg ${getStoreColor(integration.type)}`}>
                            {getStoreIcon(integration.type)}
                            <Store className="h-5 w-5 hidden" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{integration.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {STORE_TYPES.find(s => s.id === integration.type)?.name} • {integration.ordersCount} pedidos
                            </p>
                          </div>
                          {integration.status === 'connected' && (
                            <Check className="h-4 w-4 text-green-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setStep('create')}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-dashed hover:border-primary hover:bg-accent transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium">Criar Nova Conexão</p>
                      <p className="text-sm text-muted-foreground">
                        Loja Integrada, Bling, Nuvem Shop...
                      </p>
                    </div>
                  </button>
                </>
              )}
            </>
          )}

          {step === 'create' && (
            <div className="space-y-2">
              {STORE_TYPES.map((storeType) => (
                <button
                  key={storeType.id}
                  onClick={() => handleSelectType(storeType)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                >
                  <div className={`p-2 rounded-lg ${storeType.color}`}>
                    {storeType.logo ? (
                      <>
                        <img 
                          src={storeType.logo} 
                          alt={storeType.name} 
                          className="h-6 w-6 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                        <Store className="h-5 w-5 hidden" />
                      </>
                    ) : (
                      <Store className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{storeType.name}</p>
                    <p className="text-sm text-muted-foreground">{storeType.description}</p>
                  </div>
                </button>
              ))}

              <Button 
                variant="ghost" 
                onClick={() => setStep('select')}
                className="w-full mt-2"
              >
                Voltar
              </Button>
            </div>
          )}

          {step === 'configure' && selectedType && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className={`p-2 rounded-lg ${selectedType.color}`}>
                  {selectedType.logo ? (
                    <>
                      <img 
                        src={selectedType.logo} 
                        alt={selectedType.name} 
                        className="h-6 w-6 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <Store className="h-5 w-5 hidden" />
                    </>
                  ) : (
                    <Store className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{selectedType.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedType.description}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Loja</Label>
                  <Input
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Minha Loja Principal"
                  />
                </div>

                {selectedType.fields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input
                      id={field.name}
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep('create')}
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    'Conectar'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
