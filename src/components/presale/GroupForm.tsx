import { FormEvent, useState } from "react";
import { metaBrowserData } from "./metaPixel";
import { maskPhone } from "./presale-utils";

// Formulário curto do grupo VIP (mesmos campos da página antiga "fimdaout"):
// etapa 1 nome/WhatsApp/e-mail -> etapa 2 tamanhos (opcional) -> grupo.
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/presale-signup`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const SIZE_FIELDS = [
  { key: "shirtSize", label: "Camiseta", options: ["PP", "P", "M", "G", "GG", "XGG"] },
  { key: "pantsSize", label: "Calça", options: ["36", "38", "40", "42", "44", "46", "48", "50"] },
  { key: "shoeSize", label: "Tênis", options: ["34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44"] },
] as const;
type SizeKey = (typeof SIZE_FIELDS)[number]["key"];
type Lead = { name: string; phone: string; email: string; website: string };
type Reply = { ok?: boolean; id?: string; groupUrl?: string | null; field?: string; message?: string };

const INPUT = "w-full bg-[#242424] border border-[#2e2e2e] rounded-[2px] px-3 sm:px-4 py-2.5 sm:py-3 text-base text-[#f2f2f2] placeholder:text-white/30 focus:outline-none focus:border-[#f2f2f2] transition-colors";
const LABEL = "block text-[10px] sm:text-xs text-white/50 mb-1 uppercase tracking-[0.2em]";
const PRIMARY = "w-full bg-[#f2f2f2] text-[#080808] font-['Bebas_Neue'] text-xl tracking-[0.14em] py-3.5 sm:py-4 rounded-[2px] hover:bg-[#dc2828] hover:text-white active:scale-[0.98] transition-all disabled:opacity-50";

async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; body: Reply | null }> {
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON_KEY }, body: JSON.stringify(payload) });
  const body: Reply | null = await res.json().then((j: Reply) => j, (): null => null);
  return { ok: res.ok && !!body?.ok, body };
}

interface Props { slug: string; onDone: (groupUrl: string | null) => void; onSizesStep?: (eventId: string) => void }

export function GroupForm({ slug, onDone, onSizesStep }: Props) {
  const [step, setStep] = useState<"lead" | "sizes">("lead");
  const [lead, setLead] = useState<Lead>({ name: "", phone: "", email: "", website: "" });
  const [sizes, setSizes] = useState<Record<SizeKey, string>>({ shirtSize: "", pantsSize: "", shoeSize: "" });
  const [signup, setSignup] = useState<{ id: string; groupUrl: string | null } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Lead, string>>>({});
  const [serverError, setServerError] = useState("");
  const [sending, setSending] = useState(false);

  const change = (k: keyof Lead, v: string) => {
    setLead((p) => ({ ...p, [k]: k === "phone" ? maskPhone(v) : v }));
    setErrors((p) => (p[k] ? { ...p, [k]: undefined } : p));
  };

  const submitLead = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError("");
    const found: Partial<Record<keyof Lead, string>> = {};
    if (lead.name.trim().length < 2) found.name = "Bota teu nome aí";
    const digits = lead.phone.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) found.phone = "Número inválido, confere aí";
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(lead.email.trim())) found.email = "E-mail inválido, confere aí";
    if (Object.keys(found).length) {
      setErrors(found);
      document.getElementById(`vip-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const eventId = crypto.randomUUID();
      const { ok, body } = await post({ slug, action: "lead", ...lead, meta: metaBrowserData(eventId) });
      if (ok && body?.id) {
        setSignup({ id: body.id, groupUrl: body.groupUrl ?? null });
        setStep("sizes");
        onSizesStep?.(eventId);
      } else if (ok) onDone(body?.groupUrl ?? null);
      else if (body?.field && body.field !== "form") setErrors({ [body.field]: body.message });
      else setServerError(body?.message ?? "Deu ruim. Tenta de novo aí.");
    } catch {
      setServerError("Caiu a conexão. Confere a internet e tenta de novo.");
    } finally {
      setSending(false);
    }
  };

  const finish = async (withSizes: boolean) => {
    if (!signup) return;
    setSending(true);
    try {
      // mesmo se os tamanhos falharem, o cadastro já está salvo: segue pro grupo
      await post({ slug, action: "sizes", id: signup.id, ...(withSizes ? sizes : {}) }).catch((): null => null);
    } finally {
      setSending(false);
      onDone(signup.groupUrl);
    }
  };

  if (step === "sizes") {
    return (
      <div className="text-left space-y-4">
        <div className="text-center space-y-1">
          <p className="font-['Bebas_Neue'] text-2xl tracking-[0.08em] text-[#f2f2f2]">QUAL TEU TAMANHO?</p>
          <p className="text-sm text-white/60">Ajuda a gente a montar a grade da pré-venda. É opcional.</p>
        </div>
        {SIZE_FIELDS.map(({ key, label, options }) => (
          <div key={key}>
            <label htmlFor={`vip-${key}`} className={LABEL}>{label}</label>
            <select id={`vip-${key}`} value={sizes[key]} onChange={(e) => setSizes((p) => ({ ...p, [key]: e.target.value }))} className={INPUT}>
              <option value="">Prefiro não dizer</option>
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <button type="button" onClick={() => finish(true)} disabled={sending} className={PRIMARY}>
          {sending ? "SEGURA AÍ…" : "SALVAR E ENTRAR NO GRUPO"}
        </button>
        <button type="button" onClick={() => finish(false)} disabled={sending}
          className="w-full border border-[#2e2e2e] text-[#f2f2f2] py-3 rounded-[2px] hover:bg-[#242424] transition-colors disabled:opacity-50">
          Pular e entrar no grupo
        </button>
      </div>
    );
  }

  const fields = [
    { key: "name", label: "Nome", type: "text", placeholder: "Teu nome", auto: "name", mode: "text" },
    { key: "phone", label: "WhatsApp", type: "tel", placeholder: "(00) 00000-0000", auto: "tel-national", mode: "tel" },
    { key: "email", label: "E-mail", type: "email", placeholder: "teu@email.com", auto: "email", mode: "email" },
  ] as const;

  return (
    <form onSubmit={submitLead} noValidate className="space-y-4 text-left">
      {fields.map(({ key, label, type, placeholder, auto, mode }) => (
        <div key={key}>
          <label htmlFor={`vip-${key}`} className={LABEL}>{label}</label>
          <input id={`vip-${key}`} type={type} inputMode={mode} autoComplete={auto} placeholder={placeholder}
            value={lead[key]} onChange={(e) => change(key, e.target.value)} className={INPUT}
            aria-invalid={errors[key] ? true : undefined} aria-describedby={errors[key] ? `vip-${key}-err` : undefined} />
          {errors[key] ? <p id={`vip-${key}-err`} className="text-[#ef4444] text-xs mt-1">{errors[key]}</p> : null}
        </div>
      ))}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={lead.website}
        onChange={(e) => change("website", e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <button type="submit" disabled={sending} className={PRIMARY}>{sending ? "SEGURA AÍ…" : "QUERO CHEGAR PRIMEIRO"}</button>
      {serverError ? <p role="alert" className="text-[#ef4444] text-sm text-center">{serverError}</p> : null}
    </form>
  );
}
