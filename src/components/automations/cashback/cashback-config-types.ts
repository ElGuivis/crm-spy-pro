export interface CashbackConfig {
  id?: string;
  name: string;
  discountPercent: number;
  durationDays: number;
  integration: string;
  integrationId: string | null;
  minPurchaseValue: number | null;
  maxDiscountValue: number | null;
  triggerStatuses: string[];
  whatsappIntegrationId: string | null;
  isActive: boolean;
  sendViaWhatsapp: boolean;
  messageTemplate: string;
  sendViaEmail: boolean;
  emailIntegrationId: string | null;
  emailSubject: string;
  emailBodyText: string;
  emailBodyHtml: string;
  reminder1Enabled: boolean;
  reminder1DaysBefore: number;
  reminder1Message: string;
  reminder2Enabled: boolean;
  reminder2DaysBefore: number;
  reminder2Message: string;
}

export interface CashbackConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: string | null;
  initialConfig?: CashbackConfig;
  onSave: () => void;
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
}

export interface EmailIntegration {
  id: string;
  name: string;
  sender_email: string;
  smtp_host: string;
  is_active: boolean;
}

export const MESSAGE_PLACEHOLDERS = [
  { key: '{{cliente_nome}}', label: 'Nome Completo', description: 'Nome completo do cliente' },
  { key: '{{cliente_primeiro_nome}}', label: 'Primeiro Nome', description: 'Apenas o primeiro nome do cliente' },
  { key: '{{valor_cupom}}', label: 'Valor do Desconto', description: 'Valor do desconto em reais (ex: R$ 15,00)' },
  { key: '{{cupom}}', label: 'Código do Cupom', description: 'O código do cupom gerado' },
  { key: '{{validade}}', label: 'Validade', description: 'Data de validade do cupom' },
];

export const REMINDER_PLACEHOLDERS = [
  ...MESSAGE_PLACEHOLDERS,
  { key: '{{dias_restantes}}', label: 'Dias Restantes', description: 'Dias restantes até expirar' },
];

export const DEFAULT_REMINDER_1 = 'Olá {{cliente_nome}}! ⏰ Seu cupom {{cupom}} de {{valor_cupom}} de desconto expira em {{dias_restantes}} dias! Não perca essa oportunidade. Válido até {{validade}}.';
export const DEFAULT_REMINDER_2 = 'Olá {{cliente_nome}}! 🚨 Última chance! Seu cupom {{cupom}} expira em {{dias_restantes}} dias. Use agora e garanta {{valor_cupom}} de desconto!';
export const DEFAULT_MESSAGE_TEMPLATE = 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.';
export const DEFAULT_EMAIL_SUBJECT = 'Seu cupom de desconto chegou! 🎁';
export const DEFAULT_EMAIL_BODY = `Olá {{cliente_nome}}!

Obrigado pela sua compra! Como agradecimento, preparamos um cupom especial para você:

Código do cupom: {{cupom}}
Valor do desconto: {{valor_cupom}}
Válido até: {{validade}}

Aproveite!`;

export const defaultConfig: CashbackConfig = {
  name: "",
  discountPercent: 10,
  durationDays: 7,
  integration: "",
  integrationId: null,
  minPurchaseValue: null,
  maxDiscountValue: null,
  triggerStatuses: [],
  whatsappIntegrationId: null,
  isActive: true,
  sendViaWhatsapp: true,
  messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
  sendViaEmail: false,
  emailIntegrationId: null,
  emailSubject: DEFAULT_EMAIL_SUBJECT,
  emailBodyText: DEFAULT_EMAIL_BODY,
  emailBodyHtml: "",
  reminder1Enabled: false,
  reminder1DaysBefore: 7,
  reminder1Message: DEFAULT_REMINDER_1,
  reminder2Enabled: false,
  reminder2DaysBefore: 3,
  reminder2Message: DEFAULT_REMINDER_2,
};

export const STORE_TYPES = ['loja_integrada', 'nuvem_shop', 'shopify', 'woocommerce'];
export const WHATSAPP_TYPES = ['evolution_whatsapp', 'whatsapp_api', 'z_api'];

export const getStoreIntegrationIcon = (type: string): string => {
  switch (type) {
    case 'loja_integrada': return '🛒';
    case 'nuvem_shop': return '☁️';
    case 'shopify': return '🛍️';
    case 'woocommerce': return '🔮';
    default: return '🏪';
  }
};

export const getWhatsAppIntegrationIcon = (type: string): string => {
  switch (type) {
    case 'evolution_whatsapp': return '📱';
    case 'whatsapp_api': return '💬';
    case 'z_api': return '🔌';
    default: return '📲';
  }
};

/** Replaces placeholders with example values for preview */
export const previewMessage = (template: string, discountPercent: number, durationDays: number): string => {
  return template
    .replace(/\{\{cliente_nome\}\}/g, 'João Silva')
    .replace(/\{\{cliente_primeiro_nome\}\}/g, 'João')
    .replace(/\{\{valor_cupom\}\}/g, `R$ ${((100 * discountPercent) / 100).toFixed(2).replace('.', ',')}`)
    .replace(/\{\{cupom\}\}/g, 'AB12C')
    .replace(/\{\{validade\}\}/g, new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR'))
    .replace(/\{\{dias_restantes\}\}/g, '3');
};
