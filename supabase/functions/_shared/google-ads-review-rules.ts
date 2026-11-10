/**
 * Revisor de propostas (regras puras, sem IA, sem rede). Roda sobre TODAS as propostas abertas, de qualquer agente,
 * e bloqueia as que se contradizem, mudam pouco, nao tem dados suficientes ou duplicam uma campanha ja ligada.
 * Bloqueada nao e apagada: fica com o motivo e volta sozinha se a situacao mudar.
 */

export const REVIEW = {
  minChangePct: 0.10,       // ajuste de verba menor que 10% e ruido
  minChangeBrl: 3,          // ... ou menor que R$ 3 por dia
  minDaysForBudget: 7,      // so mexe em verba com pelo menos 7 dias de gasto nos ultimos 14
} as const;

export interface OpenRec { id: string; kind: string; payload: { campaign_id?: number; daily_budget_micros?: number | null } }
export interface CampInfo { campaign_id: number; name: string; status: string; daily_budget_micros: number | null; days_with_spend_14d: number }
export interface Blocked { id: string; reason: string }

const BUDGET_KINDS = ["adjust_budget", "enable_campaign", "pause_campaign"];

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** "[PESQUISA] - CHRONIC BRAND #2" e "[PESQUISA] - CHRONIC BRAND" tem o mesmo "miolo": uma e copia da outra. */
export const stem = (name: string) => plain(name).replace(/#\s*\d+/g, "").replace(/\s+/g, " ").trim();

export function reviewProposals(recs: OpenRec[], camps: CampInfo[]): Blocked[] {
  const byId = new Map(camps.map((c) => [c.campaign_id, c]));
  const cidOf = (r: OpenRec) => Number(r.payload.campaign_id);
  const withRebuild = new Set(recs.filter((r) => r.kind === "rebuild_search_structure").map(cidOf));
  const withPause = new Set(recs.filter((r) => r.kind === "pause_campaign").map(cidOf));
  const enabledStems = new Map(camps.filter((c) => c.status === "ENABLED").map((c) => [stem(c.name), c]));
  const blocked: Blocked[] = [];
  const block = (r: OpenRec, reason: string) => blocked.push({ id: r.id, reason });

  for (const r of recs) {
    if (!BUDGET_KINDS.includes(r.kind)) continue;
    const cid = cidOf(r);
    const camp = byId.get(cid);
    if (!camp) continue;

    // 1) Conflito: a campanha vai ser reconstruida, entao pausar/ajustar/religar agora e contraditorio.
    if (withRebuild.has(cid)) { block(r, "Conflita com a proposta de reconstruir esta mesma campanha: decida a reconstrucao primeiro."); continue; }
    // 2) Pausar e ajustar verba da mesma campanha: vale o pausar.
    if (r.kind === "adjust_budget" && withPause.has(cid)) { block(r, "A mesma campanha tem uma proposta de pausar: ajustar a verba nao faz sentido."); continue; }

    if (r.kind === "adjust_budget") {
      const next = r.payload.daily_budget_micros, cur = camp.daily_budget_micros;
      if (next != null && cur != null && cur > 0) {
        const diffBrl = Math.abs(next - cur) / 1e6;
        if (Math.abs(next - cur) / cur < REVIEW.minChangePct || diffBrl < REVIEW.minChangeBrl) {
          block(r, `Mudanca pequena demais (${diffBrl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por dia): vira ruido e pode atrapalhar o aprendizado do Google.`);
          continue;
        }
      }
      if (camp.days_with_spend_14d < REVIEW.minDaysForBudget) {
        block(r, `Poucos dados recentes (${camp.days_with_spend_14d} de ${REVIEW.minDaysForBudget} dias com gasto nos ultimos 14): espere antes de mexer na verba.`);
        continue;
      }
    }

    // 3) Religar uma copia de campanha que ja esta ligada: voce competiria contra voce mesmo.
    if (r.kind === "enable_campaign") {
      const twin = enabledStems.get(stem(camp.name));
      if (twin && twin.campaign_id !== cid) block(r, `Duplica a campanha ja ligada "${twin.name}": as duas disputariam os mesmos leiloes.`);
    }
  }
  return blocked;
}
