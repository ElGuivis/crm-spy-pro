import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { EmailContent } from "@/components/email-marketing/editor/types";
import { AudienceType } from "@/components/email-marketing/AudienceSelector";
import { AudienceReference } from "@/hooks/useAudienceEstimate";

export const campaignSchema = z.object({
  internal_name: z.string().min(1, "Nome interno é obrigatório"),
  subject: z.string().min(1, "Assunto é obrigatório"),
  preheader: z.string().optional(),
  sender_name: z.string().min(1, "Nome do remetente é obrigatório"),
  sender_email: z.string().email("E-mail inválido"),
  reply_to: z.string().email("E-mail inválido").optional().or(z.literal("")),
  campaign_type: z.enum(["newsletter", "promotion", "relationship", "automation", "update"]),
  template_id: z.string().optional(),
  scheduled_at: z.string().optional(),
  email_integration_id: z.string().uuid("Selecione uma integração SMTP"),
});

export type CampaignFormData = z.infer<typeof campaignSchema>;

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
      blocks.push({ type: "image", url: src, alt: img.getAttribute("alt") || "Imagem", width: img.getAttribute("width") || "100%", alignment: "center", padding: "20px" });
    });

    doc.querySelectorAll("h1, h2, h3").forEach((heading) => {
      const text = toPlainText(heading.textContent || "");
      if (!text) return;
      blocks.push({ type: "heading", text, level: heading.tagName.toLowerCase() as "h1" | "h2" | "h3", alignment: "left", padding: "20px" });
    });

    doc.querySelectorAll("p").forEach((paragraph) => {
      const text = toPlainText(paragraph.textContent || "");
      if (!text) return;
      blocks.push({ type: "text", content: text, alignment: "left", padding: "20px" });
    });

    const unsubscribeLink = doc.querySelector('a[href*="unsubscribe"], a[href*="{{unsubscribe_url}}"]');
    if (unsubscribeLink) {
      blocks.push({ type: "unsubscribe", text: "Não quer mais receber nossos e-mails?", linkText: toPlainText(unsubscribeLink.textContent || "") || "Cancelar inscrição", alignment: "center", padding: "20px" });
    }

    if (blocks.length === 0) {
      const fallbackText = toPlainText(doc.body?.textContent || "");
      if (!fallbackText) return null;
      blocks.push({ type: "text", content: fallbackText.slice(0, 1200), alignment: "left", padding: "20px" });
    }

    return { blocks, globalStyles: {} };
  } catch {
    return null;
  }
};

interface UseEmailCampaignFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  defaultValues?: Partial<CampaignFormData>;
}

export function useEmailCampaignForm({ open, onOpenChange, campaignId, defaultValues: initialDefaultValues }: UseEmailCampaignFormProps) {
  const createMutation = useCreateEmailCampaign();
  const updateMutation = useUpdateEmailCampaign();
  const { data: templates } = useEmailTemplates();
  const { data: existingCampaign } = useEmailCampaign(campaignId);
  const { tenantId } = useAuth();

  const { data: emailIntegrations } = useQuery({
    queryKey: ["email-integrations-active", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("email_integrations")
        .select("id, name, sender_email, sender_name, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const [emailContent, setEmailContent] = useState<EmailContent | null>(null);
  const [emailHTML, setEmailHTML] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"details" | "content">("details");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>();
  const [isDirty, setIsDirty] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [watchedIntegrationId, setWatchedIntegrationId] = useState<string | undefined>();
  const [editorKey, setEditorKey] = useState(0);
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [audienceReference, setAudienceReference] = useState<AudienceReference>({});

  const { data: selectedTemplate, isLoading: loadingTemplate } = useEmailTemplate(selectedTemplateId);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      internal_name: "", subject: "", preheader: "", sender_name: "",
      sender_email: "", reply_to: "", campaign_type: "newsletter",
      email_integration_id: "", ...initialDefaultValues,
    },
  });

  const { data: integrationSenders } = useQuery({
    queryKey: ["email-integration-senders", watchedIntegrationId],
    queryFn: async () => {
      if (!watchedIntegrationId) return [];
      const { data, error } = await supabase
        .from("email_integration_senders")
        .select("id, sender_email, sender_name, is_active")
        .eq("integration_id", watchedIntegrationId)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!watchedIntegrationId,
  });

  const totalSenders = (integrationSenders?.length || 0) + 1;

  const skipDirtyRef = useRef(false);
  const resetSilently = useCallback((values: Parameters<typeof form.reset>[0]) => {
    skipDirtyRef.current = true;
    form.reset(values);
    setTimeout(() => { skipDirtyRef.current = false; }, 0);
  }, [form]);

  useEffect(() => {
    if (open && !campaignId) {
      resetSilently({ internal_name: "", subject: "", preheader: "", sender_name: "", sender_email: "", reply_to: "", campaign_type: "newsletter", email_integration_id: "", ...initialDefaultValues });
      setEmailContent(null);
      setEmailHTML("");
      setActiveTab("details");
      setSelectedTemplateId(undefined);
      setAudienceType("all");
      setAudienceReference({});
      setIsDirty(false);
      setEditorKey((prev) => prev + 1);
    }
  }, [open, campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const subscription = form.watch((values) => {
      setWatchedIntegrationId(values.email_integration_id || undefined);
      if (skipDirtyRef.current) return;
      setIsDirty(true);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (existingCampaign) {
      const integId = (existingCampaign as any).email_integration_id || "";
      resetSilently({
        internal_name: existingCampaign.internal_name || "",
        subject: existingCampaign.subject || "",
        preheader: existingCampaign.preheader || "",
        sender_name: existingCampaign.sender_name || "",
        sender_email: existingCampaign.sender_email || "",
        reply_to: existingCampaign.reply_to || "",
        campaign_type: (existingCampaign.campaign_type as EmailCampaignType) || "newsletter",
        template_id: existingCampaign.template_id || "",
        scheduled_at: existingCampaign.scheduled_at || "",
        email_integration_id: integId,
      });
      setWatchedIntegrationId(integId || undefined);
      setAudienceType((existingCampaign.audience_type || "all") as AudienceType);
      try {
        const ref = existingCampaign.audience_reference;
        if (!ref) {
          setAudienceReference({});
        } else if (typeof ref === "string") {
          setAudienceReference(JSON.parse(ref));
        } else if (typeof ref === "object") {
          setAudienceReference(ref as AudienceReference);
        } else {
          setAudienceReference({});
        }
      } catch {
        setAudienceReference({});
      }
      if (existingCampaign.content_json) setEmailContent(existingCampaign.content_json as unknown as EmailContent);
      if (existingCampaign.content_html) setEmailHTML(existingCampaign.content_html);
      setEditorKey((prev) => prev + 1);
      setIsDirty(false);
    }
  }, [existingCampaign, resetSilently]);

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      if (!selectedTemplate) return;
      let resolvedContent = (selectedTemplate.content_json as unknown as EmailContent | null) ?? null;
      let resolvedHtml = selectedTemplate.content_html || "";

      if (!resolvedContent && selectedTemplate.id && tenantId) {
        const { data } = await supabase
          .from("email_campaigns")
          .select("content_json, content_html")
          .eq("template_id", selectedTemplate.id)
          .eq("tenant_id", tenantId)
          .not("content_json", "is", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.content_json) {
          resolvedContent = data.content_json as unknown as EmailContent;
          if (!resolvedHtml) resolvedHtml = data.content_html || "";
        }
      }

      if (!resolvedContent && resolvedHtml) resolvedContent = buildEditableContentFromHtml(resolvedHtml);
      if (cancelled) return;
      setEmailContent(resolvedContent);
      setEmailHTML(resolvedHtml);
      setEditorKey((prev) => prev + 1);
      setIsDirty(true);
    };
    apply();
    return () => { cancelled = true; };
  }, [selectedTemplate, tenantId]);

  const handleClose = useCallback((open: boolean) => {
    if (!open && isDirty) { setShowCloseWarning(true); return; }
    onOpenChange(open);
    if (!open) { setIsDirty(false); setActiveTab("details"); }
  }, [isDirty, onOpenChange]);

  const handleForceClose = () => {
    setShowCloseWarning(false);
    setIsDirty(false);
    setActiveTab("details");
    setSelectedTemplateId(undefined);
    setAudienceType("all");
    setAudienceReference({});
    form.reset();
    setEmailContent(null);
    setEmailHTML("");
    setEditorKey((prev) => prev + 1);
    onOpenChange(false);
  };

  const onSubmit = async (data: CampaignFormData) => {
    try {
      const payload = {
        internal_name: data.internal_name, subject: data.subject, preheader: data.preheader,
        sender_name: data.sender_name, sender_email: data.sender_email,
        reply_to: data.reply_to || undefined, campaign_type: data.campaign_type,
        template_id: data.template_id || undefined, audience_type: audienceType,
        audience_reference: JSON.stringify(audienceReference),
        scheduled_at: data.scheduled_at || undefined, content_json: emailContent,
        content_html: emailHTML, email_integration_id: data.email_integration_id,
      };
      if (campaignId) {
        await updateMutation.mutateAsync({ id: campaignId, updates: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      setIsDirty(false);
      onOpenChange(false);
      setActiveTab("details");
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

  return {
    form, templates, emailIntegrations, integrationSenders, totalSenders,
    emailContent, emailHTML, activeTab, setActiveTab,
    selectedTemplateId, setSelectedTemplateId, isDirty, setIsDirty,
    showCloseWarning, setShowCloseWarning, watchedIntegrationId, setWatchedIntegrationId,
    editorKey, audienceType, setAudienceType, audienceReference, setAudienceReference,
    loadingTemplate, isPending, handleClose, handleForceClose, onSubmit, handleEditorChange,
  };
}
