import { useState } from 'react';
import { Users } from 'lucide-react';
import { useIntegrationData } from '@/hooks/useIntegrationData';
import { IntegrationSelector } from '@/components/integrations/IntegrationSelector';
import { AddIntegrationDialog } from '@/components/integrations/AddIntegrationDialog';

interface ClientsIntegrationSelectorProps {
  onSelectIntegration: (integrationId: string) => void;
}

export function ClientsIntegrationSelector({ onSelectIntegration }: ClientsIntegrationSelectorProps) {
  const { integrations, isLoading, refetch } = useIntegrationData({ category: 'ecommerce' });
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleAddSuccess = () => {
    refetch();
    setShowAddDialog(false);
  };

  return (
    <>
      <IntegrationSelector
        category="ecommerce"
        title="Clientes por Loja"
        description="Selecione uma loja para visualizar seus clientes"
        emptyStateMessage="Conecte uma loja para começar a sincronizar seus clientes."
        emptyStateIcon={<Users className="h-8 w-8 text-muted-foreground" />}
        integrations={integrations}
        isLoading={isLoading}
        onSelectIntegration={onSelectIntegration}
        onAddIntegration={() => setShowAddDialog(true)}
        addButtonText="Conectar Loja"
        addButtonDescription="Loja Integrada, Bling, Nuvem Shop..."
        onIntegrationDeleted={refetch}
      />

      <AddIntegrationDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
