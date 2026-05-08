import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useIntegrationData } from '@/hooks/useIntegrationData';
import { IntegrationSelector } from '@/components/integrations/IntegrationSelector';
import { AddIntegrationDialog } from '@/components/integrations/AddIntegrationDialog';

interface Props {
  onSelectIntegration: (integrationId: string) => void;
}

export function CatalogoIntegrationSelector({ onSelectIntegration }: Props) {
  const { integrations, isLoading, refetch } = useIntegrationData({ category: 'ecommerce' });
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <>
      <IntegrationSelector
        category="ecommerce"
        title="Catálogo WhatsApp"
        description="Selecione uma loja para enviar produtos via WhatsApp"
        emptyStateMessage="Conecte uma loja para começar a enviar catálogos."
        emptyStateIcon={<ShoppingBag className="h-8 w-8 text-muted-foreground" />}
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
