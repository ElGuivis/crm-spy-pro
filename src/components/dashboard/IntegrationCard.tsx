import { cn } from "@/lib/utils";
import { Check, AlertCircle, Loader2, Clock, RefreshCw, Trash2, FileText, Users, Package, ShoppingCart, StopCircle, MessageSquare, MessageSquareMore, Truck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import * as React from "react";
import { getIntegrationBrand } from "@/lib/integration-logos";
import { IntegrationCardSync } from "./IntegrationCardSync";
import { IntegrationTypePanel } from "./IntegrationTypePanel";

interface SyncStatusInfo {
  status: string;
  started_at: string;
  completed_at: string | null;
  records_synced: number | null;
  error_message: string | null;
  id?: string;
  sync_type?: string;
}

interface SyncJob {
  id: string;
  job_type: string;
  status: string;
  current_offset: number;
  total_count: number;
  processed_count: number;
  saved_count: number;
}

interface Last24hStats {
  orders: number;
  customers: number;
  products: number;
}

interface IntegrationCardProps {
  id?: string;
  name: string;
  type?: string;
  description: string;
  logo: string;
  status: "connected" | "disconnected" | "pending";
  lastSyncAt?: string | null;
  errorMessage?: string | null;
  className?: string;
  integrationType?: "ecommerce" | "whatsapp" | "chatwoot" | "ai" | "shipping";
  onSync?: (id: string, syncType?: string) => void;
  onStopSync?: (syncLogId: string) => void;
  onResumeSync?: () => void;
  onDelete?: (id: string) => void;
  onViewLogs?: (id: string, name: string) => void;
  onReconnect?: (id: string) => void;
  onReprovision?: (id: string) => void;
  onReconfigureWebhook?: (id: string, instanceName: string) => void;
  onTestAI?: (id: string) => Promise<{ success: boolean; message: string }>;
  isSyncing?: boolean;
  isReconfiguringWebhook?: boolean;
  syncingType?: string | null;
  syncStatus?: SyncStatusInfo | null;
  syncJobs?: SyncJob[];
  last24hStats?: Last24hStats;
  isReprovisioning?: boolean;
  metadata?: Record<string, unknown>;
}

const StatusBadge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { status: "connected" | "disconnected" | "pending" }
>(({ status, className: classNameProp, ...props }, ref) => {
  const config = {
    connected: { icon: Check, label: "Online", className: "bg-primary/10 text-primary border-primary/20" },
    disconnected: { icon: AlertCircle, label: "Offline", className: "bg-destructive/10 text-destructive border-destructive/20" },
    pending: { icon: Loader2, label: "Pendente", className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  };
  const { icon: Icon, label, className } = config[status];
  return (
    <span ref={ref} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", className, classNameProp)} {...props}>
      <Icon className={cn("h-3 w-3", status === "pending" && "animate-spin")} />
      {label}
    </span>
  );
});
StatusBadge.displayName = "StatusBadge";

export function IntegrationCard({
  id, name, type, description, logo, status, lastSyncAt, errorMessage, className, integrationType = "ecommerce",
  onSync, onStopSync, onResumeSync, onDelete, onViewLogs, onReconnect, onReprovision,
  onReconfigureWebhook, onTestAI, isSyncing, syncingType, syncStatus, syncJobs, last24hStats,
  isReprovisioning, isReconfiguringWebhook, metadata,
}: IntegrationCardProps) {
  const isAnySyncRunning = syncJobs?.some((j) => j.status === "running") ?? false;
  const hasResumableJobs = syncJobs?.some((j) => j.status === "pending" || j.status === "failed" || j.status === "paused") ?? false;
  const isAnySyncInProgress = isAnySyncRunning || hasResumableJobs;
  const isStopped = syncStatus?.status === "cancelled" || syncStatus?.status === "paused";
  const canSync = status === "connected" && !isAnySyncRunning && !isStopped;

  const brand = type ? getIntegrationBrand(type) : null;
  const hasRealLogo = !!brand?.logo;

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl bg-card p-5 border border-border/50",
      "transition-all duration-300 hover:shadow-lg hover:border-primary/30",
      status === "connected" && integrationType === "ecommerce" && "border-l-4 border-l-primary",
      status === "connected" && integrationType === "whatsapp" && "border-l-4 border-l-green-500",
      status === "connected" && integrationType === "chatwoot" && "border-l-4 border-l-orange-500",
      status === "connected" && integrationType === "shipping" && "border-l-4 border-l-cyan-500",
      status === "pending" && "border-l-4 border-l-yellow-500",
      className
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "flex h-14 w-14 items-center justify-center rounded-xl p-2 overflow-hidden",
          hasRealLogo ? (brand?.color || "bg-surface-3")
            : integrationType === "whatsapp" ? "bg-green-500/10"
            : integrationType === "chatwoot" ? "bg-orange-500/10"
            : integrationType === "shipping" ? "bg-cyan-500/10"
            : "bg-surface-3"
        )}>
          {hasRealLogo ? (
            <img src={brand!.logo} alt={name} className="h-8 w-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${name}&background=random`; }} />
          ) : integrationType === "whatsapp" ? (
            <MessageSquare className="h-7 w-7 text-green-500" />
          ) : integrationType === "chatwoot" ? (
            <MessageSquareMore className="h-7 w-7 text-orange-500" />
          ) : integrationType === "shipping" ? (
            <Truck className="h-7 w-7 text-cyan-500" />
          ) : logo ? (
            <img src={logo} alt={name} className="h-8 w-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${name}&background=random`; }} />
          ) : (
            <div className="h-8 w-8 flex items-center justify-center text-muted-foreground"><Package className="h-6 w-6" /></div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-card-foreground truncate">{name}</h3>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{description}</p>

          {lastSyncAt && !isAnySyncRunning && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{integrationType === "whatsapp" ? "Conectado" : "Última sync"}: {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: ptBR })}</span>
            </div>
          )}

          {last24hStats && integrationType === "ecommerce" && (last24hStats.orders > 0 || last24hStats.customers > 0 || last24hStats.products > 0) && (
            <div className="mt-3 p-2.5 rounded-lg bg-gradient-to-r from-primary/5 to-green-500/5 border border-primary/20">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-2">
                <Clock className="h-3 w-3" /><span>Sincronizado nas últimas 24h</span>
              </div>
              <div className="flex gap-3">
                {last24hStats.orders > 0 && <div className="flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5 text-purple-500" /><span className="text-xs font-semibold text-foreground">{last24hStats.orders}</span><span className="text-xs text-muted-foreground">pedidos</span></div>}
                {last24hStats.customers > 0 && <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-blue-500" /><span className="text-xs font-semibold text-foreground">{last24hStats.customers}</span><span className="text-xs text-muted-foreground">clientes</span></div>}
                {last24hStats.products > 0 && <div className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-green-500" /><span className="text-xs font-semibold text-foreground">{last24hStats.products}</span><span className="text-xs text-muted-foreground">produtos</span></div>}
              </div>
            </div>
          )}

          {isStopped && hasResumableJobs && onResumeSync && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-yellow-600 font-medium">
                <StopCircle className="h-3 w-3" /><span>Sincronização pausada</span>
              </div>
              <Button variant="outline" size="sm" className="h-6 px-2 gap-1 text-xs" onClick={onResumeSync}>
                <RefreshCw className="h-3 w-3" />Retomar
              </Button>
            </div>
          )}

          {id && status === "connected" && integrationType === "ecommerce" && (
            <IntegrationCardSync
              id={id} status={status} syncJobs={syncJobs} syncStatusId={syncStatus?.id}
              canSync={canSync} isSyncing={isSyncing} syncingType={syncingType}
              isAnySyncRunning={isAnySyncRunning} isAnySyncInProgress={isAnySyncInProgress}
              hasResumableJobs={hasResumableJobs} isStopped={isStopped}
              onSync={onSync} onStopSync={onStopSync}
            />
          )}

          {id && integrationType !== "ecommerce" && (
            <IntegrationTypePanel
              id={id} name={name} type={type} status={status} integrationType={integrationType}
              onReconnect={onReconnect} onReprovision={onReprovision}
              onReconfigureWebhook={onReconfigureWebhook} onTestAI={onTestAI}
              isReprovisioning={isReprovisioning} isReconfiguringWebhook={isReconfiguringWebhook}
              metadata={metadata}
            />
          )}

          {errorMessage && !isAnySyncRunning && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{errorMessage}</span>
            </div>
          )}

          {id && (
            <div className="mt-4 pt-3 border-t border-border/50 flex gap-2">
              {onViewLogs && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => onViewLogs(id, name)}>
                  <FileText className="h-3.5 w-3.5" />Logs
                </Button>
              )}
              {onDelete && (
                <Button variant="outline" size="sm" className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDelete(id)} disabled={isAnySyncRunning}>
                  <Trash2 className="h-3.5 w-3.5" />Excluir
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
