import { UseFormReturn } from "react-hook-form";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, ChevronRight, Mail } from "lucide-react";
import { VariablesPicker } from "./VariablesPicker";
import { CampaignAttributionFields } from "./CampaignAttributionFields";
import { CampaignSafetyFields } from "./CampaignSafetyFields";
import { UniqueCouponFields } from "./UniqueCouponFields";
import { AudienceSelector, AudienceType } from "./AudienceSelector";
import { AudienceReference } from "@/hooks/useAudienceEstimate";
import { CampaignFormData } from "@/hooks/useEmailCampaignForm";

interface EmailIntegration {
  id: string;
  name: string;
  sender_email: string;
  sender_name?: string | null;
  is_active: boolean;
}

interface Template {
  id: string;
  name: string;
}

interface EmailCampaignDetailsTabProps {
  form: UseFormReturn<CampaignFormData>;
  templates: Template[] | undefined;
  emailIntegrations: EmailIntegration[] | undefined;
  totalSenders: number;
  watchedIntegrationId: string | undefined;
  setWatchedIntegrationId: (id: string | undefined) => void;
  audienceType: AudienceType;
  audienceReference: AudienceReference;
  setAudienceType: (t: AudienceType) => void;
  setAudienceReference: (r: AudienceReference) => void;
  setIsDirty: (v: boolean) => void;
  selectedTemplateId: string | undefined;
  setSelectedTemplateId: (id: string | undefined) => void;
  loadingTemplate: boolean;
  isPending: boolean;
  campaignId?: string;
  handleClose: (open: boolean) => void;
  setActiveTab: (t: "details" | "content") => void;
  onSubmit: (data: CampaignFormData) => Promise<void>;
}

export function EmailCampaignDetailsTab({
  form, templates, emailIntegrations, totalSenders, watchedIntegrationId, setWatchedIntegrationId,
  audienceType, audienceReference, setAudienceType, setAudienceReference, setIsDirty,
  selectedTemplateId, setSelectedTemplateId, loadingTemplate, isPending, campaignId,
  handleClose, setActiveTab, onSubmit,
}: EmailCampaignDetailsTabProps) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pb-4">
        <FormField control={form.control} name="internal_name" render={({ field }) => (
          <FormItem>
            <FormLabel>Nome Interno *</FormLabel>
            <FormControl><Input placeholder="Ex: Campanha Black Friday 2024" {...field} /></FormControl>
            <FormDescription>Apenas para identificação interna — não será visto pelos destinatários.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="campaign_type" render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Campanha *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="newsletter">Newsletter</SelectItem>
                  <SelectItem value="promotion">Promoção</SelectItem>
                  <SelectItem value="relationship">Relacionamento</SelectItem>
                  <SelectItem value="automation">Automação</SelectItem>
                  <SelectItem value="update">Atualização</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="template_id" render={({ field }) => (
            <FormItem>
              <FormLabel>Template (opcional)</FormLabel>
              <Select
                onValueChange={(value) => { const v = value === "__none__" ? "" : value; field.onChange(v); setSelectedTemplateId(v || undefined); }}
                value={field.value || "__none__"}
              >
                <FormControl><SelectTrigger><SelectValue placeholder="Selecione um template" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="subject" render={({ field }) => (
          <FormItem>
            <FormLabel>Assunto *</FormLabel>
            <FormControl><Input placeholder="Assunto do e-mail" {...field} /></FormControl>
            <VariablesPicker onSelect={(v) => { form.setValue("subject", (field.value || "") + v); setIsDirty(true); }} />
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="preheader" render={({ field }) => (
          <FormItem>
            <FormLabel>Pré-header</FormLabel>
            <FormControl><Input placeholder="Texto que aparece depois do assunto" {...field} /></FormControl>
            <VariablesPicker onSelect={(v) => { form.setValue("preheader", (field.value || "") + v); setIsDirty(true); }} />
            <FormDescription>Prévia exibida ao lado do assunto em alguns clientes de e-mail.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <FormField control={form.control} name="email_integration_id" render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2"><Mail className="h-4 w-4" />Integração SMTP *</FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value);
                setWatchedIntegrationId(value);
                const integ = emailIntegrations?.find((i) => i.id === value);
                if (integ) {
                  form.setValue("sender_name", (integ as any).sender_name || integ.name || "");
                  form.setValue("sender_email", integ.sender_email || "");
                }
              }}
              value={field.value || ""}
            >
              <FormControl><SelectTrigger><SelectValue placeholder="Selecione uma integração" /></SelectTrigger></FormControl>
              <SelectContent>
                {emailIntegrations?.map((i) => <SelectItem key={i.id} value={i.id}>{i.name} — {i.sender_email}</SelectItem>)}
              </SelectContent>
            </Select>
            {(!emailIntegrations || emailIntegrations.length === 0) && (
              <FormDescription className="text-destructive">
                Nenhuma integração SMTP conectada. Configure uma em Integrações antes de criar campanhas.
              </FormDescription>
            )}
            {watchedIntegrationId && totalSenders > 1 && (
              <FormDescription className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-xs">{totalSenders} remetentes em rotação</Badge>
                Os e-mails serão distribuídos entre os remetentes automaticamente.
              </FormDescription>
            )}
            <FormMessage />
          </FormItem>
        )} />

        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="sender_name" render={({ field }) => (
            <FormItem>
              <FormLabel>Nome do Remetente *</FormLabel>
              <FormControl><Input placeholder="Sua Empresa" {...field} /></FormControl>
              <FormDescription>{watchedIntegrationId ? "Preenchido pela integração. Pode ser editado." : "Nome que aparece no 'De:'."}</FormDescription>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="sender_email" render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail do Remetente *</FormLabel>
              <FormControl><Input type="email" placeholder="contato@empresa.com" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <FormField control={form.control} name="reply_to" render={({ field }) => (
          <FormItem>
            <FormLabel>Responder Para</FormLabel>
            <FormControl><Input type="email" placeholder="suporte@empresa.com" {...field} /></FormControl>
            <FormDescription>E-mail que receberá as respostas (opcional).</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <div className="space-y-2">
          <FormLabel>Audiência</FormLabel>
          <AudienceSelector
            value={{ type: audienceType, reference: audienceReference }}
            onChange={({ type, reference }) => { setAudienceType(type); setAudienceReference(reference); setIsDirty(true); }}
          />
        </div>

        <CampaignAttributionFields form={form} />

        <UniqueCouponFields form={form} />

        <CampaignSafetyFields form={form} />

        <FormField control={form.control} name="scheduled_at" render={({ field }) => (
          <FormItem>
            <FormLabel>Agendar Para</FormLabel>
            <FormControl><Input type="datetime-local" {...field} /></FormControl>
            <FormDescription>Deixe vazio para salvar como rascunho.</FormDescription>
            <FormMessage />
          </FormItem>
        )} />

        <div className="flex justify-between gap-3 pt-2 border-t">
          <Button type="button" variant="ghost" onClick={() => handleClose(false)} disabled={isPending}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {campaignId ? "Salvar" : "Criar rascunho"}
            </Button>
            <Button type="button" onClick={() => setActiveTab("content")} disabled={isPending || (!!selectedTemplateId && loadingTemplate)}>
              {selectedTemplateId && loadingTemplate ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Carregando template…</>
              ) : (
                <>Ir para Conteúdo<ChevronRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
