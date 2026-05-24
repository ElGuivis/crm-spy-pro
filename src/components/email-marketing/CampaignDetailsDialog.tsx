import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical } from "lucide-react";
import { useCampaignMetrics } from "@/hooks/useCampaignMetrics";
import { useEmailCampaign } from "@/hooks/useEmailSingle";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignSummaryTab } from "./campaign-details/CampaignSummaryTab";
import { CampaignTimelineTab } from "./campaign-details/CampaignTimelineTab";
import { CampaignLogsTab } from "./campaign-details/CampaignLogsTab";
import { CampaignPreviewTab } from "./campaign-details/CampaignPreviewTab";
import { CampaignABCompareTab } from "./campaign-details/CampaignABCompareTab";
import { CampaignProblemsTab } from "./campaign-details/CampaignProblemsTab";

interface Props {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignDetailsDialog({ campaignId, open, onOpenChange }: Props) {
  const [activeTab, setActiveTab] = useState<string>("resumo");
  const { data: campaign, isLoading: loadingCampaign } = useEmailCampaign(campaignId);
  const { data: metrics, isLoading: loadingMetrics } = useCampaignMetrics(open ? campaignId : undefined);
  const isLoading = loadingCampaign || loadingMetrics;

  const { data: siblingCampaign } = useQuery({
    queryKey: ["ab-sibling", campaign?.ab_test_id, campaignId],
    queryFn: async () => {
      if (!campaign?.ab_test_id) return null;
      const { data } = await supabase
        .from("email_campaigns")
        .select("id, internal_name, subject, ab_variant, total_sent, total_delivered, total_opened, total_clicked, status")
        .eq("ab_test_id", campaign.ab_test_id)
        .neq("id", campaignId)
        .maybeSingle();
      return data;
    },
    enabled: !!campaign?.ab_test_id,
  });
  const { data: siblingMetrics } = useCampaignMetrics(siblingCampaign?.id);

  const problems = metrics?.events.filter((e) => ["bounce", "complaint"].includes(e.event_type)) || [];

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
                  <Badge variant="outline" className="text-xs font-normal">{campaign.status}</Badge>
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
            {campaign?.ab_test_id && (
              <TabsTrigger value="ab" className="gap-1.5">
                <FlaskConical className="h-3.5 w-3.5" />
                Comparar A/B
              </TabsTrigger>
            )}
            {problems.length > 0 && (
              <TabsTrigger value="problemas" className="gap-1.5">
                Problemas
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{problems.length}</Badge>
              </TabsTrigger>
            )}
          </TabsList>

          <CampaignSummaryTab isLoading={isLoading} metrics={metrics} campaign={campaign} />
          <CampaignTimelineTab isLoading={isLoading} events={metrics?.events} />
          <CampaignLogsTab isLoading={isLoading} logs={metrics?.logs} />
          <CampaignPreviewTab isLoading={loadingCampaign} contentHtml={campaign?.content_html} />
          {campaign?.ab_test_id && (
            <CampaignABCompareTab
              campaign={campaign}
              siblingCampaign={siblingCampaign}
              metrics={metrics}
              siblingMetrics={siblingMetrics}
            />
          )}
          <CampaignProblemsTab problems={problems} />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
