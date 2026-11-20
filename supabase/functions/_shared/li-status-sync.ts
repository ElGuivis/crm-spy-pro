import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
import { liAuthHeader } from "./li-auth.ts";
import { processOrderNotificationsInJob } from "./order-notifications.ts";
const log = createLogger("li-status-sync", "shared");


const LI_API_BASE = "https://api.awsli.com.br/v1";

const ME_TO_LI_STATUS: Record<string, { codigo: string; status_name: string }> = {
  posted: {
    codigo: "pedido_enviado",
    status_name: "Pedido Enviado",
  },
  delivered: {
    codigo: "pedido_entregue",
    status_name: "Pedido Entregue",
  },
};

async function notifyStatusChange(
  supabase: ReturnType<typeof createClient>, order: Record<string, unknown>, statusName: string, tenantId: string, integrationId: string,
): Promise<void> {
  const raw = (order.raw_json || {}) as { cliente?: Record<string, string>; codigo_rastreio?: string; url_rastreio?: string };
  const cliente = raw.cliente || {};
  await processOrderNotificationsInJob(
    supabase, { id: order.loja_integrada_order_id, cliente },
    {
      ...order,
      numero: order.order_number,
      cliente_nome: cliente.nome || "Cliente",
      cliente_telefone: cliente.telefone_celular || cliente.telefone_principal || "",
      cliente_email: cliente.email || "",
      codigo_rastreio: raw.codigo_rastreio || "",
      url_rastreio: raw.url_rastreio || "",
      valor_total: (order.totals_json as { total?: number } | null)?.total || 0,
      li_id: order.loja_integrada_order_id,
    },
    statusName, tenantId, integrationId, { statusChange: true },
  );
}

const MAX_RETRIES = 2;
const RATE_LIMIT_PAUSE_MS = 60000;

interface SyncResult {
  success: boolean;
  error?: string;
  order_number?: string;
  new_status?: string;
}

export async function syncStatusToLojaIntegrada(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  meStatus: string,
  liOrderId?: string | null,
  orderNumber?: string | null
): Promise<SyncResult> {
  const mapping = ME_TO_LI_STATUS[meStatus];
  if (!mapping) {
    return { success: false, error: `Status "${meStatus}" não requer propagação para LI` };
  }

  let liOrderNumero = orderNumber;
  if (liOrderId) {
    const { data: liOrder } = await supabase
      .from("li_orders")
      .select("order_number")
      .eq("id", liOrderId)
      .maybeSingle();

    if (liOrder?.order_number) {
      liOrderNumero = String(liOrder.order_number);
    }
  }

  if (!liOrderNumero) {
    return { success: false, error: "Sem número de pedido LI para propagar status" };
  }

  const { data: liIntegration } = await supabase
    .from("integrations")
    .select("id, api_key")
    .eq("tenant_id", tenantId)
    .eq("type", "loja_integrada")
    .in("status", ["active", "connected"])
    .maybeSingle();

  if (!liIntegration?.api_key) {
    return { success: false, error: "Integração LI não encontrada ou sem api_key" };
  }

  const authHeader = liAuthHeader(liIntegration.api_key);

  try {
    log.info(`[li-status-sync] Atualizando pedido ${liOrderNumero} para "${mapping.status_name}" na LI`);

    let response: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      response = await fetch(`${LI_API_BASE}/situacao/pedido/${liOrderNumero}/`, {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ codigo: mapping.codigo }),
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        log.warn(`[li-status-sync] 429 rate limit para pedido ${liOrderNumero}, pausando ${RATE_LIMIT_PAUSE_MS / 1000}s (tentativa ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, RATE_LIMIT_PAUSE_MS));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : "No response";
      const status = response?.status || 0;
      log.error(`[li-status-sync] Erro API LI (${status}): ${errorText.substring(0, 200)}`);
      return {
        success: false,
        error: `API LI retornou ${status}: ${errorText.substring(0, 100)}`,
        order_number: liOrderNumero,
      };
    }

    log.info(`[li-status-sync] Pedido ${liOrderNumero} atualizado na LI para "${mapping.status_name}"`);

    const orderQuery = supabase.from("li_orders")
      .select("id, order_number, status_name, integration_id, loja_integrada_order_id, created_at_remote, totals_json, shipping_json, raw_json");
    const { data: before } = await (liOrderId
      ? orderQuery.eq("id", liOrderId)
      : orderQuery.eq("tenant_id", tenantId).eq("order_number", liOrderNumero)).maybeSingle();

    if (before?.id) {
      await supabase
        .from("li_orders")
        .update({ status_name: mapping.status_name, updated_at_local: new Date().toISOString() })
        .eq("id", before.id);
      // Aviso ao cliente: como o status local já fica igual ao da loja, o polling não vê mudança de nome
      // (só pelo status_id, e pedido encerrado é conferido 1x por dia). A reserva em order_notification_executions evita duplicar.
      if (before.status_name !== mapping.status_name) {
        await notifyStatusChange(supabase, before as Record<string, unknown>, mapping.status_name, tenantId, String(before.integration_id || liIntegration.id));
      }
    }

    return {
      success: true,
      order_number: liOrderNumero,
      new_status: mapping.status_name,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
    log.error(`[li-status-sync] Exceção ao atualizar LI:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
      order_number: liOrderNumero,
    };
  }
}
