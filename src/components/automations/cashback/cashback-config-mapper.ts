import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import {
  CashbackConfig, MinOrderMode, defaultConfig, DEFAULT_MESSAGE_TEMPLATE, DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_BODY, DEFAULT_REMINDER_1, DEFAULT_REMINDER_2,
} from "./cashback-config-types";

type Row = Tables<"cashback_configs">;

/** Linha do banco -> formulário. Configurações antigas (sem as regras novas) continuam como eram: valor fixo, sem carência. */
export function rowToConfig(d: Row): CashbackConfig {
  return {
    id: d.id,
    name: d.name || "",
    discountPercent: d.discount_percentage,
    durationDays: d.coupon_duration_days,
    integration: d.integration_name || "",
    integrationId: d.integration_id || null,
    minPurchaseValue: d.min_purchase_value,
    maxDiscountValue: d.max_discount_value,
    triggerStatuses: d.trigger_statuses || [],
    whatsappIntegrationId: d.whatsapp_integration_id,
    isActive: d.is_active,
    sendViaWhatsapp: d.send_via_whatsapp ?? true,
    messageTemplate: d.message_template || DEFAULT_MESSAGE_TEMPLATE,
    sendViaEmail: d.send_via_email ?? false,
    emailIntegrationId: d.email_integration_id,
    emailSubject: d.email_subject || DEFAULT_EMAIL_SUBJECT,
    emailBodyText: d.email_body_text || DEFAULT_EMAIL_BODY,
    emailBodyHtml: d.email_body_html || "",
    reminder1Enabled: d.reminder_1_enabled ?? false,
    reminder1DaysBefore: d.reminder_1_days_before ?? 7,
    reminder1Message: d.reminder_1_message || DEFAULT_REMINDER_1,
    reminder2Enabled: d.reminder_2_enabled ?? false,
    reminder2DaysBefore: d.reminder_2_days_before ?? 3,
    reminder2Message: d.reminder_2_message || DEFAULT_REMINDER_2,
    releaseDelayDays: d.release_delay_days ?? defaultConfig.releaseDelayDays,
    maxCartPercent: d.max_cart_percent,
    minOrderMode: (d.min_order_mode as MinOrderMode) || "none",
    minOrderValue: d.min_order_value,
    minCreditValue: d.min_credit_value ?? 0,
    baseExcludesShipping: d.base_excludes_shipping ?? true,
    personalCoupon: d.personal_coupon ?? true,
    cumulative: d.cumulative ?? true,
    cancelOnRefund: d.cancel_on_refund ?? true,
  };
}

/** Formulário -> colunas da tabela (sem tenant_id, que só vai na criação). */
export function configToRow(c: CashbackConfig): Omit<TablesInsert<"cashback_configs">, "tenant_id"> {
  return {
    name: c.name || "Cashback",
    discount_percentage: c.discountPercent,
    coupon_duration_days: c.durationDays,
    integration_name: c.integration,
    integration_id: c.integrationId || null,
    min_purchase_value: c.minPurchaseValue,
    max_discount_value: c.maxDiscountValue,
    trigger_statuses: c.triggerStatuses,
    whatsapp_integration_id: c.whatsappIntegrationId || null,
    is_active: c.isActive,
    send_via_whatsapp: c.sendViaWhatsapp,
    message_template: c.messageTemplate || DEFAULT_MESSAGE_TEMPLATE,
    send_via_email: c.sendViaEmail,
    email_integration_id: c.emailIntegrationId || null,
    email_subject: c.emailSubject || null,
    email_body_text: c.emailBodyText || null,
    email_body_html: c.emailBodyHtml || null,
    reminder_1_enabled: c.reminder1Enabled,
    reminder_1_days_before: c.reminder1DaysBefore,
    reminder_1_message: c.reminder1Message,
    reminder_2_enabled: c.reminder2Enabled,
    reminder_2_days_before: c.reminder2DaysBefore,
    reminder_2_message: c.reminder2Message,
    release_delay_days: c.releaseDelayDays,
    max_cart_percent: c.maxCartPercent,
    min_order_mode: c.minOrderMode,
    min_order_value: c.minOrderMode === "none" ? null : c.minOrderValue,
    min_credit_value: c.minCreditValue,
    base_excludes_shipping: c.baseExcludesShipping,
    personal_coupon: c.personalCoupon,
    cumulative: c.cumulative,
    cancel_on_refund: c.cancelOnRefund,
    updated_at: new Date().toISOString(),
  };
}
