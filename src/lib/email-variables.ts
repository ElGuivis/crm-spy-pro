/**
 * Email Marketing Variable Replacement Utilities
 */

export const EMAIL_VARIABLES = {
  first_name: { label: 'Primeiro Nome', example: 'João' },
  last_name: { label: 'Sobrenome', example: 'Silva' },
  email: { label: 'E-mail', example: 'joao@example.com' },
  phone: { label: 'Telefone', example: '(11) 99999-9999' },
  company: { label: 'Empresa', example: 'Empresa Exemplo' },
  coupon_code: { label: 'Código de Cupom', example: 'DESCONTO10' },
  unsubscribe_url: { label: 'Link de Descadastro', example: '#' },
} as const;

export type EmailVariable = keyof typeof EMAIL_VARIABLES;

export interface VariableData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  coupon_code?: string;
  unsubscribe_url?: string;
}

/**
 * Replace variables in text with actual data
 */
export function replaceVariables(text: string, data: VariableData): string {
  if (!text) return text;
  
  let result = text;
  
  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  });
  
  return result;
}

/**
 * Replace variables with sample data for preview
 */
export function replaceVariablesWithSample(text: string): string {
  if (!text) return text;
  
  let result = text;
  
  Object.entries(EMAIL_VARIABLES).forEach(([key, { example }]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, example);
  });
  
  return result;
}

/**
 * Check if text contains variables
 */
export function hasVariables(text: string): boolean {
  return /\{\{[a-z_]+\}\}/.test(text);
}

/**
 * Extract variable names from text
 */
export function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([a-z_]+)\}\}/g);
  if (!matches) return [];
  
  return matches.map(match => match.replace(/\{\{|\}\}/g, ''));
}
