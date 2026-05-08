import { cn } from "@/lib/utils";
import { Check, AlertCircle, Loader2, Clock, RefreshCw, Trash2, FileText, Users, Package, ShoppingCart, StopCircle, MessageSquare, QrCode, MessageSquareMore, Webhook, Bot, Zap, Truck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import * as React from "react";
import { useState } from "react";
import { getIntegrationBrand } from "@/lib/integration-logos";

interface SyncProgress {
  customers: { fetched: number; saved: number; total: number };
  products: { fetched: number; saved: number; total: number };
  orders: { fetched: number; saved: number; total: number };
  currentPhase: string;
  isFirstSync: boolean;
}

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

function parseSyncProgress(errorMessage: string | null): SyncProgress | null {
  if (!errorMessage) return null;
  try {
    const parsed = JSON.parse(errorMessage);
    if (parsed.customers !== undefined && parsed.products !== undefined && parsed.orders !== undefined) {
      return parsed as SyncProgress;
    }
  } catch {
    // Not JSON, return null
  }
  return null;
}

// Individual sync button with status
interface SyncButtonProps {
  icon: React.ElementType;
  label: string;
  type: 'customers' | 'products' | 'orders';
  job?: SyncJob;
  isSyncing: boolean;
  canSync: boolean;
  onSync: () => void;
  onStop?: () => void;
  lastSyncAt?: string | null;
  colorClass: string;
}

function SyncButton({ icon: Icon, label, type, job, isSyncing, canSync, onSync, onStop, colorClass }: SyncButtonProps) {
  const isRunning = job?.status === 'running';
  const isCompleted = job?.status === 'completed';
  const isPending = job?.status === 'pending';
  const isFailed = job?.status === 'failed';
  const isPaused = job?.status === 'paused';
  
  // Show progress based on saved_count vs total_count, or indeterminate if total unknown
  const hasTotal = job && job.total_count > 0;
  const progress = hasTotal 
    ? Math.round((job.saved_count / job.total_count) * 100) 
    : 0;
  
  // Show loading state when running but no total yet
  const isLoadingTotal = isRunning && !hasTotal;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", colorClass)} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-1">
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              {hasTotal ? `${job.saved_count}/${job.total_count}` : 'Carregando...'}
            </span>
          )}
          {isPending && (
            <span className="flex items-center gap-1 text-xs text-yellow-600">
              <Clock className="h-3 w-3" />
              Aguardando
            </span>
          )}
          {isCompleted && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              {job.saved_count} OK
            </span>
          )}
          {isFailed && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              Erro
            </span>
          )}
          {isPaused && (
            <span className="flex items-center gap-1 text-xs text-yellow-600">
              <StopCircle className="h-3 w-3" />
              Pausado
            </span>
          )}
        </div>
      </div>
      
      {/* Progress bar when running - show indeterminate animation if total unknown */}
      {isRunning && (
        <div className="relative">
          {isLoadingTotal ? (
            <Progress value={30} className="h-1.5 animate-pulse" />
          ) : (
            <Progress value={progress} className="h-1.5" />
          )}
        </div>
      )}
      
      {/* Sync button */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs gap-1"
          onClick={onSync}
          disabled={!canSync || isRunning || isSyncing}
        >
          {isRunning || (isSyncing && isPending) ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              Sincronizar
            </>
          )}
        </Button>
        {isRunning && onStop && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onStop}
          >
            <StopCircle className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function IntegrationCard({ 
  id,
  name, 
  type,
  description, 
  logo,
  status,
  lastSyncAt,
  errorMessage,
  className,
  integrationType = "ecommerce",
  onSync,
  onStopSync,
  onResumeSync,
  onDelete,
  onViewLogs,
  onReconnect,
  onReprovision,
  onReconfigureWebhook,
  onTestAI,
  isSyncing,
  syncingType,
  syncStatus,
  syncJobs,
  last24hStats,
  isReprovisioning,
  isReconfiguringWebhook,
  metadata
}: IntegrationCardProps) {
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<'success' | 'error' | null>(null);
  // Get jobs by type
  const customersJob = syncJobs?.find(j => j.job_type === 'customers');
  const productsJob = syncJobs?.find(j => j.job_type === 'products');
  const ordersJob = syncJobs?.find(j => j.job_type === 'orders');
  
  // "Running" means actively in progress. "Pending/failed/paused" are resumable states.
  const isAnySyncRunning = syncJobs?.some(j => j.status === 'running');
  const hasResumableJobs = syncJobs?.some(j => j.status === 'pending' || j.status === 'failed' || j.status === 'paused');
  const isAnySyncInProgress = Boolean(isAnySyncRunning || hasResumableJobs);
  const isStopped = syncStatus?.status === 'cancelled' || syncStatus?.status === 'paused';

  // Can sync when connected and not stopped; we only block while there is an active running job.
  const canSync = status === "connected" && !isAnySyncRunning && !isStopped;
  
  const handleStopSync = () => {
    if (onStopSync && syncStatus?.id) {
      onStopSync(syncStatus.id);
    }
  };
  
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
        {(() => {
          const brand = type ? getIntegrationBrand(type) : null;
          const hasRealLogo = brand?.logo;
          return (
            <div className={cn(
              "flex h-14 w-14 items-center justify-center rounded-xl p-2 overflow-hidden",
              hasRealLogo ? (brand?.color || "bg-surface-3") :
              integrationType === "whatsapp" ? "bg-green-500/10" : 
              integrationType === "chatwoot" ? "bg-orange-500/10" : 
              integrationType === "shipping" ? "bg-cyan-500/10" : "bg-surface-3"
            )}>
              {hasRealLogo ? (
                <img 
                  src={brand!.logo} 
                  alt={name} 
                  className="h-8 w-8 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${name}&background=random`;
                  }}
                />
              ) : integrationType === "whatsapp" ? (
                <MessageSquare className="h-7 w-7 text-green-500" />
              ) : integrationType === "chatwoot" ? (
                <MessageSquareMore className="h-7 w-7 text-orange-500" />
              ) : integrationType === "shipping" ? (
                <Truck className="h-7 w-7 text-cyan-500" />
              ) : logo ? (
                <img 
                  src={logo} 
                  alt={name} 
                  className="h-8 w-8 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${name}&background=random`;
                  }}
                />
              ) : (
                <div className="h-8 w-8 flex items-center justify-center text-muted-foreground">
                  <Package className="h-6 w-6" />
                </div>
              )}
            </div>
          );
        })()}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-card-foreground truncate">{name}</h3>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
          
          {/* Last sync info */}
          {lastSyncAt && !isAnySyncRunning && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {integrationType === "whatsapp" ? "Conectado" : "Última sync"}: {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: ptBR })}
              </span>
            </div>
          )}
          
          {/* 24h sync stats */}
          {last24hStats && integrationType === "ecommerce" && (last24hStats.orders > 0 || last24hStats.customers > 0 || last24hStats.products > 0) && (
            <div className="mt-3 p-2.5 rounded-lg bg-gradient-to-r from-primary/5 to-green-500/5 border border-primary/20">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-2">
                <Clock className="h-3 w-3" />
                <span>Sincronizado nas últimas 24h</span>
              </div>
              <div className="flex gap-3">
                {last24hStats.orders > 0 && (
                  <div className="flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5 text-purple-500" />
                    <span className="text-xs font-semibold text-foreground">{last24hStats.orders}</span>
                    <span className="text-xs text-muted-foreground">pedidos</span>
                  </div>
                )}
                {last24hStats.customers > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-semibold text-foreground">{last24hStats.customers}</span>
                    <span className="text-xs text-muted-foreground">clientes</span>
                  </div>
                )}
                {last24hStats.products > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-xs font-semibold text-foreground">{last24hStats.products}</span>
                    <span className="text-xs text-muted-foreground">produtos</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Resume button for stopped syncs */}
          {isStopped && hasResumableJobs && onResumeSync && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-yellow-600 font-medium">
                <StopCircle className="h-3 w-3" />
                <span>Sincronização pausada</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 gap-1 text-xs"
                onClick={onResumeSync}
              >
                <RefreshCw className="h-3 w-3" />
                Retomar
              </Button>
            </div>
          )}
          
          {/* Individual sync buttons - only for ecommerce */}
          {id && status === "connected" && integrationType === "ecommerce" && (
            <div className="mt-4 space-y-2">
              {/* Combined progress indicator when syncing */}
              {isAnySyncInProgress && (() => {
                const jobs = [customersJob, productsJob, ordersJob].filter(Boolean) as SyncJob[];
                const activeJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending' || j.status === 'completed');
                const totalItems = activeJobs.reduce((sum, j) => sum + (j.total_count || 0), 0);
                const savedItems = activeJobs.reduce((sum, j) => sum + (j.saved_count || 0), 0);
                const hasAnyTotal = activeJobs.some(j => j.total_count > 0);
                const overallProgress = hasAnyTotal && totalItems > 0 
                  ? Math.round((savedItems / totalItems) * 100) 
                  : 0;
                const runningCount = activeJobs.filter(j => j.status === 'running').length;
                const completedCount = activeJobs.filter(j => j.status === 'completed').length;
                
                return (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm font-medium text-primary">Sincronização em progresso</span>
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {hasAnyTotal ? `${overallProgress}%` : 'Iniciando...'}
                      </span>
                    </div>
                    <Progress 
                      value={overallProgress} 
                      className="h-2" 
                      indeterminate={!hasAnyTotal}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {hasAnyTotal ? `${savedItems.toLocaleString()} / ${totalItems.toLocaleString()} itens` : 'Carregando totais...'}
                      </span>
                      <span>
                        {completedCount > 0 && `${completedCount} concluído • `}
                        {runningCount > 0 && `${runningCount} em progresso`}
                      </span>
                    </div>
                  </div>
                );
              })()}
              
              {/* Sync All button */}
              <Button
                variant="default"
                size="sm"
                className="w-full gap-2"
                onClick={() => onSync?.(id, 'all')}
                disabled={!status || status !== "connected" || isStopped || isAnySyncRunning || isSyncing}
              >
                {isAnySyncRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : hasResumableJobs ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Continuar Sync
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Sincronizar Tudo
                  </>
                )}
              </Button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">ou individual</span>
                </div>
              </div>
              
              <SyncButton
                icon={Users}
                label="Clientes"
                type="customers"
                job={customersJob}
                isSyncing={isSyncing && syncingType === 'customers'}
                canSync={canSync}
                onSync={() => onSync?.(id, 'customers')}
                onStop={handleStopSync}
                colorClass="text-blue-500"
              />
              <SyncButton
                icon={Package}
                label="Produtos"
                type="products"
                job={productsJob}
                isSyncing={isSyncing && syncingType === 'products'}
                canSync={canSync}
                onSync={() => onSync?.(id, 'products')}
                onStop={handleStopSync}
                colorClass="text-green-500"
              />
              <SyncButton
                icon={ShoppingCart}
                label="Vendas"
                type="orders"
                job={ordersJob}
                isSyncing={isSyncing && syncingType === 'orders'}
                canSync={canSync}
                onSync={() => onSync?.(id, 'orders')}
                onStop={handleStopSync}
                colorClass="text-purple-500"
              />
            </div>
          )}

          {/* WhatsApp status info */}
          {id && integrationType === "whatsapp" && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 text-sm">
                {status === "connected" ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="text-green-600 font-medium">WhatsApp conectado</span>
                  </>
                ) : status === "pending" ? (
                  <>
                    <QrCode className="h-4 w-4 text-yellow-500" />
                    <span className="text-yellow-600 font-medium">Aguardando conexão</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">Desconectado</span>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {status === "pending" && onReconnect && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => onReconnect(id)}
                  >
                    <QrCode className="h-4 w-4" />
                    Escanear QR Code
                  </Button>
                )}
                {status === "connected" && onReconfigureWebhook && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => onReconfigureWebhook(id, name)}
                    disabled={isReconfiguringWebhook}
                  >
                    {isReconfiguringWebhook ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Reconfigurando...
                      </>
                    ) : (
                      <>
                        <Webhook className="h-4 w-4" />
                        Reconfigurar Webhook
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Chatwoot status info */}
          {id && integrationType === "chatwoot" && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 text-sm">
                {status === "connected" ? (
                  <>
                    <Check className="h-4 w-4 text-orange-500" />
                    <span className="text-orange-600 font-medium">Chatwoot conectado</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">Desconectado</span>
                  </>
                )}
              </div>
              {onReprovision && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full gap-2"
                  onClick={() => onReprovision(id)}
                  disabled={isReprovisioning}
                >
                  {isReprovisioning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reprovisionando...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Reprovisionar Chatwoot
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* AI Provider status info */}
          {id && integrationType === "ai" && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 text-sm">
                {status === "connected" ? (
                  <>
                    <Bot className="h-4 w-4 text-violet-500" />
                    <span className="text-violet-600 font-medium">
                      {type === "ai_openai" ? "OpenAI (GPT)" : "Google AI (Gemini)"}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">Desconectado</span>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-2"
                onClick={async () => {
                  if (!onTestAI) return;
                  setIsTestingAI(true);
                  setAiTestResult(null);
                  try {
                    const result = await onTestAI(id);
                    setAiTestResult(result.success ? 'success' : 'error');
                  } catch {
                    setAiTestResult('error');
                  } finally {
                    setIsTestingAI(false);
                  }
                }}
                disabled={isTestingAI || !onTestAI}
              >
                {isTestingAI ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testando...
                  </>
                ) : aiTestResult === 'success' ? (
                  <>
                    <Check className="h-4 w-4 text-green-500" />
                    Conexão OK
                  </>
                ) : aiTestResult === 'error' ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    Falha no Teste
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Testar Integração
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Shipping (Melhor Envio) status info */}
          {id && integrationType === "shipping" && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center gap-2 text-sm">
                {status === "connected" ? (
                  <>
                    <Truck className="h-4 w-4 text-cyan-500" />
                    <span className="text-cyan-600 font-medium">Melhor Envio conectado</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-destructive font-medium">Desconectado</span>
                  </>
                )}
              </div>
              {metadata && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {(metadata as { user_name?: string })?.user_name && (
                    <span>Conta: {(metadata as { user_name?: string }).user_name}</span>
                  )}
                </div>
              )}
            </div>
          )}
          
          {errorMessage && !isAnySyncRunning && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{errorMessage}</span>
            </div>
          )}
          
          {/* Action buttons */}
          {id && (
            <div className="mt-4 pt-3 border-t border-border/50 flex gap-2">
              {onViewLogs && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => onViewLogs(id, name)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Logs
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => onDelete(id)}
                  disabled={isAnySyncRunning}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const StatusBadge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { status: "connected" | "disconnected" | "pending" }
>(({ status, className: classNameProp, ...props }, ref) => {
  const config = {
    connected: {
      icon: Check,
      label: "Online",
      className: "bg-primary/10 text-primary border-primary/20",
    },
    disconnected: {
      icon: AlertCircle,
      label: "Offline",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
    pending: {
      icon: Loader2,
      label: "Pendente",
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className,
        classNameProp
      )}
      {...props}
    >
      <Icon className={cn("h-3 w-3", status === "pending" && "animate-spin")} />
      {label}
    </span>
  );
});
StatusBadge.displayName = "StatusBadge";
