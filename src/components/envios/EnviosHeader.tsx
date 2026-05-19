import { Button } from '@/components/ui/button';
import { Truck, RefreshCw, Search, XCircle, RotateCcw, ArrowLeft } from 'lucide-react';
import { SyncStatusBadge } from '@/components/common/SyncStatusBadge';
import { DeleteIntegrationDataButton } from '@/components/common/DeleteIntegrationDataButton';

interface SyncProgress {
  status: string;
  itemsSaved?: number;
  itemsTotal?: number;
}

interface EnviosHeaderProps {
  integrationId: string;
  integrationName: string | undefined;
  isSyncing: boolean;
  isTrackingSyncing: boolean;
  isCheckingNew: boolean;
  syncProgress: SyncProgress;
  onBack: () => void;
  onConfigure: () => void;
  onCheckNew: () => void;
  onSyncTracking: () => void;
  onSync: () => void;
  onCancelSync: () => void;
  onForceReset: () => void;
  onRetrySync: () => void;
  onDeleted: () => void;
}

export function EnviosHeader({
  integrationId, integrationName,
  isSyncing, isTrackingSyncing, isCheckingNew, syncProgress,
  onBack, onConfigure, onCheckNew, onSyncTracking,
  onSync, onCancelSync, onForceReset, onRetrySync, onDeleted,
}: EnviosHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{integrationName || 'Envios'}</h1>
          <p className="text-muted-foreground">Gerencie seus envios e rastreie entregas</p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <SyncStatusBadge integrationId={integrationId} syncType="shipments" />
        <DeleteIntegrationDataButton
          integrationId={integrationId}
          dataType="envios"
          tablesToDelete={[{ table: 'me_shipments' }]}
          onDeleted={onDeleted}
        />
        <Button variant="outline" onClick={onConfigure}>
          <Truck className="h-4 w-4 mr-2" />
          Configurar
        </Button>
        <Button variant="outline" onClick={onCheckNew} disabled={isCheckingNew || isSyncing}>
          <Search className={`h-4 w-4 mr-2 ${isCheckingNew ? 'animate-pulse' : ''}`} />
          {isCheckingNew ? 'Verificando...' : 'Verificar Novos'}
        </Button>
        <Button variant="outline" onClick={onSyncTracking} disabled={isSyncing || isTrackingSyncing}>
          <RotateCcw className={`h-4 w-4 mr-2 ${isTrackingSyncing ? 'animate-spin' : ''}`} />
          Atualizar Rastreios
        </Button>
        {isSyncing ? (
          <Button variant="destructive" onClick={onCancelSync}>
            <XCircle className="h-4 w-4 mr-2" />
            Cancelar ({syncProgress.itemsSaved || 0}/{syncProgress.itemsTotal || '?'})
          </Button>
        ) : syncProgress.status === 'failed' ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onForceReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Resetar
            </Button>
            <Button onClick={onRetrySync}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar Novamente
            </Button>
          </div>
        ) : (
          <Button onClick={onSync}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizar Tudo
          </Button>
        )}
      </div>
    </div>
  );
}
