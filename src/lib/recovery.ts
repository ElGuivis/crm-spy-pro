import type { CouponConfig } from "@/components/email-marketing/CouponConfigFields";

export type RecoveryKind = "cart" | "browse" | "order" | "welcome";

export const RECOVERY_KINDS: { kind: RecoveryKind; label: string; short: string; description: string; nativeName: string }[] = [
  { kind: "cart", label: "Carrinho abandonado", short: "Carrinho", description: "Quem colocou produtos no carrinho e não comprou.", nativeName: "Abandono de carrinho" },
  { kind: "browse", label: "Navegação abandonada", short: "Navegação", description: "Quem viu produtos e saiu sem adicionar ao carrinho.", nativeName: "Abandono de navegação" },
  { kind: "order", label: "Pedido não finalizado", short: "Pedido", description: "Quem iniciou o pedido mas não concluiu o pagamento.", nativeName: "Abandono de pedido" },
  { kind: "welcome", label: "Boas-vindas (newsletter)", short: "Boas-vindas", description: "Quem se inscrever na newsletter da loja a partir de agora. Inscritos antigos só ficam como histórico: nada é enviado para eles.", nativeName: "" },
];

/** Os 8 tempos de espera disponíveis (entre 5 minutos e 48 horas), contados a partir do abandono. */
/** Tipos que têm automação nativa na Loja Integrada (boas-vindas não tem). */
export const NATIVE_KINDS = RECOVERY_KINDS.filter((k) => k.kind !== "welcome");

export const DELAY_OPTIONS = [
  { minutes: 5, label: "5 minutos" }, { minutes: 30, label: "30 minutos" }, { minutes: 60, label: "1 hora" }, { minutes: 180, label: "3 horas" },
  { minutes: 360, label: "6 horas" }, { minutes: 720, label: "12 horas" }, { minutes: 1440, label: "24 horas" }, { minutes: 2880, label: "48 horas" },
] as const;

export const delayLabel = (minutes: number) => DELAY_OPTIONS.find((d) => d.minutes === minutes)?.label ?? `${minutes} min`;
export const MAX_STEPS = 4;

export interface RecoveryStep {
  id: string;
  delay_minutes: number;
  /** campaign_id: e-mail da etapa (campanha de fluxo, editada no editor); guarda também os cupons da etapa */
  email: { enabled: boolean; campaign_id: string | null };
  whatsapp: { enabled: boolean; text: string };
  coupon: CouponConfig | null;
}

export interface RecoveryFlow {
  kind: RecoveryKind;
  enabled: boolean;
  enabled_at: string | null;
  email_integration_id: string | null;
  whatsapp_integration_id: string | null;
  steps: RecoveryStep[];
  quiet_start: string;
  quiet_end: string;
  max_event_age_hours: number;
  cooldown_days: number;
  min_value: number;
  opt_out_native: boolean;
}

export const DEFAULT_FLOW: Omit<RecoveryFlow, "kind"> = {
  enabled: false, enabled_at: null, email_integration_id: null, whatsapp_integration_id: null, steps: [],
  quiet_start: "21:00", quiet_end: "08:00", max_event_age_hours: 96, cooldown_days: 3, min_value: 0, opt_out_native: false,
};

export const newStepId = () => `s${Math.random().toString(36).slice(2, 8)}`;

export const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);

/** Etapas guardadas no banco (JSON livre) → lista segura, ordenada pelo tempo de espera. */
export function parseSteps(raw: unknown): RecoveryStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s): RecoveryStep => {
    const o = (s ?? {}) as Partial<RecoveryStep>;
    return {
      id: String(o.id || newStepId()),
      delay_minutes: Number(o.delay_minutes) >= 0 ? Number(o.delay_minutes) : 60,
      email: { enabled: !!o.email?.enabled, campaign_id: o.email?.campaign_id ?? null },
      whatsapp: { enabled: !!o.whatsapp?.enabled, text: o.whatsapp?.text ?? "" },
      coupon: o.coupon && typeof o.coupon === "object" ? (o.coupon as CouponConfig) : null,
    };
  }).sort((a, b) => a.delay_minutes - b.delay_minutes);
}

export interface FlowProblem { level: "error" | "warning"; text: string }

/** O que falta para o fluxo funcionar (erros impedem ligar; avisos só alertam). */
export function checkFlow(flow: RecoveryFlow, env: { storeUrl: string | null; emailIntegrations: number; whatsappConnected: boolean; nativeOn: boolean | null }): FlowProblem[] {
  const out: FlowProblem[] = [];
  const err = (text: string) => out.push({ level: "error", text });
  const warn = (text: string) => out.push({ level: "warning", text });
  const active = flow.steps.filter((s) => (s.email.enabled && s.email.campaign_id) || (s.whatsapp.enabled && s.whatsapp.text.trim()));
  if (!active.length) err("Adicione ao menos uma etapa com e-mail ou WhatsApp.");
  if (!env.storeUrl) err("Informe o endereço da loja (aba Loja Integrada): os links dos e-mails precisam dele.");
  if (flow.steps.some((s) => s.email.enabled) && !flow.email_integration_id) err("Escolha a integração de e-mail do fluxo.");
  if (flow.steps.some((s) => s.whatsapp.enabled) && !flow.whatsapp_integration_id) err("Escolha o WhatsApp do fluxo ou desligue o WhatsApp nas etapas.");
  if (flow.steps.some((s) => s.whatsapp.enabled) && flow.whatsapp_integration_id && !env.whatsappConnected) err("O WhatsApp escolhido não está conectado.");
  if (flow.steps.some((s) => s.coupon && !s.email.campaign_id)) err("Etapa com cupom precisa de um e-mail criado (ele guarda os cupons).");
  if (active.some((s) => s.email.enabled) && env.emailIntegrations === 0) err("Cadastre uma integração de e-mail em Integrações.");
  const delays = flow.steps.map((s) => s.delay_minutes);
  if (new Set(delays).size !== delays.length) warn("Duas etapas com o mesmo tempo de espera: elas saem em sequência, com 30 minutos de distância.");
  if (flow.kind !== "welcome" && env.nativeOn && !flow.opt_out_native) warn("A automação nativa da Loja Integrada deste tipo está ligada: quem receber a nossa e a nativa receberá em dobro. Desligue a nativa ou ative a opção \"tirar da nativa quem atendermos\".");
  return out;
}

export const KNOWN_FLOW_VARIABLES = [
  ["first_name", "primeiro nome"], ["cart_items", "lista dos itens (use o bloco \"Itens do carrinho\")"], ["cart_total", "total do carrinho"], ["cart_count", "quantidade de itens"],
  ["cart_url", "link para voltar ao carrinho"], ["product_name", "nome do 1º produto"], ["product_url", "link do 1º produto"],
  ["coupon_code", "código do cupom"], ["coupon_value", "desconto do cupom"], ["coupon_expires", "validade do cupom"],
] as const;
