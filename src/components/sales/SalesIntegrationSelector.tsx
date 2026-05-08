import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useIntegrationData } from '@/hooks/useIntegrationData';
import { IntegrationSelector } from '@/components/integrations/IntegrationSelector';
import { AddStoreConnectionDialog } from './AddStoreConnectionDialog';

interface SalesIntegrationSelectorProps {
  onSelectIntegration: (integrationId: string) => void;
}

export function SalesIntegrationSelector({ onSelectIntegration }: SalesIntegrationSelectorProps) {
  const { integrations, isLoading, refetch } = useIntegrationData({ category: 'ecommerce' });
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleSuccess = () => {
    refetch();
  };

  return (
    <>
      <IntegrationSelector
        category="ecommerce"
        title="Lojas Conectadas"
        description="Selecione uma loja para visualizar vendas, clientes e produtos"
        emptyStateMessage="Conecte uma loja para começar a sincronizar seus dados de vendas."
        emptyStateIcon={<ShoppingBag className="h-8 w-8 text-muted-foreground" />}
        integrations={integrations}
        isLoading={isLoading}
        onSelectIntegration={onSelectIntegration}
        onAddIntegration={() => setShowAddDialog(true)}
        addButtonText="Conectar Nova Loja"
        addButtonDescription="Loja Integrada, Bling, Nuvem Shop..."
        onIntegrationDeleted={refetch}
      />

      <AddStoreConnectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSelectIntegration={onSelectIntegration}
        onSuccess={handleSuccess}
      />
    </>
  );
}
