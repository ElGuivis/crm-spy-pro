import { useState, useEffect } from "react";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/lib/logger";

const log = createLogger("OrderNotificationConfigDialog");

import {
  type DelayUnit, type OrderNotificationConfig, type StatusRule, type Integration, type EmailIntegration,
  DEFAULT_MESSAGES, STORE_TYPES, WHATSAPP_TYPES, defaultConfig, minutesToDelayConfig, delayConfigToMinutes,
} from "@/lib/orderNotification";

export * from "@/lib/orderNotification";

interface UseOrderNotificationConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: string | null;
  onSave: () => void;
}

export function useOrderNotificationConfig({ open, onOpenChange, editingId, onSave }: UseOrderNotificationConfigProps) {
  const [config, setConfig] = useState<OrderNotificationConfig>(defaultConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [storeIntegrations, setStoreIntegrations] = useState<Integration[]>([]);
  const [whatsappIntegrations, setWhatsappIntegrations] = useState<Integration[]>([]);
  const [emailIntegrations, setEmailIntegrations] = useState<EmailIntegration[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const { toast } = useToast();
  const { tenant } = useAuth();

  useEffect(() => {
    if (open) {
      loadIntegrations();
      loadEmailIntegrations();
      if (editingId) { loadExistingConfig(editingId); }
      else { setConfig(defaultConfig); }
    }
  }, [open, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (config.integration_id) loadAvailableStatuses(config.integration_id);
  }, [config.integration_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadExistingConfig = async (id: string) => {
    setIsLoading(true);
    try {
      const { data: configData, error: configError } = await supabase
        .from("order_notification_configs")
        .select("id, name, integration_id, whatsapp_integration_id, email_integration_id, send_via_whatsapp, send_via_email, is_active, send_window_enabled, send_window_start, send_window_end")
        .eq("id", id).single();
      if (configError) throw configError;

      const { data: rulesData, error: rulesError } = await supabase
        .from("order_notification_status_rules")
        .select("id, config_id, status_name, message_template, email_subject, email_body, is_enabled, delay_minutes, followup_enabled, followup_delay_minutes, followup_template")
        .eq("config_id", id).order("status_name");
      if (rulesError) throw rulesError;

      setConfig({
        id: configData.id, name: configData.name, integration_id: configData.integration_id,
        whatsapp_integration_id: configData.whatsapp_integration_id,
        email_integration_id: configData.email_integration_id,
        send_via_whatsapp: configData.send_via_whatsapp ?? true,
        send_via_email: configData.send_via_email ?? false,
        is_active: configData.is_active ?? true,
        send_window_enabled: configData.send_window_enabled ?? true,
        send_window_start: configData.send_window_start ?? 8,
        send_window_end: configData.send_window_end ?? 21,
        status_rules: (rulesData || []).map((r) => {
          const p = minutesToDelayConfig(r.delay_minutes || 0);
          const f = minutesToDelayConfig(r.followup_delay_minutes || 0);
          return { ...r, followup_template: r.followup_template ?? undefined, delay_value: p.value, delay_unit: p.unit, followup_delay_value: f.value, followup_delay_unit: f.unit };
        }),
      });
    } catch (error) {
      log.error("Error loading config:", error);
      toast({ title: "Erro ao carregar", description: "Não foi possível carregar a configuração.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase.from("integrations").select("id, name, type, status").eq("status", "connected");
      if (data && !error) {
        setStoreIntegrations(data.filter((i) => STORE_TYPES.includes(i.type)));
        setWhatsappIntegrations(data.filter((i) => WHATSAPP_TYPES.includes(i.type)));
      }
    } catch (error) { log.error("Error loading integrations:", error); }
  };

  const loadEmailIntegrations = async () => {
    try {
      const { data, error } = await supabase.from("email_integrations").select("id, name, sender_email, is_active").eq("is_active", true);
      if (data && !error) setEmailIntegrations(data);
    } catch (error) { log.error("Error loading email integrations:", error); }
  };

  const loadAvailableStatuses = async (integrationId: string) => {
    setIsLoadingStatuses(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-store-statuses", { body: { integration_id: integrationId } });
      if (error) { log.error("Error fetching statuses:", error); return; }
      if (data?.success && data.statuses) {
        const statuses = data.statuses.map((s: { id: number | null; name: string }) => s.name);
        setAvailableStatuses(statuses);
        if (!editingId && statuses.length > 0) {
          const newRules: StatusRule[] = statuses.map((status: string) => ({
            status_name: status,
            status_id: data.statuses.find((s: { name: string }) => s.name === status)?.id,
            is_enabled: false,
            message_template: DEFAULT_MESSAGES[status] || `Olá {{cliente_primeiro_nome}}! Seu pedido #{{numero_pedido}} está com status: ${status}.`,
            delay_minutes: 0,
          }));
          setConfig((prev) => ({ ...prev, status_rules: newRules }));
        }
      }
    } catch (error) { log.error("Error loading statuses:", error); }
    finally { setIsLoadingStatuses(false); }
  };

  const toggleStatusRule = (statusName: string) => {
    setConfig((prev) => {
      const idx = prev.status_rules.findIndex((r) => r.status_name === statusName);
      if (idx >= 0) {
        const newRules = [...prev.status_rules];
        newRules[idx] = { ...newRules[idx], is_enabled: !newRules[idx].is_enabled };
        return { ...prev, status_rules: newRules };
      }
      return { ...prev, status_rules: [...prev.status_rules, { status_name: statusName, is_enabled: true, message_template: DEFAULT_MESSAGES[statusName] || `Olá {{cliente_primeiro_nome}}! Seu pedido #{{numero_pedido}} está com status: ${statusName}.`, delay_minutes: 0 }] };
    });
  };

  const updateRuleMessage = (statusName: string, message: string) => {
    setConfig((prev) => ({ ...prev, status_rules: prev.status_rules.map((r) => r.status_name === statusName ? { ...r, message_template: message } : r) }));
  };

  const updateRuleDelayParts = (statusName: string, value: number, unit: DelayUnit) => {
    const totalMinutes = delayConfigToMinutes(value, unit);
    setConfig((prev) => ({ ...prev, status_rules: prev.status_rules.map((r) => r.status_name === statusName ? { ...r, delay_value: value, delay_unit: unit, delay_minutes: totalMinutes } : r) }));
  };

  const updateRule = (statusName: string, patch: Partial<StatusRule>) => {
    setConfig((prev) => ({ ...prev, status_rules: prev.status_rules.map((r) => r.status_name === statusName ? { ...r, ...patch } : r) }));
  };

  const updateFollowupDelay = (statusName: string, value: number, unit: DelayUnit) => {
    updateRule(statusName, { followup_delay_value: value, followup_delay_unit: unit, followup_delay_minutes: delayConfigToMinutes(value, unit) });
  };

  const insertPlaceholder = (placeholder: string, statusName: string) => {
    const rule = config.status_rules.find((r) => r.status_name === statusName);
    if (!rule) return;
    updateRuleMessage(statusName, rule.message_template + placeholder);
  };

  const handleSave = async () => {
    if (!config.integration_id) { toast({ title: "Erro de validação", description: "Selecione uma integração de loja", variant: "destructive" }); return; }
    if (config.status_rules.filter((r) => r.is_enabled).length === 0) { toast({ title: "Erro de validação", description: "Ative pelo menos um status para notificação", variant: "destructive" }); return; }
    if (config.send_window_enabled && config.send_window_start >= config.send_window_end) { toast({ title: "Erro de validação", description: "O horário de início do envio deve ser antes do fim", variant: "destructive" }); return; }
    if (config.send_via_whatsapp && !config.whatsapp_integration_id) { toast({ title: "Erro de validação", description: "Selecione uma integração WhatsApp para envio", variant: "destructive" }); return; }

    setIsSaving(true);
    try {
      const configData = {
        name: config.name || "Notificação de Pedido",
        integration_id: config.integration_id, whatsapp_integration_id: config.whatsapp_integration_id,
        email_integration_id: config.email_integration_id, send_via_whatsapp: config.send_via_whatsapp,
        send_via_email: config.send_via_email, is_active: config.is_active, updated_at: new Date().toISOString(),
        send_window_enabled: config.send_window_enabled, send_window_start: config.send_window_start, send_window_end: config.send_window_end,
      };
      let configId = editingId;
      if (editingId) {
        const { error } = await supabase.from("order_notification_configs").update(configData).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("order_notification_configs").insert({ ...configData, tenant_id: tenant?.id }).select().single();
        if (error) throw error;
        configId = data.id;
      }
      if (configId) {
        const rulesPayload = config.status_rules.filter((r) => r.is_enabled).map((r) => ({
          status_name: r.status_name,
          status_id: r.status_id ?? null,
          is_enabled: r.is_enabled,
          message_template: r.message_template,
          email_subject: r.email_subject || null,
          email_body: r.email_body || null,
          delay_minutes: r.delay_minutes || 0,
          followup_enabled: !!r.followup_enabled && !!r.followup_template?.trim() && (r.followup_delay_minutes || 0) > 0,
          followup_delay_minutes: r.followup_delay_minutes || 0,
          followup_template: r.followup_template || null,
        }));
        const { error: rpcError } = await supabase.rpc("replace_order_notification_rules", {
          p_config_id: configId,
          p_tenant_id: tenant?.id,
          p_rules: rulesPayload as unknown as Json,
        });
        if (rpcError) throw rpcError;
      }
      onSave();
      toast({ title: "Configuração salva", description: editingId ? "A notificação de pedido foi atualizada." : "Nova notificação de pedido criada." });
      onOpenChange(false);
    } catch (error) {
      log.error("Error saving config:", error);
      toast({ title: "Erro ao salvar", description: "Não foi possível salvar a configuração.", variant: "destructive" });
    } finally { setIsSaving(false); }
  };

  return {
    config, setConfig, isSaving, isLoading,
    storeIntegrations, whatsappIntegrations, emailIntegrations,
    availableStatuses, isLoadingStatuses,
    toggleStatusRule, updateRuleMessage, updateRuleDelayParts, updateRule, updateFollowupDelay, insertPlaceholder, handleSave,
  };
}
