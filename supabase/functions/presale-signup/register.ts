// Modo "register" (/cadastro/<slug>): cadastro completo (CPF, nascimento, endereço) -> contato no Bling.
// Link mandado no atendimento do WhatsApp para a loja lançar a venda no nome da pessoa.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { validatePresale } from "./validate.ts";
import { upsertBlingContact } from "./bling-contact.ts";
import type { Reply } from "./group.ts";

export interface RegisterPage { id: string; tenant_id: string }

export async function handleRegister(sb: SupabaseClient, page: RegisterPage, body: unknown): Promise<Reply> {
  const v = validatePresale(body);
  if (!v.ok) return { status: 400, body: { error: "invalid", field: v.field, message: v.message } };
  const input = v.data;

  const row = {
    page_id: page.id, tenant_id: page.tenant_id, name: input.name, email: input.email, cpf: input.cpf,
    phone: input.phone, birth_date: input.birthDate, address: input.address, li_status: "skipped",
  };
  const done: Reply = { status: 200, body: { ok: true } };
  const { data: prev } = await sb.from("presale_signups")
    .select("id, bling_status, attempts").eq("page_id", page.id).eq("email", input.email).maybeSingle();

  let signupId: string;
  if (prev) {
    signupId = prev.id;
    await sb.from("presale_signups").update({ ...row, attempts: prev.attempts + 1, updated_at: new Date().toISOString() }).eq("id", prev.id);
    if (prev.bling_status === "created" || prev.bling_status === "existing") return done; // já está no Bling
  } else {
    const { data: ins, error } = await sb.from("presale_signups").insert(row).select("id").single();
    if (error || !ins) {
      console.error("[presale-signup] insert", error?.message);
      return { status: 500, body: { error: "server", message: "Não rolou salvar agora. Tenta de novo." } };
    }
    signupId = ins.id;
  }

  const bling = await upsertBlingContact(sb, page.tenant_id, input);
  await sb.from("presale_signups").update({
    bling_status: bling.status,
    bling_contact_id: bling.status === "failed" ? null : bling.contactId,
    bling_error: bling.status === "failed" ? bling.error : null,
    updated_at: new Date().toISOString(),
  }).eq("id", signupId);
  // se o Bling falhar, o cadastro fica salvo aqui (a loja vê o erro e lança à mão); a pessoa não precisa refazer
  if (bling.status === "failed") console.error("[presale-signup] bling", page.id, bling.error);
  return done;
}
