export function scoreRecency(recencyDays: number): number {
  if (recencyDays <= 30) return 5
  if (recencyDays <= 60) return 4
  if (recencyDays <= 120) return 3
  if (recencyDays <= 240) return 2
  return 1
}

export function scoreFrequency(ordersCount: number): number {
  if (ordersCount >= 10) return 5
  if (ordersCount >= 5) return 4
  if (ordersCount >= 3) return 3
  if (ordersCount >= 2) return 2
  return 1
}

export function scoreMonetary(revenueTotal: number): number {
  if (revenueTotal >= 2000) return 5
  if (revenueTotal >= 1000) return 4
  if (revenueTotal >= 500) return 3
  if (revenueTotal >= 200) return 2
  return 1
}

// Classic RFM 5×5 grid — matches frontend segmentGrid exactly
const segmentGrid: Record<number, Record<number, { name: string; action: string }>> = {
  5: {
    1: { name: 'Não Perder',        action: 'Contato humano urgente, oferta exclusiva' },
    2: { name: 'Em Risco',          action: 'Campanha de reativação + oferta personalizada' },
    3: { name: 'Fiéis',             action: 'Programa de fidelidade, combo, assinatura' },
    4: { name: 'Campeões',          action: 'VIP, upsell premium, atendimento prioritário' },
    5: { name: 'Campeões',          action: 'VIP, upsell premium, atendimento prioritário' },
  },
  4: {
    1: { name: 'Em Risco',          action: 'Campanha de reativação + oferta personalizada' },
    2: { name: 'Precisam Atenção',  action: 'Oferta direcionada para reengajar' },
    3: { name: 'Precisam Atenção',  action: 'Oferta direcionada para reengajar' },
    4: { name: 'Campeões',          action: 'VIP, upsell premium, atendimento prioritário' },
    5: { name: 'Campeões',          action: 'VIP, upsell premium, atendimento prioritário' },
  },
  3: {
    1: { name: 'Hibernando',        action: 'Win-back com cupom, remarketing' },
    2: { name: 'Precisam Atenção',  action: 'Oferta direcionada para reengajar' },
    3: { name: 'Potenciais Fiéis',  action: 'Incentivar recorrência, programa fidelidade' },
    4: { name: 'Potenciais Fiéis',  action: 'Incentivar recorrência, programa fidelidade' },
    5: { name: 'Fiéis',             action: 'Programa de fidelidade, combo, assinatura' },
  },
  2: {
    1: { name: 'Hibernando',        action: 'Win-back com cupom, remarketing' },
    2: { name: 'Prestes a Dormir',  action: 'Lembrete de recompra, oferta relâmpago' },
    3: { name: 'Prestes a Dormir',  action: 'Lembrete de recompra, oferta relâmpago' },
    4: { name: 'Promissores',       action: 'Empurrar recorrência de compra' },
    5: { name: 'Promissores',       action: 'Empurrar recorrência de compra' },
  },
  1: {
    1: { name: 'Perdidos',          action: 'Win-back barato ou desistir' },
    2: { name: 'Hibernando',        action: 'Win-back com cupom, remarketing' },
    3: { name: 'Prestes a Dormir',  action: 'Lembrete de recompra, oferta relâmpago' },
    4: { name: 'Novos Clientes',    action: 'Incentivar 2ª compra com cupom' },
    5: { name: 'Novos Clientes',    action: 'Incentivar 2ª compra com cupom' },
  },
}

export function determineSegment(r: number, f: number, _m: number): { name: string; action: string } {
  return segmentGrid[f]?.[r] || { name: 'Outros', action: 'Monitorar e engajar' }
}

export function determineChurnRisk(recencyDays: number, avgInterval: number | null): string {
  if (!avgInterval || avgInterval <= 0) return 'saudavel'
  if (recencyDays <= avgInterval) return 'saudavel'
  if (recencyDays <= avgInterval * 1.5) return 'atencao'
  if (recencyDays <= avgInterval * 2) return 'risco'
  return 'critico'
}

export interface RepurchasePrediction {
  predicted_next_purchase_date: string | null
  purchase_probability_7d: number | null
  purchase_probability_15d: number | null
  purchase_probability_30d: number | null
  ideal_offer_window_start: number | null
  ideal_offer_window_end: number | null
}

const NO_PREDICTION: RepurchasePrediction = {
  predicted_next_purchase_date: null, purchase_probability_7d: null, purchase_probability_15d: null,
  purchase_probability_30d: null, ideal_offer_window_start: null, ideal_offer_window_end: null,
}

/** Função de distribuição da normal padrão (aproximação de Abramowitz-Stegun, erro < 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp(-z * z / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

/**
 * Chance de recompra nas próximas 7/15/30 dias, condicionada a quem ainda não comprou desde a última
 * vez: P(comprar em [r, r+W] | intervalo > r), com o intervalo entre compras ~ Normal(média, desvio).
 * Cliente já considerado perdido (recência > 2,5x o intervalo, a mesma regra do churn) não tem
 * previsão; antes a curva só crescia com o atraso e dava 99% para quem sumiu há anos.
 */
export function predictRepurchase(
  lastOrderDate: Date, recencyDays: number, avgInterval: number, stdDevInterval: number | null, now: Date,
): RepurchasePrediction {
  if (!(avgInterval > 0)) return NO_PREDICTION
  if (recencyDays > avgInterval * 2.5) return NO_PREDICTION

  const sigma = Math.max(stdDevInterval || avgInterval * 0.3, 1)
  const cdf = (days: number) => normalCdf((days - avgInterval) / sigma)
  const survival = Math.max(1 - cdf(recencyDays), 0.05)
  const alive = 1 - Math.min(1, recencyDays / (avgInterval * 2.5))
  const prob = (windowDays: number): number => {
    const conditional = Math.min(1, Math.max(0, (cdf(recencyDays + windowDays) - cdf(recencyDays)) / survival))
    return Math.round(Math.min(99, Math.max(1, conditional * alive * 100)) * 10) / 10
  }

  const predictedDate = new Date(lastOrderDate.getTime() + avgInterval * 86400000)
  const daysUntilPredicted = Math.max(0, Math.floor((predictedDate.getTime() - now.getTime()) / 86400000))
  const buffer = Math.round(sigma || avgInterval * 0.2)
  return {
    predicted_next_purchase_date: predictedDate.toISOString().split('T')[0],
    purchase_probability_7d: prob(7),
    purchase_probability_15d: prob(15),
    purchase_probability_30d: prob(30),
    ideal_offer_window_start: Math.max(0, daysUntilPredicted - Math.round(buffer * 0.5)),
    ideal_offer_window_end: daysUntilPredicted + buffer,
  }
}
