/**
 * Perfil do negocio por loja (tenant) para o prompt da IA.
 * Todo conhecimento da loja vem do banco (tenant_business_profiles), nunca do codigo:
 * cada tenant, de qualquer segmento, tem o proprio perfil e nunca ve o de outro.
 */

export interface StoreProfile {
  store_name?: string | null;
  segment?: string | null;
  about?: string | null;
  sells?: string | null;
  does_not_sell?: string | null;
  audience?: string | null;
  tone?: string | null;
  policies?: Record<string, unknown> | null;
  extra_rules?: string | null;
}

const POLICY_LABELS: Record<string, string> = {
  shipping: 'Frete e prazos',
  returns: 'Trocas e devoluções',
  payment: 'Formas de pagamento',
  hours: 'Horário de atendimento',
  wholesale: 'Atacado e revenda',
  warranty: 'Garantia',
  contact: 'Contato',
};

/** Regras que impedem a IA de inventar o que nao esta nos dados da loja. */
export const GROUNDING_RULES = `REGRAS SOBRE A LOJA:
- Só afirme sobre a loja, produtos, preços, prazos e políticas o que estiver neste prompt ou nos dados acima.
- Se a informação não estiver aqui, diga que não tem certeza e ofereça chamar um atendente. Nunca invente.
- Não ofereça produtos, marcas ou serviços que a loja não vende.
- Pedido, rastreio ou dados pessoais: nunca informe; oriente digitar *menu* e escolher "Rastrear pedido" (confirma a identidade).`;

function line(label: string, value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? `${label}: ${text}` : '';
}

/** Monta o bloco "sobre a loja"; devolve texto vazio se o perfil nao tiver nada preenchido. */
export function buildStoreProfileBlock(profile: StoreProfile | null | undefined): string {
  if (!profile) return '';
  const parts = [
    line('Nome da loja', profile.store_name),
    line('Segmento', profile.segment),
    line('Sobre a loja', profile.about),
    line('O que vendemos', profile.sells),
    line('O que NÃO vendemos', profile.does_not_sell),
    line('Público', profile.audience),
    line('Tom de voz', profile.tone),
  ];
  const missing: string[] = [];
  for (const [key, label] of Object.entries(POLICY_LABELS)) {
    const text = line(label, profile.policies?.[key]);
    if (text) parts.push(text); else missing.push(label);
  }
  parts.push(line('Regras adicionais', profile.extra_rules));
  const filled = parts.filter(Boolean);
  if (!filled.length) return '';
  const notRegistered = `NÃO CADASTRADO (não informe nada sobre isso; diga que não tem a informação e ofereça um atendente): ${missing.join(', ')}, preços e estoque de produtos específicos.`;
  return `PERFIL DA LOJA:\n${filled.join('\n')}\n${notRegistered}`;
}

/** Busca o perfil do tenant (so do tenant informado). Falha e ausencia devolvem null. */
// deno-lint-ignore no-explicit-any
export async function fetchStoreProfile(supabase: any, tenantId: string): Promise<StoreProfile | null> {
  const { data, error } = await supabase
    .from('tenant_business_profiles')
    .select('store_name, segment, about, sells, does_not_sell, audience, tone, policies, extra_rules')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) return null;
  return (data as StoreProfile | null) ?? null;
}
