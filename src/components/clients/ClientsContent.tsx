import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLiClientsData } from "@/hooks/useLiClientsData";
import ClientDetailsDialog from "@/components/clients/ClientDetailsDialog";
import { SyncProgressBanner } from "@/components/common/SyncProgressBanner";
import { createLogger } from "@/lib/logger";
import type { Tables } from "@/integrations/supabase/types";
import { LiClientsHeader } from "./li/LiClientsHeader";
import { LiClientsTable } from "./li/LiClientsTable";
import { ClientsStatsCards } from "./shared/ClientsStatsCards";
import { ClientsFilters } from "./shared/ClientsFilters";
import { ClientsPaginationFooter } from "./shared/ClientsPaginationFooter";

const log = createLogger("ClientsContent");

interface Props {
  integrationId: string;
}

export function ClientsContent({ integrationId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const data = useLiClientsData(integrationId);
  const [selectedClient, setSelectedClient] = useState<Tables<"li_customers"> | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [checkingNew, setCheckingNew] = useState(false);

  const handleSync = async () => {
    try {
      toast({ title: "Sincronização iniciada", description: "Sincronizando clientes em segundo plano..." });
      await data.sync.startSync();
    } catch (error: any) {
      log.error("Sync error:", error);
      toast({
        title: "Erro na sincronização",
        description: error.message || "Não foi possível iniciar a sincronização.",
        variant: "destructive",
      });
    }
  };

  const handleCheckNew = async () => {
    try {
      setCheckingNew(true);
      toast({ title: "Verificando novos clientes", description: "Buscando clientes novos..." });
      const { error } = await supabase.functions.invoke("li-reconciliation-processor", {
        body: { manual: true, integrationId, syncType: "customers" },
      });
      if (error) throw error;
      toast({ title: "Verificação concluída", description: "Clientes atualizados com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["li-clients", integrationId] });
      queryClient.invalidateQueries({ queryKey: ["li-clients-count", integrationId] });
      queryClient.invalidateQueries({ queryKey: ["integration-info", integrationId] });
    } catch (error: any) {
      log.error("Check new error:", error);
      toast({
        title: "Erro ao verificar",
        description: error.message || "Não foi possível verificar novos clientes.",
        variant: "destructive",
      });
    } finally {
      setCheckingNew(false);
    }
  };

  const handleViewDetails = (client: Tables<"li_customers">) => {
    setSelectedClient(client);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <SyncProgressBanner integrationId={integrationId} entityType="customers" />

      <LiClientsHeader
        integrationId={integrationId}
        integrationName={data.integration?.name}
        syncStatus={data.sync.syncStatus}
        checkingNew={checkingNew}
        onSync={handleSync}
        onCheckNew={handleCheckNew}
      />

      <ClientsStatsCards
        totalCount={data.totalCount}
        integration={data.integration}
        syncProgress={data.sync.syncStatus.isActive ? {
          saved: data.sync.syncStatus.progress.saved,
          total: data.sync.syncStatus.progress.total,
        } : null}
        progressLabel="Sincronizando clientes..."
      />

      <ClientsFilters
        searchTerm={data.searchTerm}
        pageSize={data.pageSize}
        placeholder="Buscar por nome, email, telefone, CPF ou CNPJ..."
        onSearch={data.handleSearch}
        onPageSizeChange={data.handlePageSizeChange}
      />

      <LiClientsTable
        clients={data.clients}
        isLoading={data.isLoading}
        pageSize={data.pageSize}
        searchTerm={data.searchTerm}
        isSyncing={data.sync.syncStatus.isActive}
        onViewDetails={handleViewDetails}
        onSync={handleSync}
      />

      <ClientsPaginationFooter
        currentPage={data.currentPage}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        displayCount={data.displayCount}
        onPageChange={data.goToPage}
      />

      <ClientDetailsDialog
        client={selectedClient}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
