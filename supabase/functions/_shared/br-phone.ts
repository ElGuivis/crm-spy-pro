/**
 * Celular brasileiro com e sem o nono dígito.
 * O WhatsApp entrega números antigos sem o 9 (55 31 8291-6988), enquanto a loja/automação
 * grava com o 9 (55 31 9 8291-6988). Sem casar os dois, a resposta do cliente vira um contato
 * novo, perde a conversa da automação e cai no menu do bot.
 */
export function brPhoneVariants(phone: string): string[] {
  const p = (phone || '').replace(/\D/g, '');
  if (!p.startsWith('55')) return [p];
  // 55 + DDD + 9 + 8 dígitos
  if (p.length === 13 && p[4] === '9') return [p, p.slice(0, 4) + p.slice(5)];
  // 55 + DDD + 8 dígitos começando em 6-9 (celular)
  if (p.length === 12 && /[6-9]/.test(p[4])) return [p, p.slice(0, 4) + '9' + p.slice(4)];
  return [p];
}

/** Chave única do celular (sempre com o nono dígito). Igual à função SQL `br_phone_key` (migration 20261121000001). */
export function brPhoneKey(phone: string): string {
  const p = (phone || '').replace(/\D/g, '');
  return /^55\d{2}[6-9]\d{7}$/.test(p) ? p.slice(0, 4) + '9' + p.slice(4) : p;
}

/** Entre contatos achados pelas variantes, prefere o número exato. */
export function pickExactFirst<T extends { phone: string }>(rows: T[] | null | undefined, phone: string): T | null {
  if (!rows?.length) return null;
  return rows.find((r) => r.phone === phone) ?? rows[0];
}
