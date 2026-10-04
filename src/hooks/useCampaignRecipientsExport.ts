import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type RecipientRow = Database["public"]["Functions"]["get_email_campaign_recipients"]["Returns"][number];

export type Segment = "all" | "opened" | "clicked" | "purchased" | "not_opened" | "opened_not_clicked" | "unsubscribed" | "bounced";

export const SEGMENTS: { value: Segment; label: string; hint: string }[] = [
  { value: "opened", label: "Quem abriu", hint: "Pessoas que abriram o e-mail pelo menos uma vez." },
  { value: "clicked", label: "Quem clicou", hint: "Pessoas que clicaram em algum link." },
  { value: "purchased", label: "Quem comprou", hint: "Pessoas com pedido atribuído a esta campanha." },
  { value: "opened_not_clicked", label: "Abriu e não clicou", hint: "Boa lista para um reenvio com outro assunto ou oferta." },
  { value: "not_opened", label: "Não abriu", hint: "Quem recebeu e não abriu. Aberturas são aproximadas (Apple Mail, Gmail)." },
  { value: "all", label: "Todos os destinatários", hint: "Todos os que receberam (sem erro de entrega)." },
  { value: "unsubscribed", label: "Descadastrou", hint: "Pessoas que pediram para sair da lista." },
  { value: "bounced", label: "Falha de entrega", hint: "Endereços que falharam, deram bounce ou reclamaram." },
];

export const RECIPIENT_HEADERS = ["E-mail", "Nome", "Enviado em", "Aberturas", "Última abertura", "Cliques", "Último clique", "Pedidos", "Receita (R$)", "Descadastrou", "Falha de entrega"];

const PAGE = 1000; // limite do PostgREST por requisição

/** Busca o segmento inteiro, página a página. */
export async function fetchCampaignRecipients(tenantId: string, campaignId: string, segment: Segment): Promise<RecipientRow[]> {
  const all: RecipientRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc("get_email_campaign_recipients", { p_tenant_id: tenantId, p_campaign_id: campaignId, p_segment: segment })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

const date = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "");
// planilhas executam células que começam com = + - @ (injeção de fórmula): prefixa com apóstrofo
const safe = (v: string | null) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v ?? "");

export function recipientsToRows(rows: RecipientRow[]) {
  return rows.map((r) => [
    safe(r.email), safe(r.name), date(r.sent_at),
    r.opens, date(r.last_open_at), r.clicks, date(r.last_click_at),
    r.orders, r.revenue.toFixed(2).replace(".", ","),
    r.unsubscribed ? "Sim" : "Não", r.bounced ? "Sim" : "Não",
  ]);
}
