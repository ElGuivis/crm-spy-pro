/** Utilitários do reactivation-processor (paginação, telefone, código de cupom). */

const PAGE_SIZE = 1000;

export interface InactiveCustomer {
  name: string;
  phone: string | null;
  email: string | null;
  lastOrderDate: string;
  daysInactive: number;
  source: 'loja_integrada' | 'bling';
}

export function generateCouponCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REACT';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (!cleaned.startsWith('55') && cleaned.length <= 11) cleaned = '55' + cleaned;
  return cleaned;
}

/** Fetch all rows with pagination to bypass the 1000-row limit */
export async function fetchAllRows<T>(
  query: { range: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }> },
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}
