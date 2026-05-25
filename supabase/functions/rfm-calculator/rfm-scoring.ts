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
