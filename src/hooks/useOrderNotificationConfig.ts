import { useState, useEffect } from "react";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/lib/logger";

const log = createLogger("OrderNotificationConfigDialog");

export type DelayUnit = "minutes" | "hours" | "days" | "months";

export const DELAY_UNIT_LABELS: Record<DelayUnit, string> = {
  minutes: "Minutos", hours: "Horas", days: "Dias", months: "Meses",
};

export interface StatusRule {
  id?: string;
  status_name: string;
  status_id?: number;
  is_enabled: boolean;
  message_template: string;
  email_subject?: string;
  email_body?: string;
  delay_minutes: number;
  delay_value?: number;
  delay_unit?: DelayUnit;
}

export interface OrderNotificationConfig {
  id?: string;
  name: string;
  integration_id: string | null;
  whatsapp_integration_id: string | null;
  email_integration_id: string | null;
  send_via_whatsapp: boolean;
  send_via_email: boolean;
  is_active: boolean;
  status_rules: StatusRule[];
}

export interface Integration { id: string; name: string; type: string; status: string; }
export interface EmailIntegration { id: string; name: string; sender_email: string; is_active: boolean; }

export const MESSAGE_PLACEHOLDERS = [
  { key: "{{cliente_nome}}", label: "Nome Completo" },
  { key: "{{cliente_primeiro_nome}}", label: "Primeiro Nome" },
  { key: "{{numero_pedido}}", label: "Número do Pedido" },
  { key: "{{status}}", label: "Status" },
  { key: "{{valor_total}}", label: "Valor Total" },
  { key: "{{produtos}}", label: "Produtos" },
  { key: "{{rastreamento}}", label: "Código Rastreamento" },
];

const DEFAULT_MESSAGES: Record<string, string> = {
  "Pedido Pago": "Olá {{cliente_primeiro_nome}}! 🎉 Seu pedido #{{numero_pedido}} foi confirmado! Valor: {{valor_total}}. Já estamos preparando para envio.",
  "Pedido Enviado": "Oi {{cliente_primeiro_nome}}! 📦 Seu pedido #{{numero_pedido}} saiu para entrega! {{rastreamento}}",
  "Pedido Entregue": "{{cliente_primeiro_nome}}, seu pedido #{{numero_pedido}} foi entregue! 🏠 Esperamos que goste. Qualquer dúvida, estamos aqui!",
  "Pedido Cancelado": "Olá {{cliente_primeiro_nome}}, seu pedido #{{numero_pedido}} foi cancelado. Se tiver dúvidas, entre em contato.",
};

const STORE_TYPES = ["loja_integrada", "nuvemshop", "shopify", "woocommerce", "bling"];
const WHATSAPP_TYPES = ["evolution_whatsapp", "whatsapp_api", "z_api"];

export const getStoreIntegrationIcon = (type: string): string => {
  const map: Record<string, string> = { loja_integrada: "🛒", nuvemshop: "☁️", shopify: "🛍️", woocommerce: "🔮", bling: "📊" };
  return map[type] || "🏪";
};

export const getWhatsAppIntegrationIcon = (type: string): string => {
  const map: Record<string, string> = { evolution_whatsapp: "📱", whatsapp_api: "💬", z_api: "🔌" };
  return map[type] || "📲";
};

function minutesToDelayConfig(totalMinutes: number): { value: number; unit: DelayUnit } {
  if (totalMinutes <= 0) return { value: 0, unit: "minutes" };
  if (totalMinutes % (30 * 24 * 60) === 0) return { value: totalMinutes / (30 * 24 * 60), unit: "months" };
  if (totalMinutes % (24 * 60) === 0) return { value: totalMinutes / (24 * 60), unit: "days" };
  if (totalMinutes % 60 === 0) return { value: totalMinutes / 60, unit: "hours" };
  return { value: totalMinutes, unit: "minutes" };
}

export function delayConfigToMinutes(value: number, unit: DelayUnit): number {
  switch (unit) {
    case "months": return value * 30 * 24 * 60;
    case "days": return value * 24 * 60;
    case "hours": return value * 60;
    default: return value;
  }
}

const defaultConfig: OrderNotificationConfig = {
  name: "", integration_id: null, whatsapp_integration_id: null, email_integration_id: null,
  send_via_whatsapp: true, send_via_email: false, is_active: true, status_rules: [],
};

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
        .select("id, name, integration_id, whatsapp_integration_id, email_integration_id, send_via_whatsapp, send_via_email, is_active")
        .eq("id", id).single();
      if (configError) throw configError;

      const { data: rulesData, error: rulesError } = await supabase
        .from("order_notification_status_rules")
        .select("id, config_id, status_name, message_template, email_subject, email_body, is_enabled, delay_minutes")
        .eq("config_id", id).order("status_name");
      if (rulesError) throw rulesError;

      setConfig({
        id: configData.id, name: configData.name, integration_id: configData.integration_id,
        whatsapp_integration_id: configData.whatsapp_integration_id,
        email_integration_id: configData.email_integration_id,
        send_via_whatsapp: configData.send_via_whatsapp ?? true,
        send_via_email: configData.send_via_email ?? false,
        is_active: configData.is_active ?? true,
        status_rules: (rulesData || []).map((r) => { const p = minutesToDelayConfig(r.delay_minutes || 0); return { ...r, delay_value: p.value, delay_unit: p.unit }; }),
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

  const insertPlaceholder = (placeholder: string, statusName: string) => {
    const rule = config.status_rules.find((r) => r.status_name === statusName);
    if (!rule) return;
    updateRuleMessage(statusName, rule.message_template + placeholder);
  };

  const handleSave = async () => {
    if (!config.integration_id) { toast({ title: "Erro de validação", description: "Selecione uma integração de loja", variant: "destructive" }); return; }
    if (config.status_rules.filter((r) => r.is_enabled).length === 0) { toast({ title: "Erro de validação", description: "Ative pelo menos um status para notificação", variant: "destructive" }); return; }
    if (config.send_via_whatsapp && !config.whatsapp_integration_id) { toast({ title: "Erro de validação", description: "Selecione uma integração WhatsApp para envio", variant: "destructive" }); return; }

    setIsSaving(true);
    try {
      const configData = {
        name: config.name || "Notificação de Pedido",
        integration_id: config.integration_id, whatsapp_integration_id: config.whatsapp_integration_id,
        email_integration_id: config.email_integration_id, send_via_whatsapp: config.send_via_whatsapp,
        send_via_email: config.send_via_email, is_active: config.is_active, updated_at: new Date().toISOString(),
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
    toggleStatusRule, updateRuleMessage, updateRuleDelayParts, insertPlaceholder, handleSave,
  };
}
