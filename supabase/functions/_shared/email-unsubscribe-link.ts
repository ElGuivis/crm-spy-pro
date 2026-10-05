// Link de descadastro para e-mails automáticos que não passam pelo motor de campanhas (aniversário, cashback, lembrete de cashback).
// O descadastro (email-unsubscribe) guarda o token e o registro numa campanha; aqui cada tenant tem, sob demanda, uma campanha de
// sistema por tipo (email_campaigns.flow_kind = 'system', arquivada e nunca enviada). Quem clicar entra na lista de supressão como
// em qualquer campanha (e os outros módulos passam a respeitar).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { listUnsubscribeHeaders } from "./email-prepare.ts";

type Supabase = ReturnType<typeof createClient>;
export type SystemEmailKind = "birthday" | "cashback" | "cashback_reminder";

const LABEL: Record<SystemEmailKind, string> = { birthday: "Aniversário", cashback: "Cashback", cashback_reminder: "Lembrete de cashback" };

export interface UnsubscribeLink { url: string; textFooter: string; htmlFooter: string; headers: Record<string, string> }

async function systemCampaignId(supabase: Supabase, tenantId: string, kind: SystemEmailKind): Promise<string | null> {
  const { data: found } = await supabase.from("email_campaigns").select("id").eq("tenant_id", tenantId).eq("flow_kind", "system").eq("flow_step", kind).limit(1).maybeSingle();
  if (found?.id) return found.id as string;
  const { data, error } = await supabase.from("email_campaigns").insert({
    tenant_id: tenantId, internal_name: `Sistema · ${LABEL[kind]}`, subject: LABEL[kind], sender_name: "Sistema", sender_email: "sistema@invalid.local",
    campaign_type: "automation", status: "draft", flow_kind: "system", flow_step: kind, is_archived: true,
  }).select("id").single();
  if (error) {
    const { data: again } = await supabase.from("email_campaigns").select("id").eq("tenant_id", tenantId).eq("flow_kind", "system").eq("flow_step", kind).limit(1).maybeSingle();
    return (again?.id as string | undefined) ?? null; // outra execução pode ter criado ao mesmo tempo
  }
  return data.id as string;
}

/** Cria (ou reaproveita) o token de descadastro da pessoa para este tipo de e-mail e monta o rodapé e os cabeçalhos. null = não foi possível. */
export async function unsubscribeFor(supabase: Supabase, supabaseUrl: string, tenantId: string, kind: SystemEmailKind, email: string, name?: string | null): Promise<UnsubscribeLink | null> {
  const to = email.trim().toLowerCase();
  const campaignId = await systemCampaignId(supabase, tenantId, kind);
  if (!campaignId || !to) return null;
  await supabase.from("email_unsubscribe_tokens").upsert(
    { tenant_id: tenantId, campaign_id: campaignId, recipient_email: to, recipient_name: name ?? null },
    { onConflict: "campaign_id,recipient_email", ignoreDuplicates: true },
  );
  const { data: row } = await supabase.from("email_unsubscribe_tokens").select("id").eq("campaign_id", campaignId).eq("recipient_email", to).maybeSingle();
  if (!row?.id) return null;
  const url = `${supabaseUrl}/functions/v1/email-unsubscribe?token=${row.id}`;
  return {
    url,
    textFooter: `\n\n--\nNão quer mais receber nossos e-mails? Cancele a inscrição: ${url}`,
    htmlFooter: `<p style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888;text-align:center;">Não quer mais receber nossos e-mails? <a href="${url}" style="color:#888888;">Cancelar inscrição</a></p>`,
    headers: listUnsubscribeHeaders(url),
  };
}

/** Coloca o rodapé HTML antes de </body> (ou no fim, se o HTML for um trecho). */
export function withHtmlFooter(html: string, footer: string): string {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : `${html}${footer}`;
}
