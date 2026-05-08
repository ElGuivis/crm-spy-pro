import { useState } from 'react';
import { Package } from 'lucide-react';
import { useIntegrationData } from '@/hooks/useIntegrationData';
import { IntegrationSelector } from '@/components/integrations/IntegrationSelector';
import { AddIntegrationDialog } from '@/components/integrations/AddIntegrationDialog';

interface ProductsIntegrationSelectorProps {
  onSelectIntegration: (integrationId: string) => void;
}

export function ProductsIntegrationSelector({ onSelectIntegration }: ProductsIntegrationSelectorProps) {
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
        title="Produtos por Loja"
        description="Selecione uma loja para visualizar seus produtos"
        emptyStateMessage="Conecte uma loja para começar a sincronizar seus produtos."
        emptyStateIcon={<Package className="h-8 w-8 text-muted-foreground" />}
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
