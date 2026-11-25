import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Campaign } from "./types";
import { CampaignSafetyFields } from "./create/CampaignSafetyFields";
import { safetyPayload } from "./create/safetyPayload";

interface Props {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditCampaignMessageDialog({ campaign, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [dailyStep, setDailyStep] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    setMessage(campaign.message_template);
    setReply(campaign.reply_message ?? "");
    setDailyLimit(campaign.daily_limit ? String(campaign.daily_limit) : "");
    setDailyStep(String(campaign.daily_limit_step ?? 0));
  }, [campaign]);

  const handleSave = async () => {
    if (!campaign) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bulk_campaigns")
        .update({ message_template: message, ...safetyPayload(reply, dailyLimit, dailyStep) })
        .eq("id", campaign.id);
      if (error) throw error;
      toast({ title: "Campanha atualizada!" });
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!campaign} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar mensagem e proteção</DialogTitle>
          <DialogDescription>Altere o texto da campanha "{campaign?.name}"</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Mensagem</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            placeholder="Texto da mensagem..."
          />
          <p className="text-xs text-muted-foreground">
            Use {"{nome}"}, {"{primeiro_nome}"} ou variáveis personalizadas. Variações: {"{Oi|Olá|Fala}"}.
          </p>
        </div>
        <CampaignSafetyFields
          messageTemplate={message}
          replyMessage={reply}
          onReplyChange={setReply}
          dailyLimit={dailyLimit}
          onDailyLimitChange={setDailyLimit}
          dailyStep={dailyStep}
          onDailyStepChange={setDailyStep}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !message.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
