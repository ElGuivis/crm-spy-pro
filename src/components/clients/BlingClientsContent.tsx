import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExportCSV } from "@/hooks/useExportCSV";
import { useBlingClientsData } from "@/hooks/useBlingClientsData";
import BlingClientDetailsDialog from "@/components/clients/BlingClientDetailsDialog";
import type { Tables } from "@/integrations/supabase/types";
import { createLogger } from "@/lib/logger";
import { BlingClientsHeader } from "./bling/BlingClientsHeader";
import { BlingClientsStats } from "./bling/BlingClientsStats";
import { BlingClientsFilters } from "./bling/BlingClientsFilters";
import { BlingClientsTable } from "./bling/BlingClientsTable";
import { BlingClientsPagination } from "./bling/BlingClientsPagination";
import { parseEnderecoGeral } from "./bling/blingClientsHelpers";

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
        const geral = parseEnderecoGeral(c.endereco);
        return [c.nome, c.email, c.celular, c.telefone, c.cpf_cnpj, geral.municipio, geral.uf];
      }),
    });
  };

  const handleSync = async () => {
    try {
      toast({ title: "Sincronização iniciada", description: "Sincronizando clientes a partir das vendas..." });
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

      <BlingClientsStats
        totalCount={data.totalCount}
        integration={data.integration}
        isSyncing={data.sync.syncStatus === "syncing"}
        currentJob={data.sync.currentJob}
      />

      <BlingClientsFilters
        searchTerm={data.searchTerm}
        pageSize={data.pageSize}
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

      <BlingClientsPagination
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
