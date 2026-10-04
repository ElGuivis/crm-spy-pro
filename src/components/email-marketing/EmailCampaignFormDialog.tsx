import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, ChevronLeft, AlertTriangle } from "lucide-react";
import { EmailEditor } from "./editor/EmailEditor";
import { EmailCampaignDetailsTab } from "./EmailCampaignDetailsTab";
import { useEmailCampaignForm, CampaignFormData } from "@/hooks/useEmailCampaignForm";

interface EmailCampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  defaultValues?: Partial<CampaignFormData>;
}

export function EmailCampaignFormDialog({ open, onOpenChange, campaignId, defaultValues }: EmailCampaignFormDialogProps) {
  const {
    draftKey, form, templates, emailIntegrations, totalSenders,
    emailContent, activeTab, setActiveTab,
    selectedTemplateId, setSelectedTemplateId, isDirty,
    showCloseWarning, setShowCloseWarning, watchedIntegrationId, setWatchedIntegrationId,
    editorKey, audienceType, setAudienceType, audienceReference, setAudienceReference,
    setIsDirty, loadingTemplate, isPending,
    handleClose, handleForceClose, onSubmit, handleEditorChange,
  } = useEmailCampaignForm({ open, onOpenChange, campaignId, defaultValues });

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {campaignId ? "Editar Campanha" : "Nova Campanha"}
                  {isDirty && <Badge variant="secondary" className="text-xs font-normal">Não salvo</Badge>}
                </DialogTitle>
                <DialogDescription>Preencha os dados e crie o conteúdo da campanha</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "details" | "content")} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="details">1. Detalhes</TabsTrigger>
              <TabsTrigger value="content">2. Conteúdo do E-mail</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex-1 overflow-y-auto mt-4 pr-1">
              <EmailCampaignDetailsTab
                key={editorKey}
                form={form} templates={templates} emailIntegrations={emailIntegrations}
                totalSenders={totalSenders} watchedIntegrationId={watchedIntegrationId}
                setWatchedIntegrationId={setWatchedIntegrationId}
                audienceType={audienceType} audienceReference={audienceReference}
                setAudienceType={setAudienceType} setAudienceReference={setAudienceReference}
                setIsDirty={setIsDirty} selectedTemplateId={selectedTemplateId}
                setSelectedTemplateId={setSelectedTemplateId} loadingTemplate={loadingTemplate}
                isPending={isPending} campaignId={campaignId}
                handleClose={handleClose} setActiveTab={setActiveTab} onSubmit={onSubmit}
              />
            </TabsContent>

            <TabsContent value="content" className="flex-1 overflow-hidden mt-4 flex flex-col">
              <EmailEditor key={editorKey} draftKey={draftKey} onTemplateApplied={(sug) => { if (!form.getValues("subject")) form.setValue("subject", sug.subject, { shouldDirty: true }); if (!form.getValues("preheader")) form.setValue("preheader", sug.preheader, { shouldDirty: true }); }} initialContent={emailContent || undefined} onChange={handleEditorChange} />
              <div className="flex justify-between gap-3 mt-3 shrink-0 pt-3 border-t">
                <Button type="button" variant="outline" onClick={() => setActiveTab("details")} disabled={isPending}>
                  <ChevronLeft className="h-4 w-4 mr-2" />Voltar
                </Button>
                <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending}>
                  {isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />{campaignId ? "Salvar Alterações" : "Criar Campanha"}</>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseWarning} onOpenChange={setShowCloseWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />Alterações não salvas
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas nesta campanha. Se sair agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCloseWarning(false)}>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Descartar e sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
