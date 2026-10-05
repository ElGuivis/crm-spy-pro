import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEmailCampaign } from "@/hooks/useEmailSingle";
import type { Json } from "@/integrations/supabase/types";
import { EmailEditor } from "../editor/EmailEditor";
import type { EmailContent } from "../editor/types";
import { SendTestEmailDialog } from "../SendTestEmailDialog";
import { KNOWN_FLOW_VARIABLES } from "@/lib/recovery";

interface Props { campaignId: string | null; open: boolean; onOpenChange: (open: boolean) => void; usesCoupon: boolean }

/** Editor do e-mail de uma etapa: assunto, pré-header e o mesmo editor das campanhas (com o bloco "Itens do carrinho"). */
export function StepEmailDialog({ campaignId, open, onOpenChange, usesCoupon }: Props) {
  const qc = useQueryClient();
  const { data: campaign, isLoading } = useEmailCampaign(open ? campaignId ?? undefined : undefined);
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const latest = useRef<{ json: EmailContent; html: string } | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (campaign && loadedFor.current !== campaign.id) {
      loadedFor.current = campaign.id;
      setSubject(campaign.subject ?? "");
      setPreheader(campaign.preheader ?? "");
      latest.current = null;
    }
    if (!open) loadedFor.current = null;
  }, [campaign, open]);

  const save = async (): Promise<boolean> => {
    if (!campaignId) return false;
    if (!subject.trim()) { toast.error("Escreva o assunto do e-mail."); return false; }
    const html = latest.current?.html ?? campaign?.content_html ?? "";
    if (!html.includes("{{unsubscribe_url}}")) { toast.error("O e-mail precisa do bloco \"Descadastrar\" (link obrigatório por lei)."); return false; }
    if (usesCoupon && !html.includes("{{coupon_code}}") && !subject.includes("{{coupon")) toast.warning("Esta etapa cria um cupom, mas o e-mail não usa {{coupon_code}}. Coloque o código no bloco de cupom.");
    setSaving(true);
    const { error } = await supabase.from("email_campaigns").update({
      subject: subject.trim(), preheader: preheader.trim() || null, content_html: html,
      ...(latest.current ? { content_json: latest.current.json as unknown as Json } : {}),
    }).eq("id", campaignId);
    setSaving(false);
    if (error) { toast.error(`Não foi possível salvar: ${error.message}`); return false; }
    qc.invalidateQueries({ queryKey: ["email-campaign", campaignId] });
    toast.success("E-mail da etapa salvo");
    return true;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>E-mail da etapa</DialogTitle>
            <DialogDescription>
              Variáveis: {KNOWN_FLOW_VARIABLES.map(([k]) => `{{${k}}}`).join(" ")}. No envio, o bloco "Itens do carrinho" mostra os produtos da própria pessoa.
            </DialogDescription>
          </DialogHeader>
          {isLoading || !campaign ? (
            <div className="flex-1 flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Assunto</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="{{first_name|Ei}}, você esqueceu algo no carrinho" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Pré-header (resumo na caixa de entrada)</Label><Input value={preheader} onChange={(e) => setPreheader(e.target.value)} /></div>
              </div>
              <EmailEditor
                key={campaign.id}
                draftKey={`recovery-${campaign.id}-${campaign.updated_at}`}
                initialContent={(campaign.content_json as unknown as EmailContent) || undefined}
                onChange={(json, html) => { latest.current = { json, html }; }}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" disabled={saving || !campaign} onClick={async () => { if (await save()) setTestOpen(true); }} className="gap-2"><Send className="h-4 w-4" />Salvar e enviar teste</Button>
            <Button disabled={saving || !campaign} onClick={async () => { if (await save()) onOpenChange(false); }} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {campaignId && <SendTestEmailDialog campaignId={campaignId} open={testOpen} onOpenChange={setTestOpen} />}
    </>
  );
}
