// Vários números por campanha: escolhe o número da vez (revezamento), pulando o que está desconectado
// ou já bateu o limite do dia. `bulk_campaigns.last_integration_id` = último número tentado (revezamento);
// cada envio grava `campaign_contacts.sent_integration_id` (limite diário POR NÚMERO). Migration 20261126000001.
import { getInstanceState } from "./evolution-guard.ts";
import { checkDailyLimit } from "./pacing.ts";
// deno-lint-ignore no-explicit-any
type Client = any;

export interface CampaignNumbers {
  id: string;
  whatsapp_integration_id: string | null;
  whatsapp_integration_ids: string[] | null;
  last_integration_id: string | null;
  daily_limit: number | null;
  daily_limit_step: number | null;
}

export interface Picked { id: string; name: string; instanceName: string }

export type PickResult =
  | { ok: true; number: Picked; note: string | null; total: number; available: number }
  | { ok: false; wait: "daily" | "unreachable" | "pause"; reason: string };

export function campaignNumberIds(c: CampaignNumbers): string[] {
  const ids = (c.whatsapp_integration_ids ?? []).filter(Boolean);
  if (ids.length === 0 && c.whatsapp_integration_id) ids.push(c.whatsapp_integration_id);
  return [...new Set(ids)];
}

/** Ordem de tentativa: começa no número seguinte ao último que enviou. */
export function rotationOrder(ids: string[], lastUsed: string | null): string[] {
  const i = lastUsed ? ids.indexOf(lastUsed) : -1;
  return i < 0 ? ids : [...ids.slice(i + 1), ...ids.slice(0, i + 1)];
}

const list = (names: string[]) => names.join(", ");

/** Cada número disponível a mais acelera a fila em +50% (1 → 1x, 2 → 1,5x, 3 → 2x).
 *  Linear de propósito: cada número nunca envia mais rápido que o intervalo configurado. */
export const SPEEDUP_PER_EXTRA_NUMBER = 0.5;
export function speedFactor(available: number): number {
  return 1 + SPEEDUP_PER_EXTRA_NUMBER * Math.max(0, Math.floor(available) - 1);
}

export async function pickNumber(
  supabase: Client, baseUrl: string, apiKey: string, campaign: CampaignNumbers,
): Promise<PickResult> {
  const ids = campaignNumberIds(campaign);
  if (ids.length === 0) return { ok: false, wait: "pause", reason: "Nenhum número de WhatsApp escolhido. Edite a campanha e escolha ao menos um." };

  const { data: rows } = await supabase.from("integrations").select("id, name, metadata").in("id", ids);
  const byId = new Map<string, { name: string; instanceName?: string }>(
    (rows ?? []).map((r: { id: string; name: string | null; metadata: Record<string, string> | null }) =>
      [r.id, { name: r.name || r.metadata?.instanceName || "WhatsApp", instanceName: r.metadata?.instanceName }]),
  );

  const down: string[] = [], unreachable: string[] = [], limited: string[] = [];
  let chosen: Picked | null = null;
  let available = 0; // números prontos para enviar agora (base da velocidade da fila)
  for (const id of rotationOrder(ids, campaign.last_integration_id)) {
    const info = byId.get(id);
    if (!info?.instanceName) { down.push(info?.name ?? "número removido"); continue; }
    const state = await getInstanceState(baseUrl, apiKey, info.instanceName);
    if (state === "close" || state === "connecting") { down.push(info.name); continue; }
    if (state === "unknown") { unreachable.push(info.name); continue; }
    const daily = await checkDailyLimit(supabase, campaign.id, id, campaign.daily_limit, campaign.daily_limit_step);
    if (!daily.allowed) { limited.push(`${info.name} ${daily.sentToday}/${daily.limit}`); continue; }
    available++;
    if (!chosen) chosen = { id, name: info.name, instanceName: info.instanceName };
  }

  if (chosen) {
    await supabase.from("bulk_campaigns").update({ last_integration_id: chosen.id }).eq("id", campaign.id);
    const notes = [
      down.length ? `Desconectado: ${list(down)}.` : "",
      limited.length ? `Limite do dia: ${list(limited)}.` : "",
    ].filter(Boolean);
    return {
      ok: true, number: chosen, total: ids.length, available,
      note: notes.length ? `${notes.join(" ")} Enviando pelos outros números.` : null,
    };
  }

  if (unreachable.length) return { ok: false, wait: "unreachable", reason: "" };
  if (limited.length) {
    const extra = down.length ? ` Desconectado: ${list(down)}.` : "";
    return { ok: false, wait: "daily", reason: `Limite do dia atingido (${list(limited)}). Continua amanhã sozinho.${extra}` };
  }
  return {
    ok: false, wait: "pause",
    reason: ids.length > 1
      ? `Todos os números estão desconectados ou restritos (${list(down)}). Reconecte em Canais e retome a campanha.`
      : "",
  };
}
