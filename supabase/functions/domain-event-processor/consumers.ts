import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;

export interface DomainEvent {
  id: string; tenant_id: string; event_type: string; ref_id: string;
  payload: { order_number?: string; status_name?: string | null; prev_status_name?: string | null; is_new?: boolean; integration_id?: string | null };
  created_at: string; attempts: number;
}

/** Resultado de um consumidor: 'done' (agiu) ou 'skipped' (nao se aplica, com o motivo). Erro = lancar excecao (o evento volta para a fila). */
export interface Outcome { status: "done" | "skipped"; detail?: string }

export interface LiOrderRow {
  id: string; order_number: string; status_name: string | null; integration_id: string | null; tenant_id: string;
  created_at_remote: string | null; totals_json: { total?: number | null; subtotal?: number | null; discount?: number | null; shipping?: number | null } | null; raw_json: Record<string, unknown> | null;
}

export async function loadOrder(supabase: Supabase, ev: DomainEvent): Promise<LiOrderRow | null> {
  const { data } = await supabase.from("li_orders")
    .select("id, order_number, status_name, integration_id, tenant_id, created_at_remote, totals_json, raw_json")
    .eq("id", ev.ref_id).maybeSingle();
  return (data as LiOrderRow | null) ?? null;
}

/** Consumidores por loja (rodam uma vez por loja em cada lote, nao uma vez por evento): quem comprou sai dos fluxos de recuperacao e a atribuicao das campanhas atualiza na hora. */
export async function recoveryConsumer(supabase: Supabase): Promise<void> {
  const { error } = await supabase.rpc("refresh_abandonment_recovery");
  if (error) throw new Error(`recuperacao: ${error.message}`);
}

export async function attributionConsumer(supabase: Supabase, tenantId: string): Promise<void> {
  const { error } = await supabase.rpc("refresh_email_campaign_attribution", { p_tenant_id: tenantId });
  if (error) throw new Error(`atribuicao: ${error.message}`);
}
