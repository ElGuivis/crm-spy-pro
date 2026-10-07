import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExportCSV } from "@/hooks/useExportCSV";
import { useBlingClientsData } from "@/hooks/useBlingClientsData";
import BlingClientDetailsDialog from "@/components/clients/BlingClientDetailsDialog";
import type { Tables } from "@/integrations/supabase/types";
import { createLogger } from "@/lib/logger";
import { BlingClientsHeader } from "./bling/BlingClientsHeader";
import { BlingClientsTable } from "./bling/BlingClientsTable";
import { ClientsStatsCards } from "./shared/ClientsStatsCards";
import { ClientsFilters } from "./shared/ClientsFilters";
import { ClientsPaginationFooter } from "./shared/ClientsPaginationFooter";
import { parseBlingEnderecoGeral } from "./shared/clientsHelpers";
import { getErrorMessage } from "@/lib/error-message";

const log = createLogger("BlingClientsContent");

interface Props {
  integrationId: string;
}

export function BlingClientsContent({ integrationId }: Props) {
  const { toast } = useToast();
  const { exportToCSV, isExporting } = useExportCSV();
  const [selectedClient, setSelectedClient] = useState<Tables<"bling_customers"> | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const data = useBlingClientsData(integrationId);
  const isSyncing = data.sync.syncStatus === "syncing";

  const handleExport = async () => {
    const { data: allClients, error } = await supabase
      .from("bling_customers")
      .select("nome, email, celular, telefone, cpf_cnpj, endereco")
      .eq("integration_id", integrationId)
      .order("nome", { ascending: true });

    if (error || !allClients) {
      toast({ title: "Erro na exportação", description: "Não foi possível buscar os clientes.", variant: "destructive" });
      return;
    }

    await exportToCSV({
      filename: "clientes-bling",
      headers: ["Nome", "Email", "Celular", "Telefone", "CPF/CNPJ", "Cidade", "UF"],
      data: allClients.map((c) => {
        const geral = parseBlingEnderecoGeral(c.endereco);
        return [c.nome, c.email, c.celular, c.telefone, c.cpf_cnpj, geral.municipio, geral.uf];
      }),
    });
  };

  const handleSync = async () => {
    try {
      toast({ title: "Sincronização iniciada", description: "Sincronizando clientes a partir das vendas..." });
      await data.sync.startSync();
    } catch (error) {
      log.error("Sync error:", error);
      toast({
        title: "Erro na sincronização",
        description: getErrorMessage(error) || "Não foi possível iniciar a sincronização.",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (client: Tables<"bling_customers">) => {
    setSelectedClient(client);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      <BlingClientsHeader
        integrationId={integrationId}
        integrationName={data.integration?.name}
        syncStatus={data.sync.syncStatus}
        currentJobSavedCount={data.sync.currentJob?.saved_count}
        isExporting={isExporting}
        hasData={!!data.totalCount}
        onSync={handleSync}
        onExport={handleExport}
      />

      <ClientsStatsCards
        totalCount={data.totalCount}
        integration={data.integration}
        syncProgress={isSyncing && data.sync.currentJob ? {
          saved: data.sync.currentJob.saved_count ?? 0,
          total: data.sync.currentJob.total_count ?? 0,
        } : null}
        progressLabel="Sincronizando clientes..."
      />

      <ClientsFilters
        searchTerm={data.searchTerm}
        pageSize={data.pageSize}
        placeholder="Buscar por nome, email, telefone, CPF/CNPJ..."
        onSearch={data.handleSearch}
        onPageSizeChange={data.handlePageSizeChange}
      />

      <BlingClientsTable
        clients={data.clients}
        isLoading={data.isLoading}
        pageSize={data.pageSize}
        searchTerm={data.searchTerm}
        orderCounts={data.orderCounts}
        onViewDetails={handleViewDetails}
      />

      <ClientsPaginationFooter
        currentPage={data.currentPage}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        displayCount={data.displayCount}
        onPageChange={data.goToPage}
      />

      <BlingClientDetailsDialog
        client={selectedClient}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
