export interface CycleStep {
  id?: string;
  stepNumber: number;
  delayDays: number;
  messageTemplate: string;
  isActive: boolean;
  useCustomCoupon: boolean;
  couponDiscountPercent: number | null;
  couponDurationDays: number | null;
}

export interface ReactivationConfig {
  id?: string;
  name: string;
  integrationId: string | null;
  whatsappIntegrationId: string | null;
  inactivityDays: number;
  maxCycles: number;
  couponDiscountPercent: number;
  couponDurationDays: number;
  messageTemplate: string;
  isActive: boolean;
  cycleSteps: CycleStep[];
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
}

export const STORE_TYPES = ['loja_integrada', 'bling'];
export const WHATSAPP_TYPES = ['evolution_whatsapp', 'whatsapp_api', 'z_api'];

export const MESSAGE_PLACEHOLDERS = [
  { key: '{{cliente_nome}}', label: 'Nome Completo', description: 'Nome completo do cliente' },
  { key: '{{cliente_primeiro_nome}}', label: 'Primeiro Nome', description: 'Apenas o primeiro nome do cliente' },
  { key: '{{desconto}}', label: '% Desconto', description: 'Porcentagem de desconto do cupom' },
  { key: '{{cupom}}', label: 'Código Cupom', description: 'O código do cupom gerado' },
  { key: '{{validade}}', label: 'Validade', description: 'Data de validade do cupom' },
  { key: '{{dias_inativo}}', label: 'Dias Inativo', description: 'Quantidade de dias sem comprar' },
  { key: '{{ciclo}}', label: 'Nº Ciclo', description: 'Número do ciclo atual (1, 2, 3...)' },
];

export const DEFAULT_MESSAGE = 'Olá {{cliente_nome}}! Sentimos sua falta 💜 Faz {{dias_inativo}} dias desde sua última compra. Preparamos um cupom especial de {{desconto}}% para você voltar: *{{cupom}}*. Válido até {{validade}}!';

export const defaultConfig: ReactivationConfig = {
  name: "Reativação de Clientes",
  integrationId: null,
  whatsappIntegrationId: null,
  inactivityDays: 30,
  maxCycles: 3,
  couponDiscountPercent: 10,
  couponDurationDays: 7,
  isActive: false,
  messageTemplate: DEFAULT_MESSAGE,
  cycleSteps: [
    { stepNumber: 1, delayDays: 0, messageTemplate: DEFAULT_MESSAGE, isActive: true, useCustomCoupon: false, couponDiscountPercent: null, couponDurationDays: null },
  ],
};

export const getStoreIcon = (type: string) => {
  switch (type) {
    case 'loja_integrada': return '🛒';
    case 'bling': return '📦';
    default: return '🏪';
  }
};

export const getWhatsAppIcon = (type: string) => {
  switch (type) {
    case 'evolution_whatsapp': return '📱';
    case 'whatsapp_api': return '💬';
    default: return '📲';
  }
};
