import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Trophy } from "lucide-react";

import type { EmailCampaign } from "@/hooks/useEmailCampaigns";
import type { CampaignMetrics } from "@/hooks/useCampaignMetrics";
type AbCampaign = Pick<EmailCampaign, "subject" | "status">;

interface Props {
  campaign: AbCampaign | null | undefined;
  siblingCampaign: AbCampaign | null | undefined;
  metrics: CampaignMetrics | null | undefined;
  siblingMetrics: CampaignMetrics | null | undefined;
}

export function CampaignABCompareTab({ campaign, siblingCampaign, metrics, siblingMetrics }: Props) {
  const variants = [
    { label: "Variante A", camp: campaign, met: metrics },
    { label: "Variante B", camp: siblingCampaign, met: siblingMetrics },
  ] as const;

  return (
    <TabsContent value="ab" className="flex-1 overflow-y-auto mt-4">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {variants.map(({ label, camp, met }) => {
            const openRate = met && met.total_delivered > 0 ? (met.total_opened / met.total_delivered * 100).toFixed(1) : "—";
            const clickRate = met && met.total_delivered > 0 ? (met.total_clicked / met.total_delivered * 100).toFixed(1) : "—";
            const isWinner = metrics && siblingMetrics &&
              (label === "Variante A"
                ? metrics.open_rate > siblingMetrics.open_rate
                : siblingMetrics.open_rate > metrics.open_rate);
            return (
              <Card key={label} className={isWinner ? "border-primary/50 bg-primary/5" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-purple-600" />
                    {label}
                    {isWinner && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground gap-1">
                        <Trophy className="h-3 w-3" />Vencedor
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground truncate">{camp?.subject ?? "—"}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Enviados</span><strong>{met?.total_sent ?? "—"}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxa abertura</span><strong className={isWinner ? "text-primary" : ""}>{openRate}{openRate !== "—" ? "%" : ""}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">CTR</span><strong>{clickRate}{clickRate !== "—" ? "%" : ""}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cliques</span><strong>{met?.total_clicked ?? "—"}</strong></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="text-[10px]">{camp?.status ?? "—"}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {(!metrics?.total_sent && !siblingMetrics?.total_sent) && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Envie as duas variantes para ver a comparação de resultados.
          </p>
        )}
      </div>
    </TabsContent>
  );
}
