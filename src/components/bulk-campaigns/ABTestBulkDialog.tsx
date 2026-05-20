import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlaskConical, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Campaign } from "./types";

interface Props {
  campaign: Campaign;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

export function ABTestBulkDialog({ campaign, open, onOpenChange, onCreated }: Props) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [messageB, setMessageB] = useState("");
  const [splitPct, setSplitPct] = useState(50);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!messageB.trim() || !tenantId) return;
    setSaving(true);
    try {
      const abTestId = crypto.randomUUID();

      // Atualiza campanha A com ab_test_id
      const { error: updateA } = await supabase
        .from("bulk_campaigns")
        .update({ ab_test_id: abTestId, ab_variant: "A" })
        .eq("id", campaign.id);
      if (updateA) throw updateA;

      // Busca contatos da campanha A
      const { data: allContacts, error: contactsErr } = await supabase
        .from("campaign_contacts")
        .select("name, phone, variables")
        .eq("campaign_id", campaign.id)
        .eq("tenant_id", tenantId);
      if (contactsErr) throw contactsErr;

      const contacts = allContacts || [];
      contacts.sort((a, b) => (a.phone ?? "").localeCompare(b.phone ?? ""));

      const cutoff = Math.ceil(contacts.length * splitPct / 100);
      const contactsA = contacts.slice(0, cutoff);
      const contactsB = contacts.slice(cutoff);

      // Restringe contatos de A ao slice correto (deleta os de B que estão em A)
      if (contactsB.length > 0) {
        const phonesB = contactsB.map(c => c.phone);
        await supabase
          .from("campaign_contacts")
          .delete()
          .eq("campaign_id", campaign.id)
          .in("phone", phonesB);
      }

      // Cria campanha B
      const campaignBPayload = {
        tenant_id:               tenantId,
        name:                    `${campaign.name} — Variante B`,
        message_template:        messageB.trim(),
        whatsapp_integration_id: campaign.whatsapp_integration_id,
        delay_seconds:           campaign.delay_seconds,
        delay_max_seconds:       null as number | null,
        total_contacts:          contactsB.length,
        tokens_per_message:      2,
        status:                  "draft",
        media_url:               campaign.media_url,
        media_type:              campaign.media_type,
        ab_test_id:              abTestId,
        ab_variant:              "B",
      };

      const { data: campaignB, error: bErr } = await supabase
        .from("bulk_campaigns")
        .insert(campaignBPayload as Record<string, unknown>)
        .select("id")
        .single();
      if (bErr) throw bErr;

      // Insere contatos de B na nova campanha
      if (contactsB.length > 0) {
        const rows = contactsB.map(c => ({ campaign_id: campaignB.id, tenant_id: tenantId, name: c.name, phone: c.phone, variables: c.variables, status: "pending" }));
        for (let i = 0; i < rows.length; i += 500) {
          const { error: cErr } = await supabase.from("campaign_contacts").insert(rows.slice(i, i + 500));
          if (cErr) throw cErr;
        }
      }

      // Atualiza total de A
      await supabase.from("bulk_campaigns").update({ total_contacts: contactsA.length }).eq("id", campaign.id);

      toast({ title: "Teste A/B criado!", description: `A: ${contactsA.length} contatos · B: ${contactsB.length} contatos` });
      onOpenChange(false);
      setMessageB("");
      setSplitPct(50);
      onCreated();
    } catch (e: unknown) {
      toast({ title: "Erro ao criar A/B", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Criar Teste A/B — WhatsApp
          </DialogTitle>
          <DialogDescription>
            Teste duas mensagens diferentes dividindo sua lista de contatos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Variante A — mensagem atual</Label>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground line-clamp-3">
              {campaign.message_template}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="msg-b">Variante B — nova mensagem</Label>
            <Textarea
              id="msg-b"
              placeholder="Olá {primeiro_nome}, temos uma oferta exclusiva para você! 🔥"
              rows={3}
              value={messageB}
              onChange={e => setMessageB(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Divisão dos contatos
              </Label>
              <span className="text-sm font-medium text-primary">
                A: {Math.ceil(campaign.total_contacts * splitPct / 100)} · B: {campaign.total_contacts - Math.ceil(campaign.total_contacts * splitPct / 100)}
              </span>
            </div>
            <Slider min={20} max={80} step={5} value={[splitPct]} onValueChange={([v]) => setSplitPct(v)} />
            <p className="text-xs text-muted-foreground">{splitPct}% A · {100 - splitPct}% B — divisão determinística por número de telefone.</p>
          </div>

          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
              Os contatos da campanha original serão redistribuídos. A operação é irreversível.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!messageB.trim() || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Criar Teste A/B
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
