// Modo "grupo" (página do grupo VIP): formulário curto igual ao da página antiga.
//   action "lead":  { name, phone, email }                 -> grava, manda pra planilha, devolve { id, groupUrl }
//   action "sizes": { id, shirtSize, pantsSize, shoeSize } -> grava os tamanhos e manda de novo pra planilha (só se preencheu algum)
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { formatBrPhone, normalizeBrPhone } from "./validate.ts";
import { sendToSheet } from "./sheet.ts";
import { sendLeadToMeta, type RequestInfo } from "./meta.ts";

type Supabase = SupabaseClient;
export interface GroupPage {
  id: string; tenant_id: string; whatsapp_group_url: string; sheet_url: string | null;
  meta_pixel_id: string | null; meta_capi_token_encrypted: string | null; meta_test_event_code: string | null;
}
export type Reply = { status: number; body: Record<string, unknown> };

export const SHIRT_SIZES = ["PP", "P", "M", "G", "GG", "XGG"];
export const PANTS_SIZES = ["36", "38", "40", "42", "44", "46", "48", "50"];
export const SHOE_SIZES = ["34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44"];

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const invalid = (field: string, message: string): Reply => ({ status: 400, body: { error: "invalid", field, message } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function markSheet(sb: Supabase, id: string, r: { ok: boolean; error?: string }) {
  await sb.from("presale_signups").update({
    sheet_status: r.ok ? "sent" : "failed",
    sheet_error: r.ok ? null : r.error ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (!r.ok) console.error("[presale-signup] planilha", id, r.error);
}

export async function handleGroupLead(sb: Supabase, page: GroupPage, b: Record<string, unknown>, req: RequestInfo): Promise<Reply> {
  const name = s(b.name, 120);
  if (name.length < 2) return invalid("name", "Bota teu nome aí");
  const phone = normalizeBrPhone(s(b.phone, 30));
  if (!phone) return invalid("phone", "Número inválido, confere aí");
  const email = s(b.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return invalid("email", "E-mail inválido, confere aí");

  const row = { page_id: page.id, tenant_id: page.tenant_id, name, phone, email, li_status: "skipped" };
  const { data, error } = await sb.from("presale_signups")
    .upsert(row, { onConflict: "page_id,email" }).select("id").single();
  if (error || !data) {
    console.error("[presale-signup] grupo insert", error?.message);
    return { status: 500, body: { error: "server", message: "Não rolou salvar agora. Tenta de novo." } };
  }

  // API de Conversões: em segundo plano (não atrasa a pessoa), mesmo event_id do navegador
  sendLeadToMeta(sb, page, { signupId: data.id, name, phone, email }, b.meta, req);

  if (page.sheet_url) {
    const r = await sendToSheet(page.sheet_url, { name, phone: formatBrPhone(phone), email, shirtSize: "", pantsSize: "", shoeSize: "" });
    await markSheet(sb, data.id, r);
  }
  return { status: 200, body: { ok: true, id: data.id, groupUrl: page.whatsapp_group_url } };
}

export async function handleGroupSizes(sb: Supabase, page: GroupPage, b: Record<string, unknown>): Promise<Reply> {
  const id = s(b.id, 40);
  if (!UUID.test(id)) return invalid("form", "Cadastro não encontrado");
  const pick = (v: unknown, list: string[]) => { const x = s(v, 4).toUpperCase(); return list.includes(x) ? x : ""; };
  const sizes = { shirtSize: pick(b.shirtSize, SHIRT_SIZES), pantsSize: pick(b.pantsSize, PANTS_SIZES), shoeSize: pick(b.shoeSize, SHOE_SIZES) };

  const { data: lead } = await sb.from("presale_signups").select("id, name, phone, email")
    .eq("id", id).eq("page_id", page.id).maybeSingle();
  if (!lead) return invalid("form", "Cadastro não encontrado");

  const done = { status: 200, body: { ok: true, groupUrl: page.whatsapp_group_url } };
  if (!sizes.shirtSize && !sizes.pantsSize && !sizes.shoeSize) return done; // pulou: nada a mandar

  await sb.from("presale_signups").update({
    shirt_size: sizes.shirtSize || null, pants_size: sizes.pantsSize || null, shoe_size: sizes.shoeSize || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (page.sheet_url) {
    const r = await sendToSheet(page.sheet_url, { name: lead.name, phone: formatBrPhone(lead.phone), email: lead.email, ...sizes });
    await markSheet(sb, id, r);
  }
  return done;
}
