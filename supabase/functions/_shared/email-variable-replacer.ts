/**
 * Replace email variables with actual data
 */

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
 * Troca {{variavel}} pelo dado. Aceita valor padrão: {{first_name|cliente}} usa "cliente" quando o nome está vazio.
 * Variáveis desconhecidas ficam como estão.
 */
export function replaceVariables(text: string, data: VariableData): string {
  if (!text) return text;

  return text.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (match, key: string, fallback?: string) => {
    if (!(key in data)) return match;
    const value = (data as Record<string, string | undefined>)[key];
    return value || fallback?.trim() || "";
  });
}
