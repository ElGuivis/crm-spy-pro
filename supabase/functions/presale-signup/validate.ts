// Validação do cadastro da página de pré-venda (endpoint público: nada do corpo é confiável).

export interface PresaleAddress {
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface PresaleInput {
  slug: string;
  name: string;
  email: string;
  cpf: string;          // 11 dígitos
  phone: string;        // só dígitos, DDD + número (10 ou 11), sem 55
  birthDate: string;    // AAAA-MM-DD
  address: PresaleAddress;
  acceptsNewsletter: boolean;
}

export type ValidationResult = { ok: true; data: PresaleInput } | { ok: false; field: string; message: string };

const UFS = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

/** Telefone brasileiro: aceita com ou sem 55; devolve DDD + número (10 ou 11 dígitos) ou "" se inválido. */
export function normalizeBrPhone(raw: string): string {
  let d = onlyDigits(raw);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return "";
  if (d.startsWith("0") || d[2] === "0") return "";
  if (d.length === 11 && d[2] !== "9") return "";
  return d;
}

/** "(11) 99999-8888", o formato que a Loja Integrada usa. */
export function formatBrPhone(d: string): string {
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/** CPF com dígitos verificadores corretos (11 dígitos, não repetidos). */
export function validCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[len])) return false;
  }
  return true;
}

function validBirthDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 10 && age <= 110;
}

export function validatePresale(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, field: "form", message: "Dados inválidos" };
  const b = body as Record<string, unknown>;
  const a = (b.address && typeof b.address === "object" ? b.address : {}) as Record<string, unknown>;

  const slug = str(b.slug, 40).toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { ok: false, field: "form", message: "Página inválida" };

  const name = str(b.name, 120);
  if (name.length < 3 || !name.includes(" ")) return { ok: false, field: "name", message: "Coloca teu nome e sobrenome" };

  const email = str(b.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { ok: false, field: "email", message: "E-mail inválido, confere aí" };

  const cpf = onlyDigits(str(b.cpf, 20));
  if (!validCpf(cpf)) return { ok: false, field: "cpf", message: "CPF inválido, confere aí" };

  const phone = normalizeBrPhone(str(b.phone, 30));
  if (!phone) return { ok: false, field: "phone", message: "WhatsApp inválido, confere o DDD e o número" };

  const birthDate = str(b.birthDate, 10);
  if (!validBirthDate(birthDate)) return { ok: false, field: "birthDate", message: "Data de nascimento inválida" };

  const address: PresaleAddress = {
    cep: onlyDigits(str(a.cep, 12)),
    street: str(a.street, 150),
    number: str(a.number, 20),
    complement: str(a.complement, 80),
    neighborhood: str(a.neighborhood, 80),
    city: str(a.city, 80),
    state: str(a.state, 2).toUpperCase(),
  };
  if (address.cep.length !== 8) return { ok: false, field: "cep", message: "CEP inválido" };
  if (address.street.length < 2) return { ok: false, field: "street", message: "Informe a rua" };
  if (!address.number) return { ok: false, field: "number", message: "Informe o número (ou S/N)" };
  if (address.neighborhood.length < 2) return { ok: false, field: "neighborhood", message: "Informe o bairro" };
  if (address.city.length < 2) return { ok: false, field: "city", message: "Informe a cidade" };
  if (!UFS.has(address.state)) return { ok: false, field: "state", message: "UF inválida" };

  return { ok: true, data: { slug, name, email, cpf, phone, birthDate, address, acceptsNewsletter: b.acceptsNewsletter === true } };
}
