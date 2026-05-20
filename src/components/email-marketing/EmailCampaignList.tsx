import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  MoreVertical,
  Edit,
  Copy,
  Archive,
  Trash2,
  Calendar,
  Eye,
  TestTube,
  Send,
  Mail,
  Loader2,
  FlaskConical,
} from "lucide-react";
import { ABTestEmailDialog } from "./ABTestEmailDialog";
import {
  useEmailCampaigns,
  useDeleteEmailCampaign,
  useArchiveEmailCampaign,
  useDuplicateEmailCampaign,
  EmailCampaignStatus,
  EmailCampaign,
} from "@/hooks/useEmailCampaigns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CampaignReviewDialog } from "./CampaignReviewDialog";
import { SendTestEmailDialog } from "./SendTestEmailDialog";
import { ScheduleCampaignDialog } from "./ScheduleCampaignDialog";
import { ConfirmSendDialog } from "./ConfirmSendDialog";
import { CampaignDetailsDialog } from "./CampaignDetailsDialog";
import { EmptyState } from "@/components/common/EmptyState";

interface EmailCampaignListProps {
  onEdit: (id: string) => void;
  statusFilter?: EmailCampaignStatus;
}

const statusConfig: Record<EmailCampaignStatus, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-secondary text-secondary-foreground' },
  scheduled: { label: 'Agendada', className: 'bg-primary/10 text-primary' },
  sending: { label: 'Enviando…', className: 'bg-primary/20 text-primary' },
  sent: { label: 'Enviada', className: 'bg-primary/10 text-primary' },
  paused: { label: 'Pausada', className: 'bg-secondary text-secondary-foreground' },
  canceled: { label: 'Cancelada', className: 'bg-destructive/10 text-destructive' },
  error: { label: 'Erro', className: 'bg-destructive/10 text-destructive' },
};

const typeLabels: Record<string, string> = {
  newsletter: 'Newsletter',
  promotion: 'Promoção',
  relationship: 'Relacionamento',
  automation: 'Automação',
  update: 'Atualização',
};

export function EmailCampaignList({ onEdit, statusFilter }: EmailCampaignListProps) {
  const [search, setSearch] = useState('');
  const [reviewCampaign, setReviewCampaign] = useState<EmailCampaign | null>(null);
  const [testCampaign, setTestCampaign] = useState<EmailCampaign | null>(null);
  const [scheduleCampaign, setScheduleCampaign] = useState<EmailCampaign | null>(null);
  const [sendCampaign, setSendCampaign] = useState<EmailCampaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmailCampaign | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EmailCampaign | null>(null);
  const [detailsCampaignId, setDetailsCampaignId] = useState<string | null>(null);
  const [abTestCampaign, setAbTestCampaign] = useState<EmailCampaign | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const { data: campaigns, isLoading, refetch } = useEmailCampaigns({
    status: statusFilter,
    search,
  });
  const deleteMutation = useDeleteEmailCampaign();
  const archiveMutation = useArchiveEmailCampaign();
  const duplicateMutation = useDuplicateEmailCampaign();

  const handleDuplicate = async (campaign: EmailCampaign) => {
    if (pendingAction) return;
    setPendingAction(`duplicate-${campaign.id}`);
    try {
      await duplicateMutation.mutateAsync(campaign.id);
    } finally {
      setPendingAction(null);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archiveTarget) return;
    setPendingAction(`archive-${archiveTarget.id}`);
    try {
      await archiveMutation.mutateAsync(archiveTarget.id);
    } finally {
      setPendingAction(null);
      setArchiveTarget(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setPendingAction(`delete-${deleteTarget.id}`);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
    } finally {
      setPendingAction(null);
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou assunto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {(!campaigns || campaigns.length === 0) ? (
            <EmptyState
              icon={Mail}
              title={search ? "Nenhum resultado encontrado" : "Nenhuma campanha criada ainda"}
              description={
                search
                  ? "Tente ajustar os termos de busca."
                  : "Crie sua primeira campanha de e-mail para começar."
              }
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
                  {campaigns.map((campaign) => {
                    const sc = statusConfig[campaign.status] || { label: campaign.status, className: 'bg-secondary text-secondary-foreground' };
                    const isActing = pendingAction?.endsWith(campaign.id);
                    return (
                      <TableRow key={campaign.id} className={isActing ? 'opacity-60' : ''}>
                        <TableCell className="font-medium max-w-[200px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="truncate">{campaign.internal_name}</span>
                            {campaign.ab_test_id && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 text-purple-700 bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:bg-purple-950/30 shrink-0">
                                {campaign.ab_variant ?? "A/B"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{campaign.subject}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {typeLabels[campaign.campaign_type] || campaign.campaign_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium truncate max-w-[120px]">{campaign.sender_name}</div>
                            <div className="text-muted-foreground text-xs truncate max-w-[140px]">
                              {campaign.sender_email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sc.className}`}>
                            {campaign.status === 'sending' && (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            )}
                            {sc.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {campaign.scheduled_at ? (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>
                                {format(new Date(campaign.scheduled_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(campaign.updated_at), "dd/MM/yy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" disabled={!!isActing}>
                                {isActing ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MoreVertical className="h-4 w-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {['draft', 'scheduled', 'error'].includes(campaign.status) && (
                                <>
                                  <DropdownMenuItem onClick={() => setReviewCampaign(campaign)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Revisar e Enviar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setTestCampaign(campaign)}>
                                    <TestTube className="h-4 w-4 mr-2" />
                                    Enviar Teste
                                  </DropdownMenuItem>
                                  {['draft', 'error'].includes(campaign.status) && (
                                    <DropdownMenuItem onClick={() => setScheduleCampaign(campaign)}>
                                      <Calendar className="h-4 w-4 mr-2" />
                                      Agendar
                                    </DropdownMenuItem>
                                  )}
                                  {campaign.status === 'draft' && (
                                    <DropdownMenuItem onClick={() => setSendCampaign(campaign)}>
                                      <Send className="h-4 w-4 mr-2 text-primary" />
                                      <span className="text-primary font-medium">Enviar Agora</span>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {/* Ver Detalhes - always visible for sent/sending campaigns */}
                              {['sent', 'sending', 'error'].includes(campaign.status) && (
                                <DropdownMenuItem onClick={() => setDetailsCampaignId(campaign.id)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Detalhes
                                </DropdownMenuItem>
                              )}
                              {['draft', 'scheduled', 'error', 'paused'].includes(campaign.status) && (
                                <DropdownMenuItem onClick={() => onEdit(campaign.id)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Editar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => handleDuplicate(campaign)}
                                disabled={!!pendingAction}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicar
                              </DropdownMenuItem>
                              {campaign.status === 'draft' && !campaign.ab_test_id && (
                                <DropdownMenuItem onClick={() => setAbTestCampaign(campaign)}>
                                  <FlaskConical className="h-4 w-4 mr-2 text-purple-600" />
                                  <span className="text-purple-700 dark:text-purple-400">Criar Teste A/B</span>
                                </DropdownMenuItem>
                              )}
                              {!['sending'].includes(campaign.status) && (
                                <DropdownMenuItem
                                  onClick={() => setArchiveTarget(campaign)}
                                >
                                  <Archive className="h-4 w-4 mr-2" />
                                  Arquivar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {!['sending'].includes(campaign.status) && (
                                <DropdownMenuItem
                                  onClick={() => setDeleteTarget(campaign)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Excluir
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>"{deleteTarget?.internal_name}"</strong> será excluída permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!pendingAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={!!pendingAction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pendingAction?.startsWith('delete') && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>"{archiveTarget?.internal_name}"</strong> será arquivada e não aparecerá mais na lista principal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!pendingAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm} disabled={!!pendingAction}>
              {pendingAction?.startsWith('archive') && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {reviewCampaign && (
        <CampaignReviewDialog
          campaign={reviewCampaign}
          open={!!reviewCampaign}
          onOpenChange={(open) => !open && setReviewCampaign(null)}
          onProceed={() => {
            setSendCampaign(reviewCampaign);
            setReviewCampaign(null);
          }}
        />
      )}

      {testCampaign && (
        <SendTestEmailDialog
          campaignId={testCampaign.id}
          open={!!testCampaign}
          onOpenChange={(open) => !open && setTestCampaign(null)}
        />
      )}

      {scheduleCampaign && (
        <ScheduleCampaignDialog
          campaignId={scheduleCampaign.id}
          open={!!scheduleCampaign}
          onOpenChange={(open) => !open && setScheduleCampaign(null)}
        />
      )}

      {sendCampaign && (
        <ConfirmSendDialog
          campaignId={sendCampaign.id}
          campaignName={sendCampaign.internal_name}
          audienceType={sendCampaign.audience_type ?? undefined}
          audienceReference={sendCampaign.audience_reference ?? undefined}
          open={!!sendCampaign}
          onOpenChange={(open) => !open && setSendCampaign(null)}
          onSuccess={() => {
            setSendCampaign(null);
            refetch();
          }}
        />
      )}

      {detailsCampaignId && (
        <CampaignDetailsDialog
          campaignId={detailsCampaignId}
          open={!!detailsCampaignId}
          onOpenChange={(open) => !open && setDetailsCampaignId(null)}
        />
      )}

      {abTestCampaign && (
        <ABTestEmailDialog
          campaignId={abTestCampaign.id}
          subjectA={abTestCampaign.subject}
          open={!!abTestCampaign}
          onOpenChange={(open) => !open && setAbTestCampaign(null)}
        />
      )}
    </>
  );
}
