import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, ChevronRight, ChevronLeft, AlertTriangle, Mail } from "lucide-react";
import {
  useCreateEmailCampaign,
  useUpdateEmailCampaign,
  EmailCampaignType,
} from "@/hooks/useEmailCampaigns";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { useEmailCampaign, useEmailTemplate } from "@/hooks/useEmailSingle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { EmailEditor } from "./editor/EmailEditor";
import { EmailContent } from "./editor/types";
import { VariablesPicker } from "./VariablesPicker";
import { AudienceSelector, AudienceType } from "./AudienceSelector";
import { AudienceReference } from "@/hooks/useAudienceEstimate";

const campaignSchema = z.object({
  internal_name: z.string().min(1, "Nome interno é obrigatório"),
  subject: z.string().min(1, "Assunto é obrigatório"),
  preheader: z.string().optional(),
  sender_name: z.string().min(1, "Nome do remetente é obrigatório"),
  sender_email: z.string().email("E-mail inválido"),
  reply_to: z.string().email("E-mail inválido").optional().or(z.literal("")),
  campaign_type: z.enum([
    "newsletter",
    "promotion",
    "relationship",
    "automation",
    "update",
  ]),
  template_id: z.string().optional(),
  scheduled_at: z.string().optional(),
  email_integration_id: z.string().optional(),
});

type CampaignFormData = z.infer<typeof campaignSchema>;

interface EmailCampaignFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  defaultValues?: Partial<CampaignFormData>;
}

const toPlainText = (value: string) => value.replace(/\s+/g, " ").trim();

const buildEditableContentFromHtml = (html: string): EmailContent | null => {
  if (!html) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const blocks: EmailContent["blocks"] = [];

    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (!src) return;

      blocks.push({
        type: "image",
        url: src,
        alt: img.getAttribute("alt") || "Imagem",
        width: img.getAttribute("width") || "100%",
        alignment: "center",
        padding: "20px",
      });
    });

    doc.querySelectorAll("h1, h2, h3").forEach((heading) => {
      const text = toPlainText(heading.textContent || "");
      if (!text) return;

      blocks.push({
        type: "heading",
        text,
        level: heading.tagName.toLowerCase() as "h1" | "h2" | "h3",
        alignment: "left",
        padding: "20px",
      });
    });

    doc.querySelectorAll("p").forEach((paragraph) => {
      const text = toPlainText(paragraph.textContent || "");
      if (!text) return;

      blocks.push({
        type: "text",
        content: text,
        alignment: "left",
        padding: "20px",
      });
    });

    const unsubscribeLink = doc.querySelector('a[href*="unsubscribe"], a[href*="{{unsubscribe_url}}"]');
    if (unsubscribeLink) {
      blocks.push({
        type: "unsubscribe",
        text: "Não quer mais receber nossos e-mails?",
        linkText: toPlainText(unsubscribeLink.textContent || "") || "Cancelar inscrição",
        alignment: "center",
        padding: "20px",
      });
    }

    if (blocks.length === 0) {
      const fallbackText = toPlainText(doc.body?.textContent || "");
      if (!fallbackText) return null;

      blocks.push({
        type: "text",
        content: fallbackText.slice(0, 1200),
        alignment: "left",
        padding: "20px",
      });
    }

    return {
      blocks,
      globalStyles: {},
    };
  } catch {
    return null;
  }
};

export function EmailCampaignFormDialog({
  open,
  onOpenChange,
  campaignId,
  defaultValues: initialDefaultValues,
}: EmailCampaignFormDialogProps) {
  const createMutation = useCreateEmailCampaign();
  const updateMutation = useUpdateEmailCampaign();
  const { data: templates } = useEmailTemplates();
  const { data: existingCampaign } = useEmailCampaign(campaignId);
  const { tenantId } = useAuth();

  // Fetch active email integrations
  const { data: emailIntegrations } = useQuery({
    queryKey: ['email-integrations-active', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from('email_integrations')
        .select('id, name, sender_email, sender_name, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const [emailContent, setEmailContent] = useState<EmailContent | null>(null);
  const [emailHTML, setEmailHTML] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'content'>('details');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [watchedIntegrationId, setWatchedIntegrationId] = useState<string | undefined>();
  const [editorKey, setEditorKey] = useState(0);
  // Direct state for audience (avoids form sync issues)
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [audienceReference, setAudienceReference] = useState<AudienceReference>({});

  const { data: selectedTemplate, isLoading: loadingTemplate } = useEmailTemplate(selectedTemplateId);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      internal_name: "",
      subject: "",
      preheader: "",
      sender_name: "",
      sender_email: "",
      reply_to: "",
      campaign_type: "newsletter",
      email_integration_id: "",
      ...initialDefaultValues,
    },
  });

  // Fetch senders count for selected integration
  const { data: integrationSenders } = useQuery({
    queryKey: ['email-integration-senders', watchedIntegrationId],
    queryFn: async () => {
      if (!watchedIntegrationId) return [];
      const { data, error } = await supabase
        .from('email_integration_senders')
        .select('id, sender_email, sender_name, is_active')
        .eq('integration_id', watchedIntegrationId)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!watchedIntegrationId,
  });

  const totalSenders = (integrationSenders?.length || 0) + 1; // +1 for the main sender

  // Reset all state when opening for a NEW campaign
  useEffect(() => {
    if (open && !campaignId) {
      form.reset({
        internal_name: "",
        subject: "",
        preheader: "",
        sender_name: "",
        sender_email: "",
        reply_to: "",
        campaign_type: "newsletter",
        email_integration_id: "",
        ...initialDefaultValues,
      });
      setEmailContent(null);
      setEmailHTML('');
      setActiveTab('details');
      setSelectedTemplateId(undefined);
      setAudienceType("all");
      setAudienceReference({});
      setIsDirty(false);
      setEditorKey(prev => prev + 1);
    }
  }, [open, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track form dirtiness
  useEffect(() => {
    const subscription = form.watch((values) => {
      setIsDirty(true);
      setWatchedIntegrationId(values.email_integration_id || undefined);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (initialDefaultValues) {
      form.reset(initialDefaultValues);
      setIsDirty(false);
    }
  }, [initialDefaultValues, form]);

  // Load existing campaign content
  useEffect(() => {
    if (existingCampaign) {
      const integId = (existingCampaign as any).email_integration_id || '';
      form.reset({
        internal_name: existingCampaign.internal_name || '',
        subject: existingCampaign.subject || '',
        preheader: existingCampaign.preheader || '',
        sender_name: existingCampaign.sender_name || '',
        sender_email: existingCampaign.sender_email || '',
        reply_to: existingCampaign.reply_to || '',
        campaign_type: (existingCampaign.campaign_type as EmailCampaignType) || 'newsletter',
        template_id: existingCampaign.template_id || '',
        scheduled_at: existingCampaign.scheduled_at || '',
        email_integration_id: integId,
      });
      setWatchedIntegrationId(integId || undefined);
      // Restore audience state
      setAudienceType((existingCampaign.audience_type || 'all') as AudienceType);
      try {
        setAudienceReference(
          existingCampaign.audience_reference
            ? JSON.parse(existingCampaign.audience_reference)
            : {}
        );
      } catch {
        setAudienceReference({});
      }
      if (existingCampaign.content_json) {
        setEmailContent(existingCampaign.content_json as unknown as EmailContent);
      }
      if (existingCampaign.content_html) {
        setEmailHTML(existingCampaign.content_html);
      }
      setEditorKey(prev => prev + 1);
      setIsDirty(false);
    }
  }, [existingCampaign, form]);

  // Load template content when template is selected
  useEffect(() => {
    let cancelled = false;

    const applyTemplateContent = async () => {
      if (!selectedTemplate) return;

      let resolvedContent = (selectedTemplate.content_json as unknown as EmailContent | null) ?? null;
      let resolvedHtml = selectedTemplate.content_html || '';

      if (!resolvedContent && selectedTemplate.id && tenantId) {
        const { data: latestCampaignWithTemplate } = await supabase
          .from('email_campaigns')
          .select('content_json, content_html')
          .eq('template_id', selectedTemplate.id)
          .eq('tenant_id', tenantId)
          .not('content_json', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestCampaignWithTemplate?.content_json) {
          resolvedContent = latestCampaignWithTemplate.content_json as unknown as EmailContent;
          if (!resolvedHtml) {
            resolvedHtml = latestCampaignWithTemplate.content_html || '';
          }
        }
      }

      if (!resolvedContent && resolvedHtml) {
        resolvedContent = buildEditableContentFromHtml(resolvedHtml);
      }

      if (cancelled) return;

      setEmailContent(resolvedContent);
      setEmailHTML(resolvedHtml);
      setEditorKey((prev) => prev + 1);
      setIsDirty(true);
    };

    applyTemplateContent();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate, tenantId]);

  const handleClose = useCallback((open: boolean) => {
    if (!open && isDirty) {
      setShowCloseWarning(true);
      return;
    }
    onOpenChange(open);
    if (!open) {
      setIsDirty(false);
      setActiveTab('details');
    }
  }, [isDirty, onOpenChange]);

  const handleForceClose = () => {
    setShowCloseWarning(false);
    setIsDirty(false);
    setActiveTab('details');
    setSelectedTemplateId(undefined);
    setAudienceType("all");
    setAudienceReference({});
    form.reset();
    setEmailContent(null);
    setEmailHTML('');
    setEditorKey(prev => prev + 1);
    onOpenChange(false);
  };

  const onSubmit = async (data: CampaignFormData) => {
    try {
      const payload = {
        internal_name: data.internal_name,
        subject: data.subject,
        preheader: data.preheader,
        sender_name: data.sender_name,
        sender_email: data.sender_email,
        reply_to: data.reply_to || undefined,
        campaign_type: data.campaign_type,
        template_id: data.template_id || undefined,
        audience_type: audienceType,
        audience_reference: JSON.stringify(audienceReference),
        scheduled_at: data.scheduled_at || undefined,
        content_json: emailContent,
        content_html: emailHTML,
        email_integration_id: data.email_integration_id || undefined,
      };

      if (campaignId) {
        await updateMutation.mutateAsync({ id: campaignId, updates: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setIsDirty(false);
      onOpenChange(false);
      setActiveTab('details');
      form.reset();
    } catch {
      // Error handled in mutation
    }
  };

  const handleEditorChange = (content: EmailContent, html: string) => {
    setEmailContent(content);
    setEmailHTML(html);
    setIsDirty(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {campaignId ? "Editar Campanha" : "Nova Campanha"}
                  {isDirty && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      Não salvo
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  Preencha os dados e crie o conteúdo da campanha
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "details" | "content")} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="details">1. Detalhes</TabsTrigger>
              <TabsTrigger value="content">2. Conteúdo do E-mail</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="flex-1 overflow-y-auto mt-4 pr-1">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pb-4">
                  <FormField
                    control={form.control}
                    name="internal_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Interno *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Campanha Black Friday 2024" {...field} />
                        </FormControl>
                        <FormDescription>
                          Apenas para identificação interna — não será visto pelos destinatários.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="campaign_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo de Campanha *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
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
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="template_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Template (opcional)</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              const v = value === "__none__" ? "" : value;
                              field.onChange(v);
                              setSelectedTemplateId(v || undefined);
                            }}
                            value={field.value || "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione um template" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">Nenhum</SelectItem>
                              {templates?.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assunto *</FormLabel>
                        <FormControl>
                          <Input placeholder="Assunto do e-mail" {...field} />
                        </FormControl>
                        <VariablesPicker
                          onSelect={(variable) => {
                            form.setValue('subject', (field.value || '') + variable);
                            setIsDirty(true);
                          }}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="preheader"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pré-header</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Texto que aparece depois do assunto"
                            {...field}
                          />
                        </FormControl>
                        <VariablesPicker
                          onSelect={(variable) => {
                            form.setValue('preheader', (field.value || '') + variable);
                            setIsDirty(true);
                          }}
                        />
                        <FormDescription>
                          Prévia exibida ao lado do assunto em alguns clientes de e-mail.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Integration SMTP Selector */}
                  <FormField
                    control={form.control}
                    name="email_integration_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Integração SMTP
                        </FormLabel>
                        <Select
                          onValueChange={(value) => {
                            const v = value === "__none__" ? "" : value;
                            field.onChange(v);
                            setWatchedIntegrationId(v || undefined);
                            // Auto-fill sender fields from integration
                            if (v) {
                              const integ = emailIntegrations?.find(i => i.id === v);
                              if (integ) {
                                form.setValue('sender_name', (integ as any).sender_name || integ.name || '');
                                form.setValue('sender_email', integ.sender_email || '');
                              }
                            }
                          }}
                          value={field.value || "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma integração" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhuma (manual)</SelectItem>
                            {emailIntegrations?.map((integ) => (
                              <SelectItem key={integ.id} value={integ.id}>
                                {integ.name} — {integ.sender_email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {watchedIntegrationId && totalSenders > 1 && (
                          <FormDescription className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-xs">
                              {totalSenders} remetentes em rotação
                            </Badge>
                            Os e-mails serão distribuídos entre os remetentes automaticamente.
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sender_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome do Remetente *</FormLabel>
                          <FormControl>
                            <Input placeholder="Sua Empresa" {...field} />
                          </FormControl>
                          <FormDescription>
                            {watchedIntegrationId ? "Preenchido pela integração. Pode ser editado." : "Nome que aparece no 'De:'."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="sender_email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail do Remetente *</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="contato@empresa.com"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="reply_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responder Para</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="suporte@empresa.com"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          E-mail que receberá as respostas (opcional).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Audience Selector */}
                  <div className="space-y-2">
                    <FormLabel>Audiência</FormLabel>
                    <AudienceSelector
                      value={{
                        type: audienceType,
                        reference: audienceReference,
                      }}
                      onChange={({ type, reference }) => {
                        setAudienceType(type);
                        setAudienceReference(reference);
                        setIsDirty(true);
                      }}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="scheduled_at"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Agendar Para</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormDescription>
                          Deixe vazio para salvar como rascunho.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-between gap-3 pt-2 border-t">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleClose(false)}
                      disabled={isPending}
                    >
                      Cancelar
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={isPending}
                      >
                        {isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        {campaignId ? "Salvar" : "Criar rascunho"}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setActiveTab('content')}
                        disabled={isPending || (!!selectedTemplateId && loadingTemplate)}
                      >
                        {selectedTemplateId && loadingTemplate ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Carregando template…
                          </>
                        ) : (
                          <>
                            Ir para Conteúdo
                            <ChevronRight className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="content" className="flex-1 overflow-hidden mt-4 flex flex-col">
              <EmailEditor
                key={editorKey}
                initialContent={emailContent || undefined}
                onChange={handleEditorChange}
              />
              <div className="flex justify-between gap-3 mt-3 shrink-0 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab('details')}
                  disabled={isPending}
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
                <Button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {campaignId ? "Salvar Alterações" : "Criar Campanha"}
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes warning */}
      <AlertDialog open={showCloseWarning} onOpenChange={setShowCloseWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alterações não salvas
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações não salvas nesta campanha. Se sair agora, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCloseWarning(false)}>
              Continuar editando
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForceClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar e sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
