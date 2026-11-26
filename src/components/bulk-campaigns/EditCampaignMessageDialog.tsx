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
import type { Campaign, WhatsAppIntegration } from "./types";
import { CampaignNumbersPicker } from "./create/CampaignNumbersPicker";
import { CampaignMessageVariants } from "./create/CampaignMessageVariants";
import { ReplyDelayFields } from "./create/ReplyDelayFields";
import { DEFAULT_REPLY_DELAY, replyDelayPayload, type ReplyDelay } from "./create/replyDelay";
import { CampaignSafetyFields } from "./create/CampaignSafetyFields";
import { safetyPayload } from "./create/safetyPayload";

interface Props {
  campaign: Campaign | null;
  integrations: WhatsAppIntegration[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditCampaignMessageDialog({ campaign, integrations, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const [replyDelay, setReplyDelay] = useState<ReplyDelay>(DEFAULT_REPLY_DELAY);
  const [dailyLimit, setDailyLimit] = useState("");
  const [dailyStep, setDailyStep] = useState("0");
  const [numbers, setNumbers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!campaign) return;
    setMessage(campaign.message_template);
    setVariants(campaign.message_variants ?? []);
    const ids = campaign.whatsapp_integration_ids?.length
      ? campaign.whatsapp_integration_ids
      : campaign.whatsapp_integration_id ? [campaign.whatsapp_integration_id] : [];
    setNumbers(ids);
    setReply(campaign.reply_message ?? "");
    setReplyDelay({
      min: String(campaign.reply_delay_min_seconds ?? DEFAULT_REPLY_DELAY.min),
      max: String(campaign.reply_delay_max_seconds ?? DEFAULT_REPLY_DELAY.max),
    });
    setDailyLimit(campaign.daily_limit ? String(campaign.daily_limit) : "");
    setDailyStep(String(campaign.daily_limit_step ?? 0));
  }, [campaign]);

  const handleSave = async () => {
    if (!campaign) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bulk_campaigns")
        .update({
          message_template: message,
          message_variants: variants.map((v) => v.trim()).filter(Boolean),
          whatsapp_integration_id: numbers[0],
          whatsapp_integration_ids: numbers,
          ...safetyPayload(reply, dailyLimit, dailyStep),
          ...replyDelayPayload(replyDelay),
        })
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
          <DialogTitle>Editar campanha</DialogTitle>
          <DialogDescription>Números, texto e proteção da campanha "{campaign?.name}"</DialogDescription>
        </DialogHeader>
        <CampaignNumbersPicker integrations={integrations} selected={numbers} onChange={setNumbers} />
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
        <CampaignMessageVariants variants={variants} onChange={setVariants} />
        <CampaignSafetyFields
          messageTemplate={message}
          replyMessage={reply}
          onReplyChange={setReply}
          dailyLimit={dailyLimit}
          onDailyLimitChange={setDailyLimit}
          dailyStep={dailyStep}
          onDailyStepChange={setDailyStep}
        />
        <ReplyDelayFields value={replyDelay} onChange={setReplyDelay} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !message.trim() || numbers.length === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
