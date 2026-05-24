import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useCreateCampaignForm, buildPreview } from "@/hooks/useCreateCampaignForm";
import { CampaignBasicFields } from "./create/CampaignBasicFields";
import { CampaignScheduling } from "./create/CampaignScheduling";
import { CampaignSendingWindow } from "./create/CampaignSendingWindow";
import { CampaignContactSource } from "./create/CampaignContactSource";
import { CampaignMessageEditor } from "./create/CampaignMessageEditor";
import { CampaignMediaUpload } from "./create/CampaignMediaUpload";
import type { WhatsAppIntegration } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrations: WhatsAppIntegration[];
  onCreated: () => void;
}

export function CreateCampaignDialog({ open, onOpenChange, integrations, onCreated }: Props) {
  const f = useCreateCampaignForm({ onCreated, onOpenChange });

  const availableVariables = [
    { key: "primeiro_nome", label: "Primeiro Nome", always: true },
    { key: "nome", label: "Nome Completo", always: true },
    ...f.extraColumns.map(col => ({
      key: col.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_"),
      label: col,
      always: false,
    })),
  ];

  const previewMessage = f.contacts.length > 0 ? buildPreview(f.messageTemplate, f.contacts[0]) : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) f.resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Campanha de Disparo</DialogTitle>
          <DialogDescription>Configure e envie mensagens em massa via WhatsApp</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <CampaignBasicFields
            campaignName={f.campaignName}
            onNameChange={f.setCampaignName}
            integrations={integrations}
            selectedIntegration={f.selectedIntegration}
            onIntegrationChange={f.setSelectedIntegration}
            delayMin={f.delayMin}
            onDelayMinChange={f.setDelayMin}
            delayMax={f.delayMax}
            onDelayMaxChange={f.setDelayMax}
          />

          <CampaignScheduling
            scheduledDate={f.scheduledDate}
            scheduledTime={f.scheduledTime}
            timezone={f.timezone}
            onScheduledDateChange={f.setScheduledDate}
            onScheduledTimeChange={f.setScheduledTime}
            onTimezoneChange={f.setTimezone}
          />

          <CampaignSendingWindow
            enabled={f.sendingScheduleEnabled}
            schedule={f.sendingSchedule}
            onEnabledChange={f.setSendingScheduleEnabled}
            onScheduleChange={f.setSendingSchedule}
          />

          <CampaignContactSource
            source={f.contactSource}
            onSourceChange={f.setContactSource}
            fileName={f.fileName}
            onFileUpload={f.handleFileUpload}
            selectedRfmAudienceId={f.selectedRfmAudienceId}
            onRfmAudienceChange={(id) => { f.setSelectedRfmAudienceId(id); if (id) f.loadRfmAudienceContacts(id); }}
            loadingRfmContacts={f.loadingRfmContacts}
            contacts={f.contacts}
            onClearContacts={() => { f.setContacts([]); f.setFileName(""); }}
          />

          <CampaignMessageEditor
            ref={f.textareaRef}
            messageTemplate={f.messageTemplate}
            onMessageChange={f.setMessageTemplate}
            availableVariables={availableVariables}
            onInsertVariable={f.insertVariable}
            previewMessage={previewMessage}
            hasContacts={f.contacts.length > 0}
          />

          <CampaignMediaUpload
            mediaFile={f.mediaFile}
            mediaPreview={f.mediaPreview}
            onMediaUpload={f.handleMediaUpload}
            onRemoveMedia={f.removeMedia}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { f.resetForm(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={f.handleCreate} disabled={f.saving || f.contacts.length === 0} className="gap-2">
            {f.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Criar Campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
