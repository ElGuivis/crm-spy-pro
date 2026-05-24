import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, Clock } from "lucide-react";
import { formatLastSync, getMostRecentSync } from "./clientsHelpers";

interface Props {
  totalCount?: number;
  integration?: {
    last_customers_sync_at?: string | null;
    last_sync_customers_at?: string | null;
    last_sync_at?: string | null;
  } | null;
  /** When set, renders a sync progress card above the stats grid. */
  syncProgress?: { saved: number; total: number } | null;
  progressLabel?: string;
}

export function ClientsStatsCards({ totalCount, integration, syncProgress, progressLabel }: Props) {
  const showProgress = syncProgress && syncProgress.total > 0;

  return (
    <>
      {showProgress && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{progressLabel || "Sincronizando..."}</span>
                <span>{syncProgress.saved} de {syncProgress.total}</span>
              </div>
              <Progress value={(syncProgress.saved / syncProgress.total) * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Clientes</p>
                <p className="text-2xl font-bold">{totalCount?.toLocaleString('pt-BR') || 0}</p>
              </div>
              <Users className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Última Sincronização</p>
                <p className="text-sm font-medium">{formatLastSync(getMostRecentSync(integration))}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
