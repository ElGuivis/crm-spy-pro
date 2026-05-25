import { Store, Plus, Loader2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STORE_TYPES, getStoreColor } from './add-store-types';
import { useAddStoreConnection } from '@/hooks/useAddStoreConnection';

interface AddStoreConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectIntegration: (integrationId: string) => void;
  onSuccess: () => void;
}

function StoreLogo({ type, logo }: { type?: string; logo?: string }) {
  if (logo) {
    return (
      <>
        <img src={logo} alt={type || ''} className="h-6 w-6 object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden'); }} />
        <Store className="h-5 w-5 hidden" />
      </>
    );
  }
  return <Store className="h-5 w-5" />;
}

export function AddStoreConnectionDialog({ open, onOpenChange, onSelectIntegration, onSuccess }: AddStoreConnectionDialogProps) {
  const {
    step, setStep,
    existingIntegrations,
    isLoadingIntegrations,
    selectedType,
    formData, setFormData,
    isSaving,
    handleSelectExisting,
    handleSelectType,
    handleSave,
  } = useAddStoreConnection(open, onSelectIntegration, onSuccess, onOpenChange);

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
            isLoadingIntegrations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {existingIntegrations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Lojas Existentes</p>
                    {existingIntegrations.map((integration) => (
                      <button key={integration.id} onClick={() => handleSelectExisting(integration.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left">
                        <div className={`p-2 rounded-lg ${getStoreColor(integration.type)}`}>
                          <StoreLogo logo={STORE_TYPES.find(s => s.id === integration.type)?.logo} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{integration.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {STORE_TYPES.find(s => s.id === integration.type)?.name} • {integration.ordersCount} pedidos
                          </p>
                        </div>
                        {integration.status === 'connected' && <Check className="h-4 w-4 text-green-500" />}
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={() => setStep('create')}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-dashed hover:border-primary hover:bg-accent transition-colors">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary"><Plus className="h-5 w-5" /></div>
                  <div className="flex-1 text-left">
                    <p className="font-medium">Criar Nova Conexão</p>
                    <p className="text-sm text-muted-foreground">Loja Integrada, Bling, Nuvem Shop...</p>
                  </div>
                </button>
              </>
            )
          )}

          {step === 'create' && (
            <div className="space-y-2">
              {STORE_TYPES.map((storeType) => (
                <button key={storeType.id} onClick={() => handleSelectType(storeType)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left">
                  <div className={`p-2 rounded-lg ${storeType.color}`}>
                    <StoreLogo logo={storeType.logo} type={storeType.name} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{storeType.name}</p>
                    <p className="text-sm text-muted-foreground">{storeType.description}</p>
                  </div>
                </button>
              ))}
              <Button variant="ghost" onClick={() => setStep('select')} className="w-full mt-2">Voltar</Button>
            </div>
          )}

          {step === 'configure' && selectedType && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-3 rounded-lg bg-muted/50`}>
                <div className={`p-2 rounded-lg ${selectedType.color}`}>
                  <StoreLogo logo={selectedType.logo} type={selectedType.name} />
                </div>
                <div>
                  <p className="font-medium">{selectedType.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedType.description}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Loja</Label>
                  <Input id="name" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ex: Minha Loja Principal" />
                </div>
                {selectedType.fields.map((field) => (
                  <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input id={field.name} type={field.type} value={formData[field.name] || ''} onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })} placeholder={field.placeholder} />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep('create')} className="flex-1">Voltar</Button>
                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                  {isSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Conectando...</> : 'Conectar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
