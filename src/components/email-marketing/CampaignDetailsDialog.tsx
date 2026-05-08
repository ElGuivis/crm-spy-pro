import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  CheckCircle2,
  Eye,
  MousePointerClick,
  XCircle,
  AlertTriangle,
  UserMinus,
  Clock,
  Info,
  ExternalLink,
} from "lucide-react";
import { useCampaignMetrics } from "@/hooks/useCampaignMetrics";
import { useEmailCampaign } from "@/hooks/useEmailSingle";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CampaignDetailsDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MetricCardProps {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "destructive";
  showWebhookWarning?: boolean;
}

function MetricCard({ title, value, description, icon: Icon, variant = "default", showWebhookWarning }: MetricCardProps) {
  const variantStyles = {
    default: "text-muted-foreground",
    success: "text-primary",
    warning: "text-yellow-600",
    destructive: "text-destructive",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", variantStyles[variant])} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        {showWebhookWarning && (
          <div className="flex items-center gap-1 mt-1.5">
            <Info className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Requer webhooks</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const eventTypeLabels: Record<string, { label: string; className: string }> = {
  send: { label: "Enviado", className: "bg-secondary" },
  delivered: { label: "Entregue", className: "bg-primary/10 text-primary" },
  open: { label: "Aberto", className: "bg-primary/10 text-primary" },
  click: { label: "Clicado", className: "bg-primary/10 text-primary" },
  bounce: { label: "Bounce", className: "bg-destructive/10 text-destructive" },
  complaint: { label: "Reclamação", className: "bg-destructive/10 text-destructive" },
  unsubscribe: { label: "Descadastro", className: "bg-yellow-100 text-yellow-800" },
};

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-secondary" },
  sent: { label: "Enviado", className: "bg-primary/10 text-primary" },
  delivered: { label: "Entregue", className: "bg-primary/10 text-primary" },
  info: { label: "Info", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  error: { label: "Erro", className: "bg-destructive/10 text-destructive" },
};

export function CampaignDetailsDialog({ campaignId, open, onOpenChange }: CampaignDetailsDialogProps) {
  const [activeTab, setActiveTab] = useState<string>("resumo");
  const { data: campaign, isLoading: loadingCampaign } = useEmailCampaign(campaignId);
  const { data: metrics, isLoading: loadingMetrics } = useCampaignMetrics(open ? campaignId : undefined);

  const isLoading = loadingCampaign || loadingMetrics;

  // Filter problems (bounces, complaints, errors)
  const problems = metrics?.events.filter((e) =>
    ["bounce", "complaint"].includes(e.event_type)
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {loadingCampaign ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <span className="flex items-center gap-2">
                {campaign?.internal_name}
                {campaign?.status && (
                  <Badge variant="outline" className="text-xs font-normal">
                    {campaign.status}
                  </Badge>
                )}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="shrink-0">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            {problems.length > 0 && (
              <TabsTrigger value="problemas" className="gap-1.5">
                Problemas
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {problems.length}
                </Badge>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Resumo Tab */}
          <TabsContent value="resumo" className="flex-1 overflow-y-auto mt-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : metrics ? (
              <div className="space-y-6">
                {/* Main metrics */}
                <div className="grid gap-4 md:grid-cols-4">
                  <MetricCard
                    title="Enviados"
                    value={metrics.total_sent}
                    icon={Send}
                  />
                  <MetricCard
                    title="Entregues"
                    value={metrics.total_delivered}
                    description={`${metrics.delivery_rate}% taxa de entrega`}
                    icon={CheckCircle2}
                    variant="success"
                  />
                  <MetricCard
                    title="Abertos"
                    value={metrics.total_opened}
                    description={`${metrics.open_rate}% taxa de abertura`}
                    icon={Eye}
                    variant="success"
                    showWebhookWarning={metrics.total_opened === 0 && metrics.total_sent > 0}
                  />
                  <MetricCard
                    title="Clicados"
                    value={metrics.total_clicked}
                    description={`${metrics.click_rate}% CTR`}
                    icon={MousePointerClick}
                    variant="success"
                    showWebhookWarning={metrics.total_clicked === 0 && metrics.total_sent > 0}
                  />
                </div>

                {/* Problem metrics */}
                <div className="grid gap-4 md:grid-cols-4">
                  <MetricCard
                    title="Bounces"
                    value={metrics.total_bounced}
                    description={`${metrics.bounce_rate}%`}
                    icon={XCircle}
                    variant={metrics.total_bounced > 0 ? "destructive" : "default"}
                  />
                  <MetricCard
                    title="Reclamações"
                    value={metrics.total_complained}
                    description={`${metrics.complaint_rate}%`}
                    icon={AlertTriangle}
                    variant={metrics.total_complained > 0 ? "warning" : "default"}
                  />
                  <MetricCard
                    title="Descadastros"
                    value={metrics.total_unsubscribed}
                    icon={UserMinus}
                    variant={metrics.total_unsubscribed > 0 ? "warning" : "default"}
                  />
                  <MetricCard
                    title="Erros"
                    value={metrics.total_errors}
                    description={`${metrics.error_rate}%`}
                    icon={XCircle}
                    variant={metrics.total_errors > 0 ? "destructive" : "default"}
                  />
                </div>

                {/* Campaign info */}
                {campaign && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Informações da Campanha</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Assunto:</span>
                        <p className="font-medium">{campaign.subject}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Remetente:</span>
                        <p className="font-medium">{campaign.sender_name} &lt;{campaign.sender_email}&gt;</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Criada em:</span>
                        <p className="font-medium">
                          {format(new Date(campaign.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      {campaign.sent_at && (
                        <div>
                          <span className="text-muted-foreground">Enviada em:</span>
                          <p className="font-medium">
                            {format(new Date(campaign.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : null}
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-[400px] pr-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : metrics?.events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-10 w-10 mb-3" />
                  <p>Nenhum evento registrado ainda</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {metrics?.events.length === 500 && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-xs text-muted-foreground mb-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      Mostrando os 500 primeiros eventos. Podem existir mais registros.
                    </div>
                  )}
                  {metrics?.events.map((event) => {
                    const config = eventTypeLabels[event.event_type] || {
                      label: event.event_type,
                      className: "bg-secondary",
                    };
                    return (
                      <div
                        key={event.id}
                        className="flex items-center gap-3 p-3 rounded-lg border"
                      >
                        <Badge className={cn("shrink-0", config.className)}>
                          {config.label}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {event.recipient_email}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {format(new Date(event.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <Skeleton className="h-64" />
              ) : metrics?.logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-10 w-10 mb-3" />
                  <p>Nenhum log disponível</p>
                </div>
              ) : (
                <>
                  {metrics?.logs.length === 500 && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-xs text-muted-foreground mb-2">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      Mostrando os 500 primeiros logs. Podem existir mais registros.
                    </div>
                  )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enviado em</TableHead>
                      <TableHead>Entregue em</TableHead>
                      <TableHead>Erro</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics?.logs.map((log) => {
                      const statusConfig = statusLabels[log.status] || {
                        label: log.status,
                        className: "bg-secondary",
                      };
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">
                            {log.recipient_email}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("text-xs", statusConfig.className)}>
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {log.sent_at
                              ? format(new Date(log.sent_at), "dd/MM HH:mm", { locale: ptBR })
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {log.delivered_at
                              ? format(new Date(log.delivered_at), "dd/MM HH:mm", { locale: ptBR })
                              : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                            {log.error_message || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="flex-1 overflow-hidden mt-4">
            {loadingCampaign ? (
              <Skeleton className="h-[400px]" />
            ) : campaign?.content_html ? (
              <div className="border rounded-lg overflow-hidden h-[400px]">
                <iframe
                  srcDoc={campaign.content_html}
                  title="Email Preview"
                  className="w-full h-full bg-white"
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg h-[400px]">
                <ExternalLink className="h-10 w-10 mb-3" />
                <p>Nenhum conteúdo HTML disponível</p>
              </div>
            )}
          </TabsContent>

          {/* Problems Tab */}
          <TabsContent value="problemas" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-[400px]">
              {problems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mb-3 text-primary" />
                  <p>Nenhum problema encontrado</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {problems.map((event) => {
                    const config = eventTypeLabels[event.event_type] || {
                      label: event.event_type,
                      className: "bg-destructive/10 text-destructive",
                    };
                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5"
                      >
                        <Badge className={cn("shrink-0 mt-0.5", config.className)}>
                          {config.label}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{event.recipient_email}</p>
                          {event.metadata && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {JSON.stringify(event.metadata)}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {format(new Date(event.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
