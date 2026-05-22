import { Loader2, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface SyncJob {
  total_count?: number | null;
  saved_count?: number | null;
  current_page?: number | null;
  resume_page?: number | null;
}

interface BlingProductSyncProgressProps {
  syncStatus: string;
  enrichmentStatus: string;
  currentJob: SyncJob | null | undefined;
  enrichmentJob: SyncJob | null | undefined;
  isStuck: boolean;
  lastHeartbeatAgo: number | null;
  resumeSync: () => void;
}

export function BlingProductSyncProgress({
  syncStatus, enrichmentStatus, currentJob, enrichmentJob,
  isStuck, lastHeartbeatAgo, resumeSync,
}: BlingProductSyncProgressProps) {
  const showSync = syncStatus === "syncing" || syncStatus === "pending";
  const showEnrichment = enrichmentStatus === "syncing" || enrichmentStatus === "pending";

  if (!showSync && !showEnrichment) return null;

  return (
    <div className="space-y-3">
      {showSync && (
        <Card className={`border-primary/50 ${isStuck ? "bg-yellow-500/10 border-yellow-500/50" : "bg-primary/5"}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              {isStuck
                ? <AlertTriangle className="h-5 w-5 text-yellow-500" />
                : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    {isStuck
                      ? "Sincronização pausada - aguardando retomada automática"
                      : syncStatus === "pending"
                        ? "Sincronização em fila - aguardando processamento..."
                        : "Sincronizando produtos..."}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {currentJob?.total_count && currentJob.total_count > 0
                      ? `${Math.round(((currentJob.saved_count || 0) / currentJob.total_count) * 100)}%`
                      : "Iniciando..."}
                  </span>
                </div>
                <Progress
                  value={currentJob?.total_count && currentJob.total_count > 0
                    ? ((currentJob.saved_count || 0) / currentJob.total_count) * 100
                    : 0}
                  className="h-2"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{currentJob?.saved_count || 0} de {currentJob?.total_count || "?"} salvos</span>
              <span className="flex items-center gap-2">
                Página {currentJob?.current_page || 1} • Próxima: {currentJob?.resume_page || "-"}
                {lastHeartbeatAgo !== null && (
                  <span className={isStuck ? "text-yellow-600 font-medium" : ""}>
                    • Última atividade: {Math.round(lastHeartbeatAgo / 1000)}s atrás
                  </span>
                )}
              </span>
            </div>
            {isStuck && (
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" onClick={resumeSync} className="bg-yellow-500 hover:bg-yellow-600 text-white">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Forçar Retomada
                </Button>
                <span className="text-xs text-muted-foreground">
                  O CRON retomará automaticamente em até 1 minuto
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showEnrichment && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">
                    Enriquecendo produtos (imagens, variações, detalhes)...
                  </span>
                  <span className="text-sm font-bold text-blue-600">
                    {enrichmentJob?.total_count && enrichmentJob.total_count > 0
                      ? `${Math.round(((enrichmentJob.saved_count || 0) / enrichmentJob.total_count) * 100)}%`
                      : "Processando..."}
                  </span>
                </div>
                <Progress
                  value={enrichmentJob?.total_count && enrichmentJob.total_count > 0
                    ? ((enrichmentJob.saved_count || 0) / enrichmentJob.total_count) * 100
                    : 0}
                  className="h-2"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{enrichmentJob?.saved_count || 0} de {enrichmentJob?.total_count || "?"} produtos enriquecidos</span>
              <span>Buscando imagens e variações do Bling...</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
