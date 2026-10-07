/**
 * Privacidade (LGPD) do contexto da IA:
 * - cadastro achado por nome/CPF digitado so vale se o telefone for o do proprio contato
 *   (senao qualquer pessoa leria dados de outra digitando o nome dela);
 * - a IA recebe so o minimo do cliente (nome e cidade/UF): nunca CPF, e-mail, telefone, rua ou CEP.
 */

export interface CustomerLike {
  nome?: string | null;
  name?: string | null;
  celular?: string | null;
  telefone?: string | null;
  telefone_celular?: string | null;
  telefone_principal?: string | null;
  phone?: string | null;
  endereco?: Record<string, unknown> | null;
  endereco_cidade?: string | null;
  endereco_estado?: string | null;
}

const last9 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-9);

/** Telefones cadastrados do cliente (qualquer campo conhecido), so digitos. */
export function customerPhones(c: CustomerLike): string[] {
  return [c.celular, c.telefone, c.telefone_celular, c.telefone_principal, c.phone].map(last9).filter((p) => p.length === 9);
}

/** True se o telefone da conversa e um dos telefones do cadastro. */
export function customerOwnsPhone(c: CustomerLike, contactPhone: string): boolean {
  const mine = last9(contactPhone);
  return mine.length === 9 && customerPhones(c).includes(mine);
}

/** Bloco minimo do cliente para a IA: so nome e cidade/UF. */
export function formatCustomerMinimal(c: CustomerLike): string {
  const name = c.nome || c.name || 'Não informado';
  const end = (c.endereco ?? {}) as Record<string, unknown>;
  const city = c.endereco_cidade || (end.municipio as string | undefined) || '';
  const state = c.endereco_estado || (end.uf as string | undefined) || '';
  const place = city ? `${city}${state ? `/${state}` : ''}` : 'Não informado';
  return `
=== DADOS DO CLIENTE IDENTIFICADO ===
- Nome: ${name}
- Cidade: ${place}
(Por privacidade, CPF, e-mail, telefone e endereço completo não são fornecidos nem devem ser pedidos de volta ao cliente.)
`;
}
