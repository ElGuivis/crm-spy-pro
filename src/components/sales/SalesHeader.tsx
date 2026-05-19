import { Button } from "@/components/ui/button";
import { RefreshCw, Zap, ArrowLeft, CheckCircle, Download, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";

interface SyncStatus {
  isActive: boolean;
  status: string;
}

interface SalesHeaderProps {
  integrationId: string;
  integrationName: string;
  checkingNew: boolean;
  syncStatus: SyncStatus;
  isExporting: boolean;
  ordersCount: number;
  onBack: () => void;
  onCheckNewOrders: () => void;
  onSync: () => void;
  onExportCSV: () => void;
  onExportPDF: () => void;
  onDeleted: () => void;
}

export function SalesHeader({
  integrationId, integrationName, checkingNew, syncStatus,
  isExporting, ordersCount, onBack, onCheckNewOrders, onSync, onExportCSV, onExportPDF, onDeleted,
}: SalesHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{integrationName || 'Vendas'}</h1>
          <p className="text-muted-foreground">Gerencie os pedidos desta loja</p>
        </div>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <SyncStatusBadge integrationId={integrationId} syncType="orders" />
        <DeleteIntegrationDataButton
          integrationId={integrationId}
          dataType="pedidos"
          tablesToDelete={[{ table: 'li_orders', itemsTable: 'li_order_items', itemsForeignKey: 'order_id' }]}
          onDeleted={onDeleted}
        />
        <Button variant="outline" onClick={onCheckNewOrders} disabled={checkingNew || syncStatus.isActive}>
          <Zap className={`h-4 w-4 mr-2 ${checkingNew ? 'animate-pulse' : ''}`} />
          {checkingNew ? 'Verificando...' : 'Verificar Novos'}
        </Button>
        <Button variant="outline" onClick={onSync} disabled={syncStatus.isActive || checkingNew}>
          {syncStatus.isActive ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : syncStatus.status === 'completed' ? (
            <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {syncStatus.isActive ? 'Sincronizando...' : syncStatus.status === 'completed' ? 'Concluído!' : 'Sincronizar'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isExporting || ordersCount === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onExportCSV}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Exportar PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
