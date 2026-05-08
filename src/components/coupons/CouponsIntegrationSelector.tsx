import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ticket, ShoppingBag } from "lucide-react";
import { IntegrationSelector } from "@/components/integrations/IntegrationSelector";
import { AddStoreConnectionDialog } from "@/components/sales/AddStoreConnectionDialog";
import { useIntegrationData, IntegrationCategory } from "@/hooks/useIntegrationData";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CouponsIntegrationSelectorProps {
  onSelectIntegration: (id: string) => void;
}

export const CouponsIntegrationSelector = ({ onSelectIntegration }: CouponsIntegrationSelectorProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  const { integrations, isLoading, refetch } = useIntegrationData({ 
    category: 'ecommerce' as IntegrationCategory
  });

  const handleAddIntegration = () => {
    setShowAddDialog(true);
  };

  return (
    <>
      <IntegrationSelector
        category={'ecommerce' as IntegrationCategory}
        title="Cupons por Loja"
        description="Selecione uma loja para visualizar os cupons de cashback gerados"
        emptyStateMessage="Conecte uma loja para começar a visualizar os cupons de cashback gerados automaticamente."
        emptyStateIcon={<Ticket className="h-8 w-8 text-muted-foreground" />}
        integrations={integrations}
        isLoading={isLoading}
        onSelectIntegration={onSelectIntegration}
        onAddIntegration={handleAddIntegration}
        addButtonText="Conectar Loja"
        addButtonDescription="Loja Integrada, Bling, Nuvem Shop..."
        onIntegrationDeleted={refetch}
      />

      <AddStoreConnectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSelectIntegration={(id) => {
          onSelectIntegration(id);
          setShowAddDialog(false);
        }}
        onSuccess={() => {
          refetch();
        }}
      />
    </>
  );
};
