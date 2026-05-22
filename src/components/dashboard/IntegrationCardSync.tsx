import { cn } from "@/lib/utils";
import { Check, AlertCircle, Loader2, Clock, RefreshCw, StopCircle, Users, Package, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import * as React from "react";

interface SyncJob {
  id: string;
  job_type: string;
  status: string;
  current_offset: number;
  total_count: number;
  processed_count: number;
  saved_count: number;
}

interface SyncButtonProps {
  icon: React.ElementType;
  label: string;
  type: "customers" | "products" | "orders";
  job?: SyncJob;
  isSyncing: boolean;
  canSync: boolean;
  onSync: () => void;
  onStop?: () => void;
  colorClass: string;
}

function SyncButton({ icon: Icon, label, job, isSyncing, canSync, onSync, onStop, colorClass }: SyncButtonProps) {
  const isRunning = job?.status === "running";
  const isCompleted = job?.status === "completed";
  const isPending = job?.status === "pending";
  const isFailed = job?.status === "failed";
  const isPaused = job?.status === "paused";
  const hasTotal = job && job.total_count > 0;
  const progress = hasTotal ? Math.round((job.saved_count / job.total_count) * 100) : 0;
  const isLoadingTotal = isRunning && !hasTotal;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", colorClass)} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {hasTotal ? `${job.saved_count}/${job.total_count}` : "Carregando..."}
            </span>
          )}
          {isPending && <span className="flex items-center gap-1 text-xs text-yellow-600"><Clock className="h-3 w-3" />Aguardando</span>}
          {isCompleted && <span className="flex items-center gap-1 text-xs text-green-600"><Check className="h-3 w-3" />{job.saved_count} OK</span>}
          {isFailed && <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3 w-3" />Erro</span>}
          {isPaused && <span className="flex items-center gap-1 text-xs text-yellow-600"><StopCircle className="h-3 w-3" />Pausado</span>}
        </div>
      </div>
      {isRunning && (
        <div className="relative">
          {isLoadingTotal ? <Progress value={30} className="h-1.5 animate-pulse" /> : <Progress value={progress} className="h-1.5" />}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={onSync} disabled={!canSync || isRunning || isSyncing}>
          {isRunning || (isSyncing && isPending)
            ? <><Loader2 className="h-3 w-3 animate-spin" />Sincronizando...</>
            : <><RefreshCw className="h-3 w-3" />Sincronizar</>}
        </Button>
        {isRunning && onStop && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onStop}>
            <StopCircle className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export interface IntegrationCardSyncProps {
  id: string;
  status: string;
  syncJobs?: SyncJob[];
  syncStatusId?: string;
  canSync: boolean;
  isSyncing?: boolean;
  syncingType?: string | null;
  isAnySyncRunning: boolean;
  isAnySyncInProgress: boolean;
  hasResumableJobs: boolean;
  isStopped: boolean;
  onSync?: (id: string, syncType?: string) => void;
  onStopSync?: (syncLogId: string) => void;
}

export function IntegrationCardSync({
  id, status, syncJobs, syncStatusId, canSync, isSyncing, syncingType,
  isAnySyncRunning, isAnySyncInProgress, hasResumableJobs, isStopped, onSync, onStopSync,
}: IntegrationCardSyncProps) {
  const customersJob = syncJobs?.find((j) => j.job_type === "customers");
  const productsJob = syncJobs?.find((j) => j.job_type === "products");
  const ordersJob = syncJobs?.find((j) => j.job_type === "orders");

  const handleStopSync = () => { if (onStopSync && syncStatusId) onStopSync(syncStatusId); };

  return (
    <div className="mt-4 space-y-2">
      {isAnySyncInProgress && (() => {
        const jobs = [customersJob, productsJob, ordersJob].filter(Boolean) as SyncJob[];
        const activeJobs = jobs.filter((j) => j.status === "running" || j.status === "pending" || j.status === "completed");
        const totalItems = activeJobs.reduce((sum, j) => sum + (j.total_count || 0), 0);
        const savedItems = activeJobs.reduce((sum, j) => sum + (j.saved_count || 0), 0);
        const hasAnyTotal = activeJobs.some((j) => j.total_count > 0);
        const overallProgress = hasAnyTotal && totalItems > 0 ? Math.round((savedItems / totalItems) * 100) : 0;
        const runningCount = activeJobs.filter((j) => j.status === "running").length;
        const completedCount = activeJobs.filter((j) => j.status === "completed").length;
        return (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium text-primary">Sincronização em progresso</span>
              </div>
              <span className="text-sm font-bold text-primary">{hasAnyTotal ? `${overallProgress}%` : "Iniciando..."}</span>
            </div>
            <Progress value={overallProgress} className="h-2" indeterminate={!hasAnyTotal} />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{hasAnyTotal ? `${savedItems.toLocaleString()} / ${totalItems.toLocaleString()} itens` : "Carregando totais..."}</span>
              <span>{completedCount > 0 && `${completedCount} concluído • `}{runningCount > 0 && `${runningCount} em progresso`}</span>
            </div>
          </div>
        );
      })()}

      <Button
        variant="default" size="sm" className="w-full gap-2"
        onClick={() => onSync?.(id, "all")}
        disabled={!status || status !== "connected" || isStopped || isAnySyncRunning || isSyncing}
      >
        {isAnySyncRunning
          ? <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</>
          : hasResumableJobs
            ? <><RefreshCw className="h-4 w-4" />Continuar Sync</>
            : <><RefreshCw className="h-4 w-4" />Sincronizar Tudo</>}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/50" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou individual</span></div>
      </div>

      <SyncButton icon={Users} label="Clientes" type="customers" job={customersJob} isSyncing={!!(isSyncing && syncingType === "customers")} canSync={canSync} onSync={() => onSync?.(id, "customers")} onStop={handleStopSync} colorClass="text-blue-500" />
      <SyncButton icon={Package} label="Produtos" type="products" job={productsJob} isSyncing={!!(isSyncing && syncingType === "products")} canSync={canSync} onSync={() => onSync?.(id, "products")} onStop={handleStopSync} colorClass="text-green-500" />
      <SyncButton icon={ShoppingCart} label="Vendas" type="orders" job={ordersJob} isSyncing={!!(isSyncing && syncingType === "orders")} canSync={canSync} onSync={() => onSync?.(id, "orders")} onStop={handleStopSync} colorClass="text-purple-500" />
    </div>
  );
}
