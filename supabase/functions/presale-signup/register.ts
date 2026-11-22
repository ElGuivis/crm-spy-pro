// Modo "register" (cadastro completo: CPF, nascimento, endereço) -> cria/acha o cliente na Loja Integrada.
// Hoje nenhuma página usa este modo; fica para a página de cadastro enviada no atendimento.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { validatePresale } from "./validate.ts";
import { upsertLiCustomer } from "./li-customer.ts";
import type { Reply } from "./group.ts";

type Supabase = SupabaseClient;
export interface RegisterPage { id: string; tenant_id: string; integration_id: string | null; whatsapp_group_url: string; li_group_id: number | null }

export async function handleRegister(sb: Supabase, page: RegisterPage, body: unknown): Promise<Reply> {
  const v = validatePresale(body);
  if (!v.ok) return { status: 400, body: { error: "invalid", field: v.field, message: v.message } };
  const input = v.data;

  const row = {
    page_id: page.id, tenant_id: page.tenant_id, name: input.name, email: input.email, cpf: input.cpf,
    phone: input.phone, birth_date: input.birthDate, address: input.address, accepts_newsletter: input.acceptsNewsletter,
  };
  const done: Reply = { status: 200, body: { ok: true, groupUrl: page.whatsapp_group_url } };
  const { data: prev } = await sb.from("presale_signups")
    .select("id, li_status, attempts").eq("page_id", page.id).eq("email", input.email).maybeSingle();

  let signupId: string;
  if (prev) {
    signupId = prev.id;
    await sb.from("presale_signups").update({ ...row, attempts: prev.attempts + 1, updated_at: new Date().toISOString() }).eq("id", prev.id);
    if (prev.li_status === "created" || prev.li_status === "existing") return done; // já está na loja
  } else {
    const { data: ins, error } = await sb.from("presale_signups").insert(row).select("id").single();
    if (error || !ins) {
      console.error("[presale-signup] insert", error?.message);
      return { status: 500, body: { error: "server", message: "Não rolou salvar agora. Tenta de novo." } };
    }
    signupId = ins.id;
  }

  const { data: integ } = page.integration_id
    ? await sb.from("integrations").select("api_key").eq("id", page.integration_id).eq("status", "connected").maybeSingle()
    : { data: null };
  const li = integ?.api_key
    ? await upsertLiCustomer(integ.api_key, input, page.li_group_id)
    : { status: "failed" as const, error: "integração da loja desconectada" };

  await sb.from("presale_signups").update({
    li_status: li.status,
    li_customer_id: li.status === "failed" ? null : li.customerId,
    li_error: li.status === "failed" ? li.error : null,
    updated_at: new Date().toISOString(),
  }).eq("id", signupId);
  if (li.status === "failed") console.error("[presale-signup] loja", page.id, li.error);
  return done;
}
