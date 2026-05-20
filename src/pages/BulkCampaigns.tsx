import { useEffect, useState } from "react";
import { Send, Plus, Loader2, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTokens } from "@/contexts/TokenContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CampaignStatsBar } from "@/components/bulk-campaigns/CampaignStatsBar";
import { CampaignCard } from "@/components/bulk-campaigns/CampaignCard";
import { CampaignDetailsDialog } from "@/components/bulk-campaigns/CampaignDetailsDialog";
import { CreateCampaignDialog } from "@/components/bulk-campaigns/CreateCampaignDialog";
import { EditCampaignMessageDialog } from "@/components/bulk-campaigns/EditCampaignMessageDialog";
import { ABTestBulkDialog } from "@/components/bulk-campaigns/ABTestBulkDialog";
import { useBulkCampaigns } from "@/hooks/useBulkCampaigns";
import type { Campaign } from "@/components/bulk-campaigns/types";

const BulkCampaignsPage = () => {
  const { balance } = useTokens();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<Campaign | null>(null);
  const [abTestCampaign, setAbTestCampaign] = useState<Campaign | null>(null);
  const {
    campaigns, integrations, loading,
    loadCampaigns, loadIntegrations,
    startCampaign, pauseCampaign, retryFailed, deleteCampaign,
    viewDetails,
    detailsCampaign, setDetailsCampaign,
    detailsContacts, detailsLoading,
    deleteId, setDeleteId,
  } = useBulkCampaigns();

  useEffect(() => {
    loadCampaigns();
    loadIntegrations();
  }, [loadCampaigns, loadIntegrations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Disparos em Massa</h1>
          <p className="text-muted-foreground">Envie mensagens em massa via WhatsApp</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <Coins className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-primary">{balance.toLocaleString("pt-BR")} tokens</span>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Campanha
          </Button>
        </div>
      </div>

      <CampaignStatsBar campaigns={campaigns} />

      {/* Campaign List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Send className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Nenhuma campanha criada</h3>
          <p className="text-muted-foreground mb-4">Crie sua primeira campanha de disparo em massa</p>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar Campanha
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onStart={startCampaign}
              onPause={pauseCampaign}
              onView={viewDetails}
              onDelete={setDeleteId}
              onEdit={setEditCampaign}
              onRetryFailed={retryFailed}
              onCreateABTest={setAbTestCampaign}
            />
          ))}
        </div>
      )}

      <CreateCampaignDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        integrations={integrations}
        onCreated={loadCampaigns}
      />

      <CampaignDetailsDialog
        campaign={detailsCampaign}
        contacts={detailsContacts}
        loading={detailsLoading}
        onClose={() => setDetailsCampaign(null)}
      />

      <EditCampaignMessageDialog
        campaign={editCampaign}
        onClose={() => setEditCampaign(null)}
        onSaved={loadCampaigns}
      />

      {abTestCampaign && (
        <ABTestBulkDialog
          campaign={abTestCampaign}
          open={!!abTestCampaign}
          onOpenChange={(o) => { if (!o) setAbTestCampaign(null); }}
          onCreated={loadCampaigns}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os contatos e dados da campanha serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCampaign} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BulkCampaignsPage;
