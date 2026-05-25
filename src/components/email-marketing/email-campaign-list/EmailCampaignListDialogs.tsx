import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { CampaignReviewDialog } from "../CampaignReviewDialog";
import { SendTestEmailDialog } from "../SendTestEmailDialog";
import { ScheduleCampaignDialog } from "../ScheduleCampaignDialog";
import { ConfirmSendDialog } from "../ConfirmSendDialog";
import { CampaignDetailsDialog } from "../CampaignDetailsDialog";
import { ABTestEmailDialog } from "../ABTestEmailDialog";
import type { EmailCampaign } from "@/hooks/useEmailCampaigns";

interface Props {
  deleteTarget: EmailCampaign | null;
  archiveTarget: EmailCampaign | null;
  reviewCampaign: EmailCampaign | null;
  testCampaign: EmailCampaign | null;
  scheduleCampaign: EmailCampaign | null;
  sendCampaign: EmailCampaign | null;
  detailsCampaignId: string | null;
  abTestCampaign: EmailCampaign | null;
  pendingAction: string | null;
  setDeleteTarget: (c: EmailCampaign | null) => void;
  setArchiveTarget: (c: EmailCampaign | null) => void;
  setReviewCampaign: (c: EmailCampaign | null) => void;
  setTestCampaign: (c: EmailCampaign | null) => void;
  setScheduleCampaign: (c: EmailCampaign | null) => void;
  setSendCampaign: (c: EmailCampaign | null) => void;
  setDetailsCampaignId: (id: string | null) => void;
  setAbTestCampaign: (c: EmailCampaign | null) => void;
  onDeleteConfirm: () => void;
  onArchiveConfirm: () => void;
  onRefetch: () => void;
}

export function EmailCampaignListDialogs(p: Props) {
  return (
    <>
      <AlertDialog open={!!p.deleteTarget} onOpenChange={(o) => !o && p.setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>"{p.deleteTarget?.internal_name}"</strong> será excluída permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!p.pendingAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={p.onDeleteConfirm} disabled={!!p.pendingAction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {p.pendingAction?.startsWith("delete") && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!p.archiveTarget} onOpenChange={(o) => !o && p.setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha <strong>"{p.archiveTarget?.internal_name}"</strong> será arquivada e não aparecerá mais na lista principal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!p.pendingAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={p.onArchiveConfirm} disabled={!!p.pendingAction}>
              {p.pendingAction?.startsWith("archive") && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {p.reviewCampaign && (
        <CampaignReviewDialog
          campaign={p.reviewCampaign}
          open={!!p.reviewCampaign}
          onOpenChange={(open) => !open && p.setReviewCampaign(null)}
          onProceed={() => { p.setSendCampaign(p.reviewCampaign); p.setReviewCampaign(null); }}
        />
      )}

      {p.testCampaign && (
        <SendTestEmailDialog campaignId={p.testCampaign.id} open={!!p.testCampaign} onOpenChange={(open) => !open && p.setTestCampaign(null)} />
      )}

      {p.scheduleCampaign && (
        <ScheduleCampaignDialog campaignId={p.scheduleCampaign.id} open={!!p.scheduleCampaign} onOpenChange={(open) => !open && p.setScheduleCampaign(null)} />
      )}

      {p.sendCampaign && (
        <ConfirmSendDialog
          campaignId={p.sendCampaign.id}
          campaignName={p.sendCampaign.internal_name}
          audienceType={p.sendCampaign.audience_type ?? undefined}
          audienceReference={p.sendCampaign.audience_reference ?? undefined}
          open={!!p.sendCampaign}
          onOpenChange={(open) => !open && p.setSendCampaign(null)}
          onSuccess={() => { p.setSendCampaign(null); p.onRefetch(); }}
        />
      )}

      {p.detailsCampaignId && (
        <CampaignDetailsDialog campaignId={p.detailsCampaignId} open={!!p.detailsCampaignId} onOpenChange={(open) => !open && p.setDetailsCampaignId(null)} />
      )}

      {p.abTestCampaign && (
        <ABTestEmailDialog
          campaignId={p.abTestCampaign.id}
          subjectA={p.abTestCampaign.subject}
          open={!!p.abTestCampaign}
          onOpenChange={(open) => !open && p.setAbTestCampaign(null)}
        />
      )}
    </>
  );
}
