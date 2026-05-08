import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, FileText, Calendar, CheckCircle2, AlertCircle, Loader2, UserX } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { EmailCampaignList } from "@/components/email-marketing/EmailCampaignList";
import { EmailCampaignFormDialog } from "@/components/email-marketing/EmailCampaignFormDialog";
import { EmailTemplateList } from "@/components/email-marketing/EmailTemplateList";
import { EmailTemplateFormDialog } from "@/components/email-marketing/EmailTemplateFormDialog";
import { SuppressionListManager } from "@/components/email-marketing/SuppressionListManager";
import { useEmailCampaigns } from "@/hooks/useEmailCampaigns";
import { useSuppressionList } from "@/hooks/useSuppressionList";

const StatCard = ({
  title,
  value,
  icon: Icon,
  description,
  isLoading,
  accent,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
  isLoading: boolean;
  accent?: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className={`h-4 w-4 ${accent || 'text-muted-foreground'}`} />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </>
      )}
    </CardContent>
  </Card>
);

export default function EmailMarketing() {
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | undefined>();
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>();

  const { data: allCampaigns, isLoading: loadingAll } = useEmailCampaigns();
  const { data: draftCampaigns, isLoading: loadingDraft } = useEmailCampaigns({ status: 'draft' });
  const { data: scheduledCampaigns, isLoading: loadingScheduled } = useEmailCampaigns({ status: 'scheduled' });
  const { data: sentCampaigns, isLoading: loadingSent } = useEmailCampaigns({ status: 'sent' });
  const { data: errorCampaigns } = useEmailCampaigns({ status: 'error' });
  const { counts: suppressionCounts } = useSuppressionList();

  const handleEditCampaign = (id: string) => {
    setEditingCampaignId(id);
    setCampaignDialogOpen(true);
  };

  const handleEditTemplate = (id: string) => {
    setEditingTemplateId(id);
    setTemplateDialogOpen(true);
  };

  const handleCloseCampaignDialog = (open: boolean) => {
    if (!open) {
      setCampaignDialogOpen(false);
      setEditingCampaignId(undefined);
    } else {
      setCampaignDialogOpen(true);
    }
  };

  const handleCloseTemplateDialog = (open: boolean) => {
    if (!open) {
      setTemplateDialogOpen(false);
      setEditingTemplateId(undefined);
    } else {
      setTemplateDialogOpen(true);
    }
  };

  const hasErrors = (errorCampaigns?.length ?? 0) > 0;

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader
          title="E-mail Marketing"
          subtitle="Crie e gerencie campanhas de e-mail para seus clientes"
          icon={Mail}
        />

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            title="Total de Campanhas"
            value={allCampaigns?.length ?? 0}
            icon={Mail}
            description="Todas as campanhas"
            isLoading={loadingAll}
          />
          <StatCard
            title="Rascunhos"
            value={draftCampaigns?.length ?? 0}
            icon={FileText}
            description="Em edição"
            isLoading={loadingDraft}
          />
          <StatCard
            title="Agendadas"
            value={scheduledCampaigns?.length ?? 0}
            icon={Calendar}
            description="Prontas para envio"
            isLoading={loadingScheduled}
            accent="text-primary"
          />
          <StatCard
            title="Enviadas"
            value={sentCampaigns?.length ?? 0}
            icon={CheckCircle2}
            description="Concluídas com sucesso"
            isLoading={loadingSent}
            accent="text-primary"
          />
        </div>

        {/* Error alert banner */}
        {hasErrors && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              <strong>{errorCampaigns!.length} campanha(s)</strong> tiveram erro no envio. Revise as campanhas com status "Erro".
            </span>
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="campaigns" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <TabsList>
              <TabsTrigger value="campaigns" className="gap-2">
                Campanhas
                {(allCampaigns?.length ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                    {allCampaigns!.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="suppression" className="gap-2">
                <UserX className="h-4 w-4" />
                Supressão
                {suppressionCounts.total > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                    {suppressionCounts.total}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setTemplateDialogOpen(true)}
              >
                <FileText className="h-4 w-4" />
                Novo Template
              </Button>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setCampaignDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Nova Campanha
              </Button>
            </div>
          </div>

          <TabsContent value="campaigns" className="space-y-4">
            <EmailCampaignList onEdit={handleEditCampaign} />
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <EmailTemplateList onEdit={handleEditTemplate} />
          </TabsContent>

          <TabsContent value="suppression" className="space-y-4">
            <SuppressionListManager />
          </TabsContent>
        </Tabs>

        <EmailCampaignFormDialog
          open={campaignDialogOpen}
          onOpenChange={handleCloseCampaignDialog}
          campaignId={editingCampaignId}
        />

        <EmailTemplateFormDialog
          open={templateDialogOpen}
          onOpenChange={handleCloseTemplateDialog}
          templateId={editingTemplateId}
        />
      </div>
    </PageTransition>
  );
}

