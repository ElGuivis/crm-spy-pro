import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Zap, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";

interface Props {
  integrationId: string;
  integrationName?: string | null;
  syncStatus: { status: string; isActive: boolean };
  checkingNew: boolean;
  onSync: () => void;
  onCheckNew: () => void;
}

export function LiClientsHeader({ integrationId, integrationName, syncStatus, checkingNew, onSync, onCheckNew }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{integrationName || "Clientes"}</h1>
          <p className="text-muted-foreground">Gerencie os clientes desta loja</p>
        </div>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <SyncStatusBadge integrationId={integrationId} syncType="customers" />
        <DeleteIntegrationDataButton
          integrationId={integrationId}
          dataType="clientes"
          tablesToDelete={[{ table: "li_customers" }]}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ["li-clients", integrationId] });
            queryClient.invalidateQueries({ queryKey: ["li-clients-count", integrationId] });
          }}
        />
        <Button variant="outline" onClick={onCheckNew} disabled={checkingNew || syncStatus.isActive}>
          <Zap className={`h-4 w-4 mr-2 ${checkingNew ? "animate-pulse" : ""}`} />
          {checkingNew ? "Verificando..." : "Verificar Novos"}
        </Button>
        <Button variant="outline" onClick={onSync} disabled={syncStatus.isActive || checkingNew}>
          {syncStatus.isActive ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> :
            syncStatus.status === "completed" ? <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> :
            <RefreshCw className="h-4 w-4 mr-2" />}
          {syncStatus.isActive ? "Sincronizando..." : syncStatus.status === "completed" ? "Concluído!" : "Sincronizar"}
        </Button>
      </div>
    </div>
  );
}
