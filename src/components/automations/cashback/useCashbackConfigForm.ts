import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  CashbackConfig,
  Integration,
  EmailIntegration,
  defaultConfig,
  DEFAULT_MESSAGE_TEMPLATE,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_BODY,
  DEFAULT_REMINDER_1,
  DEFAULT_REMINDER_2,
} from "./cashback-config-types";

import { createLogger } from '@/lib/logger';
const log = createLogger('useCashbackConfigForm');

interface UseCashbackConfigFormProps {
  open: boolean;
  editingId?: string | null;
  initialConfig?: CashbackConfig;
  onSave: () => void;
  onClose: () => void;
}

export function useCashbackConfigForm({ open, editingId, initialConfig, onSave, onClose }: UseCashbackConfigFormProps) {
  const [config, setConfig] = useState<CashbackConfig>(defaultConfig);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [availableIntegrations, setAvailableIntegrations] = useState<Integration[]>([]);
  const [emailIntegrations, setEmailIntegrations] = useState<EmailIntegration[]>([]);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [emailEditMode, setEmailEditMode] = useState<'simple' | 'html'>('simple');
  const { toast } = useToast();
  const { tenant } = useAuth();

  const loadExistingConfig = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('cashback_configs')
        .select('id, name, discount_percentage, coupon_duration_days, integration_name, integration_id, min_purchase_value, max_discount_value, trigger_statuses, whatsapp_integration_id, is_active, send_via_whatsapp, message_template, send_via_email, email_integration_id, email_subject, email_body_text, email_body_html, reminder_1_enabled, reminder_1_days_before, reminder_1_message, reminder_2_enabled, reminder_2_days_before, reminder_2_message')
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        setConfig({
          id: data.id,
          name: data.name || '',
          discountPercent: data.discount_percentage,
          durationDays: data.coupon_duration_days,
          integration: data.integration_name || '',
          integrationId: data.integration_id || null,
          minPurchaseValue: data.min_purchase_value,
          maxDiscountValue: data.max_discount_value,
          triggerStatuses: data.trigger_statuses || [],
          whatsappIntegrationId: data.whatsapp_integration_id,
          isActive: data.is_active,
          sendViaWhatsapp: data.send_via_whatsapp ?? true,
          messageTemplate: data.message_template || DEFAULT_MESSAGE_TEMPLATE,
          sendViaEmail: data.send_via_email ?? false,
          emailIntegrationId: data.email_integration_id,
          emailSubject: data.email_subject || DEFAULT_EMAIL_SUBJECT,
          emailBodyText: data.email_body_text || DEFAULT_EMAIL_BODY,
          emailBodyHtml: data.email_body_html || '',
          reminder1Enabled: data.reminder_1_enabled ?? false,
          reminder1DaysBefore: data.reminder_1_days_before ?? 7,
          reminder1Message: data.reminder_1_message || DEFAULT_REMINDER_1,
          reminder2Enabled: data.reminder_2_enabled ?? false,
          reminder2DaysBefore: data.reminder_2_days_before ?? 3,
          reminder2Message: data.reminder_2_message || DEFAULT_REMINDER_2,
        });
        setEmailEditMode(data.email_body_html ? 'html' : 'simple');
      }
    } catch (error) {
      log.error('Error loading existing config:', error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar a configuração existente.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (open) {
      if (editingId) {
        loadExistingConfig(editingId);
      } else if (initialConfig) {
        setConfig(initialConfig);
        setEmailEditMode(initialConfig.emailBodyHtml ? 'html' : 'simple');
      } else {
        setConfig(defaultConfig);
        setEmailEditMode('simple');
      }
      loadIntegrations();
      loadEmailIntegrations();
    }
  }, [open, editingId, initialConfig]);

  useEffect(() => {
    if (open && config.integrationId) {
      loadAvailableStatuses(config.integrationId);
    } else if (open && !config.integrationId) {
      setAvailableStatuses([]);
    }
  }, [open, config.integrationId]);

  const loadIntegrations = async () => {
    setIsLoadingIntegrations(true);
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('id, name, type, status')
        .eq('status', 'connected');
      if (data && !error) setAvailableIntegrations(data);
    } catch (error) {
      log.error('Error loading integrations:', error);
    } finally {
      setIsLoadingIntegrations(false);
    }
  };

  const loadEmailIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .select('id, name, sender_email, smtp_host, is_active')
        .eq('is_active', true);
      if (data && !error) setEmailIntegrations(data);
    } catch (error) {
      log.error('Error loading email integrations:', error);
    }
  };

  const loadAvailableStatuses = async (integrationId?: string) => {
    setIsLoadingStatuses(true);
    try {
      if (integrationId) {
        const { data, error } = await supabase.functions.invoke('get-store-statuses', {
          body: { integration_id: integrationId }
        });
        if (!error && data?.success && data.statuses) {
          const statuses = data.statuses.map((s: { id: number | null; name: string }) => s.name);
          setAvailableStatuses(statuses);
          setIsLoadingStatuses(false);
          return;
        }
      }

      const allStatuses: string[] = [];
      let offset = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('li_orders')
          .select('status_name')
          .not('status_name', 'is', null);
        if (integrationId) query = query.eq('integration_id', integrationId);
        const { data, error } = await query.range(offset, offset + limit - 1);

        if (error) break;
        if (data && data.length > 0) {
          data.forEach((order: Record<string, unknown>) => {
            const name = order.status_name as string;
            if (name && !allStatuses.includes(name)) allStatuses.push(name);
          });
          offset += limit;
          hasMore = data.length === limit;
        } else {
          hasMore = false;
        }
      }
      setAvailableStatuses(allStatuses.sort());
    } catch (error) {
      log.error('Error loading statuses:', error);
    } finally {
      setIsLoadingStatuses(false);
    }
  };

  const handleStatusToggle = (status: string) => {
    const newStatuses = config.triggerStatuses.includes(status)
      ? config.triggerStatuses.filter(s => s !== status)
      : [...config.triggerStatuses, status];
    setConfig({ ...config, triggerStatuses: newStatuses });
  };

  const insertPlaceholder = (placeholder: string, target: 'whatsapp' | 'email' = 'whatsapp') => {
    const textarea = target === 'whatsapp' ? textareaRef.current : emailTextareaRef.current;
    const field = target === 'whatsapp' ? 'messageTemplate' : 'emailBodyText';
    const currentValue = target === 'whatsapp' ? config.messageTemplate : config.emailBodyText;

    if (!textarea) {
      setConfig({ ...config, [field]: currentValue + placeholder });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = currentValue.substring(0, start) + placeholder + currentValue.substring(end);
    setConfig({ ...config, [field]: newText });

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + placeholder.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertEmailSubjectPlaceholder = (placeholder: string) => {
    setConfig({ ...config, emailSubject: config.emailSubject + ' ' + placeholder });
  };

  const handleSave = async () => {
    if (!config.integrationId) {
      toast({ title: "Erro de validação", description: "Selecione uma integração de loja", variant: "destructive" });
      return;
    }
    if (config.discountPercent <= 0 || config.discountPercent > 100) {
      toast({ title: "Erro de validação", description: "A porcentagem deve estar entre 1 e 100%", variant: "destructive" });
      return;
    }
    if (config.durationDays <= 0) {
      toast({ title: "Erro de validação", description: "A duração deve ser maior que 0 dias", variant: "destructive" });
      return;
    }
    if (config.triggerStatuses.length === 0) {
      toast({ title: "Erro de validação", description: "Selecione pelo menos um status de gatilho", variant: "destructive" });
      return;
    }
    if (config.sendViaWhatsapp && !config.whatsappIntegrationId) {
      toast({ title: "Erro de validação", description: "Selecione uma integração WhatsApp para envio", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const configData = {
        name: config.name || 'Cashback',
        discount_percentage: config.discountPercent,
        coupon_duration_days: config.durationDays,
        integration_name: config.integration,
        integration_id: config.integrationId || null,
        min_purchase_value: config.minPurchaseValue,
        max_discount_value: config.maxDiscountValue,
        trigger_statuses: config.triggerStatuses,
        whatsapp_integration_id: config.whatsappIntegrationId || null,
        is_active: config.isActive,
        send_via_whatsapp: config.sendViaWhatsapp,
        message_template: config.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
        send_via_email: config.sendViaEmail,
        email_integration_id: config.emailIntegrationId || null,
        email_subject: config.emailSubject || null,
        email_body_text: config.emailBodyText || null,
        email_body_html: config.emailBodyHtml || null,
        reminder_1_enabled: config.reminder1Enabled,
        reminder_1_days_before: config.reminder1DaysBefore,
        reminder_1_message: config.reminder1Message,
        reminder_2_enabled: config.reminder2Enabled,
        reminder_2_days_before: config.reminder2DaysBefore,
        reminder_2_message: config.reminder2Message,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from('cashback_configs').update(configData).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cashback_configs').insert({ ...configData, tenant_id: tenant?.id });
        if (error) throw error;
      }

      onSave();
      toast({
        title: "Configuração salva",
        description: editingId
          ? "A automação de cashback foi atualizada com sucesso."
          : "Nova automação de cashback criada com sucesso.",
      });
      onClose();
    } catch (error) {
      log.error('Error saving cashback config:', error);
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar a configuração. Tente novamente.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    config,
    setConfig,
    isSaving,
    textareaRef,
    emailTextareaRef,
    availableIntegrations,
    emailIntegrations,
    isLoadingIntegrations,
    availableStatuses,
    isLoadingStatuses,
    emailEditMode,
    setEmailEditMode,
    handleStatusToggle,
    insertPlaceholder,
    insertEmailSubjectPlaceholder,
    handleSave,
  };
}
