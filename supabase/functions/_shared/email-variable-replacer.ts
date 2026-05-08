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

export function replaceVariables(text: string, data: VariableData): string {
  if (!text) return text;

  let result = text;

  Object.entries(data).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  });

  return result;
}
