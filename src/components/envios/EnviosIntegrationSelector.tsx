import { useState } from 'react';
import { Truck } from 'lucide-react';
import { useIntegrationData } from '@/hooks/useIntegrationData';
import { IntegrationSelector } from '@/components/integrations/IntegrationSelector';
import { MelhorEnvioDialog } from '@/components/integrations/MelhorEnvioDialog';

interface EnviosIntegrationSelectorProps {
  onSelectIntegration: (integrationId: string) => void;
}

export function EnviosIntegrationSelector({ onSelectIntegration }: EnviosIntegrationSelectorProps) {
  const { integrations, isLoading, refetch } = useIntegrationData({ category: 'shipping' });
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleAddSuccess = () => {
    refetch();
    setShowAddDialog(false);
  };

  return (
    <>
      <IntegrationSelector
        category="shipping"
        title="Contas de Envio"
        description="Selecione uma conta para visualizar seus envios"
        emptyStateMessage="Conecte uma conta do Melhor Envio para gerenciar seus envios."
        emptyStateIcon={<Truck className="h-8 w-8 text-muted-foreground" />}
        integrations={integrations}
        isLoading={isLoading}
        onSelectIntegration={onSelectIntegration}
        onAddIntegration={() => setShowAddDialog(true)}
        addButtonText="Conectar Conta"
        addButtonDescription="Melhor Envio"
        onIntegrationDeleted={refetch}
      />

      <MelhorEnvioDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) refetch();
        }}
      />
    </>
  );
}
