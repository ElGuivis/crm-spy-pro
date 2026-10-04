import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { toast } from "sonner";
import { EmailContent } from "@/components/email-marketing/editor/types";
import { campaignSchema, CampaignFormData, UseEmailCampaignFormProps, buildEditableContentFromHtml, toFormCoupon, toDbCoupon, type AudienceType, type AudienceReference } from "./emailCampaignSchema";

export { campaignSchema, type CampaignFormData, type UseEmailCampaignFormProps } from "./emailCampaignSchema";

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
      const { data, error } = await supabase.from("email_integrations").select("id, name, sender_email, sender_name, is_active").eq("tenant_id", tenantId).eq("is_active", true).order("created_at", { ascending: false });
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
    defaultValues: { internal_name: "", subject: "", preheader: "", sender_name: "", sender_email: "", reply_to: "", campaign_type: "newsletter", email_integration_id: "", coupon_codes: [], attribution_window_days: 7, skip_recent_days: 0, unique_coupon: null, ...initialDefaultValues },
  });

  const { data: integrationSenders } = useQuery({
    queryKey: ["email-integration-senders", watchedIntegrationId],
    queryFn: async () => {
      if (!watchedIntegrationId) return [];
      const { data, error } = await supabase.from("email_integration_senders").select("id, sender_email, sender_name, is_active").eq("integration_id", watchedIntegrationId).eq("is_active", true);
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
      resetSilently({ internal_name: "", subject: "", preheader: "", sender_name: "", sender_email: "", reply_to: "", campaign_type: "newsletter", email_integration_id: "", coupon_codes: [], attribution_window_days: 7, skip_recent_days: 0, unique_coupon: null, ...initialDefaultValues });
      setEmailContent(null); setEmailHTML(""); setActiveTab("details"); setSelectedTemplateId(undefined);
      setAudienceType("all"); setAudienceReference({}); setIsDirty(false); setEditorKey((prev) => prev + 1);
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
      resetSilently({ internal_name: existingCampaign.internal_name || "", subject: existingCampaign.subject || "", preheader: existingCampaign.preheader || "", sender_name: existingCampaign.sender_name || "", sender_email: existingCampaign.sender_email || "", reply_to: existingCampaign.reply_to || "", campaign_type: (existingCampaign.campaign_type as EmailCampaignType) || "newsletter", template_id: existingCampaign.template_id || "", scheduled_at: existingCampaign.scheduled_at || "", email_integration_id: integId, coupon_codes: existingCampaign.coupon_codes ?? [], attribution_window_days: existingCampaign.attribution_window_days ?? 7, skip_recent_days: existingCampaign.skip_recent_days ?? 0, unique_coupon: toFormCoupon(existingCampaign.unique_coupon) });
      setWatchedIntegrationId(integId || undefined);
      setAudienceType((existingCampaign.audience_type || "all") as AudienceType);
      try {
        const ref = existingCampaign.audience_reference;
        if (!ref) setAudienceReference({});
        else if (typeof ref === "string") setAudienceReference(JSON.parse(ref));
        else if (typeof ref === "object") setAudienceReference(ref as AudienceReference);
        else setAudienceReference({});
      } catch { setAudienceReference({}); }
      if (existingCampaign.content_json) setEmailContent(existingCampaign.content_json as unknown as EmailContent);
      if (existingCampaign.content_html) setEmailHTML(existingCampaign.content_html);
      setEditorKey((prev) => prev + 1); setIsDirty(false);
    }
  }, [existingCampaign, resetSilently]);

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      if (!selectedTemplate) return;
      let resolvedContent = (selectedTemplate.content_json as unknown as EmailContent | null) ?? null;
      let resolvedHtml = selectedTemplate.content_html || "";
      if (!resolvedContent && selectedTemplate.id && tenantId) {
        const { data } = await supabase.from("email_campaigns").select("content_json, content_html").eq("template_id", selectedTemplate.id).eq("tenant_id", tenantId).not("content_json", "is", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (data?.content_json) { resolvedContent = data.content_json as unknown as EmailContent; if (!resolvedHtml) resolvedHtml = data.content_html || ""; }
      }
      if (!resolvedContent && resolvedHtml) resolvedContent = buildEditableContentFromHtml(resolvedHtml);
      if (cancelled) return;
      setEmailContent(resolvedContent); setEmailHTML(resolvedHtml); setEditorKey((prev) => prev + 1); setIsDirty(true);
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
    setShowCloseWarning(false); setIsDirty(false); setActiveTab("details"); setSelectedTemplateId(undefined);
    setAudienceType("all"); setAudienceReference({}); form.reset(); setEmailContent(null); setEmailHTML("");
    setEditorKey((prev) => prev + 1); onOpenChange(false);
  };

  const onSubmit = async (data: CampaignFormData) => {
    if (audienceType === "manual" && !(audienceReference.emails?.length)) {
      toast.error("A lista manual está vazia. Digite pelo menos um e-mail na Audiência.");
      setActiveTab("details");
      return;
    }
    try {
      const payload = { internal_name: data.internal_name, subject: data.subject, preheader: data.preheader, sender_name: data.sender_name, sender_email: data.sender_email, reply_to: data.reply_to || undefined, campaign_type: data.campaign_type, template_id: data.template_id || undefined, audience_type: audienceType, audience_reference: JSON.stringify(audienceReference), scheduled_at: data.scheduled_at || undefined, content_json: emailContent, content_html: emailHTML, email_integration_id: data.email_integration_id, coupon_codes: data.coupon_codes ?? [], attribution_window_days: data.attribution_window_days ?? 7, skip_recent_days: data.skip_recent_days || null, unique_coupon: toDbCoupon(data.unique_coupon) };
      if (campaignId) { await updateMutation.mutateAsync({ id: campaignId, updates: payload }); }
      else { await createMutation.mutateAsync(payload); }
      setIsDirty(false); onOpenChange(false); setActiveTab("details"); form.reset();
    } catch { /* Error handled in mutation */ }
  };

  const handleEditorChange = (content: EmailContent, html: string) => { setEmailContent(content); setEmailHTML(html); setIsDirty(true); };

  const draftKey = `campaign:${campaignId ?? "new"}:${(existingCampaign as { updated_at?: string } | undefined)?.updated_at ?? ""}`;
  return { draftKey, form, templates, emailIntegrations, integrationSenders, totalSenders, emailContent, emailHTML, activeTab, setActiveTab, selectedTemplateId, setSelectedTemplateId, isDirty, setIsDirty, showCloseWarning, setShowCloseWarning, watchedIntegrationId, setWatchedIntegrationId, editorKey, audienceType, setAudienceType, audienceReference, setAudienceReference, loadingTemplate, isPending, handleClose, handleForceClose, onSubmit, handleEditorChange };
}
