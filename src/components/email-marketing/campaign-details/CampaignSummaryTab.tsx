import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, CheckCircle2, Eye, MousePointerClick, XCircle, AlertTriangle, UserMinus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MetricCard } from "./MetricCard";
import { SendProgressBanner } from "./SendProgressBanner";

import type { EmailCampaign } from "@/hooks/useEmailCampaigns";
import type { CampaignMetrics } from "@/hooks/useCampaignMetrics";
type SummaryCampaign = Pick<EmailCampaign, "id" | "status" | "subject" | "sender_name" | "sender_email" | "created_at" | "sent_at" | "error_message">;

interface Props {
  isLoading: boolean;
  metrics: CampaignMetrics | null | undefined;
  campaign: SummaryCampaign | null | undefined;
}

export function CampaignSummaryTab({ isLoading, metrics, campaign }: Props) {
  return (
    <TabsContent value="resumo" className="flex-1 overflow-y-auto mt-4">
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : metrics ? (
        <div className="space-y-6">
          {campaign?.id && <SendProgressBanner campaignId={campaign.id} status={campaign.status} errorMessage={campaign.error_message} />}
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Enviados" value={metrics.total_sent} icon={Send} />
            <MetricCard title="Entregues" value={metrics.total_delivered}
              description={`${metrics.delivery_rate}% taxa de entrega`}
              icon={CheckCircle2} variant="success" />
            <MetricCard title="Abertos" value={metrics.total_opened}
              description={`${metrics.open_rate}% taxa de abertura`}
              icon={Eye} variant="success"
              showWebhookWarning={metrics.total_opened === 0 && metrics.total_sent > 0} />
            <MetricCard title="Clicados" value={metrics.total_clicked}
              description={`${metrics.click_rate}% CTR`}
              icon={MousePointerClick} variant="success"
              showWebhookWarning={metrics.total_clicked === 0 && metrics.total_sent > 0} />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Bounces" value={metrics.total_bounced}
              description={`${metrics.bounce_rate}%`} icon={XCircle}
              variant={metrics.total_bounced > 0 ? "destructive" : "default"} />
            <MetricCard title="Reclamações" value={metrics.total_complained}
              description={`${metrics.complaint_rate}%`} icon={AlertTriangle}
              variant={metrics.total_complained > 0 ? "warning" : "default"} />
            <MetricCard title="Descadastros" value={metrics.total_unsubscribed} icon={UserMinus}
              variant={metrics.total_unsubscribed > 0 ? "warning" : "default"} />
            <MetricCard title="Erros" value={metrics.total_errors}
              description={`${metrics.error_rate}%`} icon={XCircle}
              variant={metrics.total_errors > 0 ? "destructive" : "default"} />
          </div>

          {campaign && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Informações da Campanha</CardTitle></CardHeader>
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
                  <p className="font-medium">{format(new Date(campaign.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                </div>
                {campaign.sent_at && (
                  <div>
                    <span className="text-muted-foreground">Enviada em:</span>
                    <p className="font-medium">{format(new Date(campaign.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </TabsContent>
  );
}
