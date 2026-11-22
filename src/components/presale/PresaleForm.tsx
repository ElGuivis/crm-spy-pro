import { FormEvent, InputHTMLAttributes, useState } from "react";
import {
  EMPTY_PRESALE_FORM, PresaleFormData, FieldErrors, checkForm, lookupCep,
  maskCep, maskCpf, maskDate, maskPhone, toIsoDate,
} from "./presale-utils";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/presale-signup`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const MASKS: Partial<Record<keyof PresaleFormData, (v: string) => string>> = {
  cpf: maskCpf, phone: maskPhone, birthDate: maskDate, cep: maskCep,
};

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "name"> {
  name: keyof PresaleFormData;
  label: string;
  value: string;
  error?: string;
  onValue: (name: keyof PresaleFormData, value: string) => void;
}

function Field({ name, label, value, error, onValue, className = "", ...rest }: FieldProps) {
  const id = `presale-${name}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[10px] sm:text-xs text-white/50 mb-1 uppercase tracking-[0.2em]">{label}</label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onValue(name, e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className="w-full bg-[#242424] border border-[#2e2e2e] rounded-[2px] px-3 sm:px-4 py-2.5 sm:py-3 text-base text-[#f2f2f2] placeholder:text-white/30 focus:outline-none focus:border-[#f2f2f2] transition-colors"
        {...rest}
      />
      {error ? <p id={`${id}-err`} className="text-[#ef4444] text-xs mt-1">{error}</p> : null}
    </div>
  );
}

interface Props {
  slug: string;
  onDone: (groupUrl: string | null) => void;
}

export function PresaleForm({ slug, onDone }: Props) {
  const [form, setForm] = useState<PresaleFormData>(EMPTY_PRESALE_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [cepLoading, setCepLoading] = useState(false);

  const setValue = (name: keyof PresaleFormData, raw: string) => {
    const value = MASKS[name] ? MASKS[name]!(raw) : raw;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    if (name === "cep" && value.replace(/\D/g, "").length === 8) void fillAddress(value);
  };

  const fillAddress = async (cep: string) => {
    setCepLoading(true);
    const r = await lookupCep(cep);
    setCepLoading(false);
    if (!r) {
      setErrors((prev) => ({ ...prev, cep: "CEP não encontrado. Preenche o endereço à mão." }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      street: r.street || prev.street,
      neighborhood: r.neighborhood || prev.neighborhood,
      city: r.city || prev.city,
      state: r.state || prev.state,
    }));
    setErrors((prev) => ({ ...prev, street: undefined, neighborhood: undefined, city: undefined, state: undefined }));
    if (r.street) document.getElementById("presale-number")?.focus();
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError("");
    const found = checkForm(form);
    if (Object.keys(found).length) {
      setErrors(found);
      document.getElementById(`presale-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({
          slug,
          name: form.name, email: form.email, cpf: form.cpf, phone: form.phone,
          birthDate: toIsoDate(form.birthDate), acceptsNewsletter: form.acceptsNewsletter, website: form.website,
          address: {
            cep: form.cep, street: form.street, number: form.number, complement: form.complement,
            neighborhood: form.neighborhood, city: form.city, state: form.state,
          },
        }),
      });
      type Reply = { ok?: boolean; groupUrl?: string | null; field?: string; message?: string };
      const body: Reply | null = await res.json().then((j: Reply) => j, (): null => null);
      if (res.ok && body?.ok) {
        onDone(body.groupUrl ?? null);
        return;
      }
      if (body?.field && body.field !== "form") setErrors({ [body.field]: body.message } as FieldErrors);
      else setServerError(body?.message ?? "Deu ruim. Tenta de novo aí.");
    } catch {
      setServerError("Sem conexão. Confere a internet e tenta de novo.");
    } finally {
      setSending(false);
    }
  };

  const f = (name: keyof PresaleFormData) => ({ name, value: String(form[name]), error: errors[name], onValue: setValue });

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 text-left">
      <Field {...f("name")} label="Nome completo" autoComplete="name" placeholder="Seu nome e sobrenome" />
      <Field {...f("email")} label="E-mail" type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field {...f("phone")} label="WhatsApp" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" />
        <Field {...f("birthDate")} label="Nascimento" inputMode="numeric" autoComplete="bday" placeholder="dd/mm/aaaa" />
      </div>
      <Field {...f("cpf")} label="CPF" inputMode="numeric" placeholder="000.000.000-00" />

      <div className="pt-2 border-t border-[#2e2e2e]" />
      <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
        <Field {...f("cep")} label={cepLoading ? "CEP (buscando…)" : "CEP"} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" />
        <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noreferrer" className="text-xs text-white/50 underline underline-offset-4 pb-3 hover:text-white">Não sei o CEP</a>
      </div>
      <Field {...f("street")} label="Rua" autoComplete="address-line1" />
      <div className="grid grid-cols-[110px_1fr] gap-4">
        <Field {...f("number")} label="Número" autoComplete="address-line2" />
        <Field {...f("complement")} label="Complemento" placeholder="Opcional" />
      </div>
      <Field {...f("neighborhood")} label="Bairro" autoComplete="address-level3" />
      <div className="grid grid-cols-[1fr_80px] gap-4">
        <Field {...f("city")} label="Cidade" autoComplete="address-level2" />
        <Field {...f("state")} label="UF" maxLength={2} autoComplete="address-level1" className="uppercase" />
      </div>

      {/* isca para robôs: invisível para pessoas */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website}
        onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      <label className="flex items-start gap-3 text-sm text-white/70 cursor-pointer pt-1">
        <input type="checkbox" checked={form.acceptsNewsletter} onChange={(e) => setForm((p) => ({ ...p, acceptsNewsletter: e.target.checked }))}
          className="mt-0.5 h-4 w-4 accent-[#dc2828]" />
        Quero receber novidades e ofertas da OUT/BACK! por e-mail.
      </label>

      <button type="submit" disabled={sending}
        className="w-full bg-[#f2f2f2] text-[#080808] font-['Bebas_Neue'] text-xl tracking-[0.14em] py-3.5 sm:py-4 rounded-[2px] hover:bg-[#dc2828] hover:text-white active:scale-[0.98] transition-all disabled:opacity-50">
        {sending ? "ENVIANDO…" : "QUERO ENTRAR NO GRUPO VIP"}
      </button>
      {serverError ? <p role="alert" className="text-[#ef4444] text-sm text-center">{serverError}</p> : null}
      <p className="text-[11px] text-white/40 text-center leading-relaxed">
        Seus dados criam seu cadastro na loja OUT/BACK! para agilizar a compra na pré-venda.
      </p>
    </form>
  );
}
