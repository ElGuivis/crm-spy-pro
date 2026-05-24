import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, CheckCircle, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  integrationId: string;
  integrationName?: string | null;
  syncStatus: string;
  currentJobSavedCount?: number;
  isExporting: boolean;
  hasData: boolean;
  onSync: () => void;
  onExport: () => void;
}

export function BlingClientsHeader({
  integrationId, integrationName, syncStatus, currentJobSavedCount,
  isExporting, hasData, onSync, onExport,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isSyncing = syncStatus === 'syncing';

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{integrationName || 'Clientes Bling'}</h1>
          <p className="text-muted-foreground">Clientes extraídos das vendas sincronizadas</p>
        </div>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <SyncStatusBadge integrationId={integrationId} syncType="customers" />
        <Button variant="outline" onClick={onExport} disabled={isExporting || !hasData}>
          <Download className={`h-4 w-4 mr-2 ${isExporting ? 'animate-pulse' : ''}`} />
          {isExporting ? 'Exportando...' : 'Exportar CSV'}
        </Button>
        <DeleteIntegrationDataButton
          integrationId={integrationId}
          dataType="clientes"
          tablesToDelete={[{ table: 'bling_customers' }]}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ['bling-clients', integrationId] });
            queryClient.invalidateQueries({ queryKey: ['bling-clients-count', integrationId] });
          }}
        />
        <Button variant="outline" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> :
            syncStatus === 'completed' ? <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> :
            <RefreshCw className="h-4 w-4 mr-2" />}
          {isSyncing ? `Sincronizando... ${currentJobSavedCount || 0}` :
            syncStatus === 'completed' ? 'Concluído!' : 'Sincronizar Clientes'}
        </Button>
      </div>
    </div>
  );
}
