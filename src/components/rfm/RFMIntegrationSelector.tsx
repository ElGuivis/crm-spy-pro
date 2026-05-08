import { useState } from 'react';
import { Grid3X3 } from 'lucide-react';
import { useIntegrationData } from '@/hooks/useIntegrationData';
import { IntegrationSelector } from '@/components/integrations/IntegrationSelector';
import { AddIntegrationDialog } from '@/components/integrations/AddIntegrationDialog';

interface RFMIntegrationSelectorProps {
  onSelectIntegration: (integrationId: string) => void;
}

export function RFMIntegrationSelector({ onSelectIntegration }: RFMIntegrationSelectorProps) {
  const { integrations, isLoading, refetch } = useIntegrationData({ category: 'ecommerce' });
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <>
      <IntegrationSelector
        category="ecommerce"
        title="Matriz RFM por Loja"
        description="Selecione uma loja para visualizar a análise RFM dos seus clientes"
        emptyStateMessage="Conecte uma loja para começar a analisar seus clientes com a Matriz RFM."
        emptyStateIcon={<Grid3X3 className="h-8 w-8 text-muted-foreground" />}
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
        onSuccess={() => { refetch(); setShowAddDialog(false); }}
      />
    </>
  );
}
