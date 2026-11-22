// Máscaras, validação leve e busca de CEP da página de pré-venda.
// A validação de verdade é no servidor (presale-signup/validate.ts); aqui é só para avisar antes de enviar.

export interface PresaleFormData {
  name: string;
  email: string;
  cpf: string;
  phone: string;
  birthDate: string; // dd/mm/aaaa na tela
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  website: string; // campo isca (robôs)
}

export const EMPTY_PRESALE_FORM: PresaleFormData = {
  name: "", email: "", cpf: "", phone: "", birthDate: "", cep: "", street: "", number: "",
  complement: "", neighborhood: "", city: "", state: "", website: "",
};

const digits = (v: string) => v.replace(/\D/g, "");

export function maskCpf(v: string): string {
  const d = digits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(v: string): string {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskDate(v: string): string {
  const d = digits(v).slice(0, 8);
  return d.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}

export function maskCep(v: string): string {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** dd/mm/aaaa -> aaaa-mm-dd ("" se inválida) */
export function toIsoDate(v: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return "";
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : "";
}

export function isValidCpf(v: string): boolean {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[len])) return false;
  }
  return true;
}

export type FieldErrors = Partial<Record<keyof PresaleFormData, string>>;

export function checkForm(f: PresaleFormData): FieldErrors {
  const e: FieldErrors = {};
  if (f.name.trim().length < 3 || !f.name.trim().includes(" ")) e.name = "Coloca teu nome e sobrenome";
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.email.trim())) e.email = "E-mail inválido, confere aí";
  if (!isValidCpf(f.cpf)) e.cpf = "CPF inválido, confere aí";
  const p = digits(f.phone);
  if (p.length !== 11 && p.length !== 10) e.phone = "WhatsApp com DDD";
  if (!toIsoDate(f.birthDate)) e.birthDate = "Data inválida (dd/mm/aaaa)";
  if (digits(f.cep).length !== 8) e.cep = "CEP inválido";
  if (f.street.trim().length < 2) e.street = "Informe a rua";
  if (!f.number.trim()) e.number = "Nº ou S/N";
  if (f.neighborhood.trim().length < 2) e.neighborhood = "Informe o bairro";
  if (f.city.trim().length < 2) e.city = "Informe a cidade";
  if (!/^[A-Za-z]{2}$/.test(f.state.trim())) e.state = "UF";
  return e;
}

export interface CepResult { street: string; neighborhood: string; city: string; state: string }

/** ViaCEP (público, sem chave). null se não achar ou der erro: a pessoa preenche à mão. */
export async function lookupCep(cep: string): Promise<CepResult | null> {
  const d = digits(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (j.erro) return null;
    return { street: j.logradouro ?? "", neighborhood: j.bairro ?? "", city: j.localidade ?? "", state: j.uf ?? "" };
  } catch {
    return null;
  }
}
