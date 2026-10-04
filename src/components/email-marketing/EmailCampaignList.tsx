import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Mail } from "lucide-react";
import {
  useEmailCampaigns, useDeleteEmailCampaign, useArchiveEmailCampaign, useDuplicateEmailCampaign, useUpdateEmailCampaign,
  EmailCampaignStatus, EmailCampaign,
} from "@/hooks/useEmailCampaigns";
import { EmptyState } from "@/components/common/EmptyState";
import { EmailCampaignRow } from "./email-campaign-list/EmailCampaignRow";
import { EmailCampaignListDialogs } from "./email-campaign-list/EmailCampaignListDialogs";

interface Props {
  onEdit: (id: string) => void;
  statusFilter?: EmailCampaignStatus;
}

export function EmailCampaignList({ onEdit, statusFilter }: Props) {
  const [search, setSearch] = useState("");
  const [reviewCampaign, setReviewCampaign] = useState<EmailCampaign | null>(null);
  const [testCampaign, setTestCampaign] = useState<EmailCampaign | null>(null);
  const [scheduleCampaign, setScheduleCampaign] = useState<EmailCampaign | null>(null);
  const [sendCampaign, setSendCampaign] = useState<EmailCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailCampaign | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EmailCampaign | null>(null);
  const [detailsCampaignId, setDetailsCampaignId] = useState<string | null>(null);
  const [abTestCampaign, setAbTestCampaign] = useState<EmailCampaign | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data: campaigns, isLoading, refetch } = useEmailCampaigns({ status: statusFilter, search });
  const deleteMutation = useDeleteEmailCampaign();
  const archiveMutation = useArchiveEmailCampaign();
  const duplicateMutation = useDuplicateEmailCampaign();
  const updateMutation = useUpdateEmailCampaign();

  // O envio verifica o status a cada lote: "pausada" interrompe no fim do lote atual e "Retomar envio" continua de onde parou
  const handlePause = async (campaign: EmailCampaign) => {
    if (pendingAction) return;
    setPendingAction(`pause-${campaign.id}`);
    try { await updateMutation.mutateAsync({ id: campaign.id, updates: { status: "paused" } }); } finally { setPendingAction(null); }
  };

  const handleDuplicate = async (campaign: EmailCampaign) => {
    if (pendingAction) return;
    setPendingAction(`duplicate-${campaign.id}`);
    try { await duplicateMutation.mutateAsync(campaign.id); } finally { setPendingAction(null); }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setPendingAction(`archive-${archiveTarget.id}`);
    try { await archiveMutation.mutateAsync(archiveTarget.id); } finally { setPendingAction(null); setArchiveTarget(null); }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setPendingAction(`delete-${deleteTarget.id}`);
    try { await deleteMutation.mutateAsync(deleteTarget.id); } finally { setPendingAction(null); setDeleteTarget(null); }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const rowActions = {
    onReview: setReviewCampaign,
    onTest: setTestCampaign,
    onSchedule: setScheduleCampaign,
    onSend: setSendCampaign,
    onDetails: setDetailsCampaignId,
    onEdit,
    onDuplicate: handleDuplicate,
    onAbTest: setAbTestCampaign,
    onArchive: setArchiveTarget,
    onPause: handlePause,
    onDelete: setDeleteTarget,
  };

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou assunto…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
          </div>

          {(!campaigns || campaigns.length === 0) ? (
            <EmptyState
              icon={Mail}
              title={search ? "Nenhum resultado encontrado" : "Nenhuma campanha criada ainda"}
              description={search ? "Tente ajustar os termos de busca." : "Crie sua primeira campanha de e-mail para começar."}
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome Interno</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Remetente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Agendamento</TableHead>
                    <TableHead>Atualização</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <EmailCampaignRow
                      key={campaign.id}
                      campaign={campaign}
                      isActing={!!pendingAction?.endsWith(campaign.id)}
                      pendingAction={pendingAction}
                      actions={rowActions}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmailCampaignListDialogs
        deleteTarget={deleteTarget}
        archiveTarget={archiveTarget}
        reviewCampaign={reviewCampaign}
        testCampaign={testCampaign}
        scheduleCampaign={scheduleCampaign}
        sendCampaign={sendCampaign}
        detailsCampaignId={detailsCampaignId}
        abTestCampaign={abTestCampaign}
        pendingAction={pendingAction}
        setDeleteTarget={setDeleteTarget}
        setArchiveTarget={setArchiveTarget}
        setReviewCampaign={setReviewCampaign}
        setTestCampaign={setTestCampaign}
        setScheduleCampaign={setScheduleCampaign}
        setSendCampaign={setSendCampaign}
        setDetailsCampaignId={setDetailsCampaignId}
        setAbTestCampaign={setAbTestCampaign}
        onDeleteConfirm={handleDeleteConfirm}
        onArchiveConfirm={handleArchiveConfirm}
        onRefetch={refetch}
      />
    </>
  );
}
