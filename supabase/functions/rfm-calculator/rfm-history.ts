import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
type ServiceClient = ReturnType<typeof createClient>;

type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export interface ExistingState {
  segments: Map<string, string>   // customer_id -> segmento antes deste cálculo
  prevDate: string | null         // data do último cálculo gravado
}

/** Situação atual guardada (antes do upsert): serve para detectar mudança de segmento. */
export async function loadExistingState(supabase: ServiceClient, integrationId: string): Promise<ExistingState> {
  const segments = new Map<string, string>()
  let prevDate: string | null = null
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('customer_rfm_snapshots')
      .select('customer_id, segment_name, reference_date')
      .eq('integration_id', integrationId)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data as { customer_id: string; segment_name: string | null; reference_date: string }[]) {
      segments.set(row.customer_id, row.segment_name || 'Outros')
      if (!prevDate || row.reference_date > prevDate) prevDate = row.reference_date
    }
    if (data.length < pageSize) break
  }
  return { segments, prevDate }
}

type RecordLike = { customer_id: string; segment_name: string; orders_count: number; revenue_total: number }

/** Grava o histórico leve do dia (contagem por segmento) e as mudanças de segmento. */
export async function recordHistory(
  supabase: ServiceClient,
  opts: { tenantId: string; integrationId: string; referenceDate: string; records: RecordLike[]; before: ExistingState; log: Log },
): Promise<void> {
  const { tenantId, integrationId, referenceDate, records, before, log } = opts

  const perSegment = new Map<string, { customers: number; repeat: number; revenue: number }>()
  const changes: Record<string, unknown>[] = []
  for (const r of records) {
    const s = perSegment.get(r.segment_name) || { customers: 0, repeat: 0, revenue: 0 }
    s.customers++
    if ((r.orders_count || 0) > 1) s.repeat++
    s.revenue += Number(r.revenue_total || 0)
    perSegment.set(r.segment_name, s)

    const prev = before.segments.get(r.customer_id)
    if (prev && prev !== r.segment_name && before.prevDate !== referenceDate) {
      changes.push({ tenant_id: tenantId, integration_id: integrationId, customer_id: r.customer_id, from_segment: prev, to_segment: r.segment_name, revenue_total: Number(r.revenue_total || 0), changed_on: referenceDate })
    }
  }

  const rows = [...perSegment.entries()].map(([segment_name, s]) => ({
    tenant_id: tenantId, integration_id: integrationId, reference_date: referenceDate, segment_name,
    customers: s.customers, repeat_customers: s.repeat, revenue: Math.round(s.revenue * 100) / 100,
  }))
  await supabase.from('rfm_history_daily').delete().eq('integration_id', integrationId).eq('reference_date', referenceDate)
  const { error: hErr } = await supabase.from('rfm_history_daily').insert(rows)
  if (hErr) log.error('[RFM] history insert error:', hErr)

  if (changes.length > 0) {
    await supabase.from('rfm_segment_changes').delete().eq('integration_id', integrationId).eq('changed_on', referenceDate)
    for (let i = 0; i < changes.length; i += 500) {
      const { error } = await supabase.from('rfm_segment_changes').insert(changes.slice(i, i + 500))
      if (error) log.error('[RFM] changes insert error:', error)
    }
  }
  log.info(`[RFM] History: ${rows.length} segments, ${changes.length} segment changes`)
}

export interface PreviousDay { date: string; segments: Record<string, number>; total: number; repeat: number }

/** Último dia anterior ao cálculo atual no histórico leve (base dos alertas). */
export async function loadPreviousDay(supabase: ServiceClient, integrationId: string, referenceDate: string): Promise<PreviousDay | null> {
  const { data: d } = await supabase.from('rfm_history_daily').select('reference_date')
    .eq('integration_id', integrationId).lt('reference_date', referenceDate)
    .order('reference_date', { ascending: false }).limit(1)
  const date = (d as { reference_date: string }[] | null)?.[0]?.reference_date
  if (!date) return null
  const { data: rows } = await supabase.from('rfm_history_daily').select('segment_name, customers, repeat_customers')
    .eq('integration_id', integrationId).eq('reference_date', date)
  if (!rows || rows.length === 0) return null
  const segments: Record<string, number> = {}
  let total = 0, repeat = 0
  for (const r of rows as { segment_name: string; customers: number; repeat_customers: number }[]) {
    segments[r.segment_name] = r.customers
    total += r.customers
    repeat += r.repeat_customers
  }
  return { date, segments, total, repeat }
}
