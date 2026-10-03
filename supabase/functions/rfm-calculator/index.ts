import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
type ServiceClient = ReturnType<typeof createClient>;
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts"
import { requireResource } from "../_shared/resource-guard.ts"
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { scoreRecency, scoreFrequency, scoreMonetary, determineSegment, determineChurnRisk } from './rfm-scoring.ts'
import { runRfmBackground } from './rfm-background.ts'
import type { CustomerMetrics } from './rfm-background.ts'

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void } | undefined

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const cid = getCorrelationId(req);
  const log = createLogger("rfm-calculator", cid);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authResult = await requireUserOrInternalAuth(req)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'public' }, global: { headers: { 'x-statement-timeout': '120000' } } }
    )

    const { integration_id, source_type } = await req.json()
    if (!integration_id || !source_type) {
      return new Response(JSON.stringify({ error: 'integration_id and source_type required' }), { status: 400, headers: corsHeaders })
    }

    let tenantId: string

    if (authResult.isInternal) {
      const { data: intData } = await supabaseAdmin
        .from('integrations')
        .select('tenant_id')
        .eq('id', integration_id)
        .single()
      if (!intData?.tenant_id) {
        return new Response(JSON.stringify({ error: 'Integration not found' }), { status: 404, headers: corsHeaders })
      }
      tenantId = intData.tenant_id
    } else {
      tenantId = authResult.tenantId!
      await requireResource(supabaseAdmin, "integrations", integration_id, tenantId, req)
    }

    const now = new Date()
    const referenceDate = now.toISOString().split('T')[0]

    async function fetchAllRows<T = Record<string, unknown>>(
      table: string,
      query: (from: Record<string, unknown>) => { range: (start: number, end: number) => Promise<{ data: T[] | null; error: Error | null }> },
      pageSize = 1000
    ): Promise<T[]> {
      const allRows: T[] = []
      let offset = 0
      while (true) {
        const builder = query(supabaseAdmin.from(table))
        const { data, error } = await builder.range(offset, offset + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allRows.push(...data)
        if (data.length < pageSize) break
        offset += pageSize
      }
      return allRows
    }

    const customerMetrics: CustomerMetrics[] = []
    let cachedLiOrders: Record<string, unknown>[] | null = null
    let cachedBlingPaidOrders: Record<string, unknown>[] | null = null

    if (source_type === 'loja_integrada') {
      const paidStatuses = ['Pedido Pago', 'Pedido Enviado', 'Pedido Entregue']
      const orders = await fetchAllRows('li_orders', (from: Record<string, unknown>) =>
        from.select('id, customer_id, totals_json, status_name, created_at_remote, raw_json')
          .eq('integration_id', integration_id).eq('tenant_id', tenantId).in('status_name', paidStatuses)
      )
      cachedLiOrders = orders

      log.info(`[RFM] LI orders fetched: ${orders.length} (all-time)`)

      const customerByUuid = new Map<string, unknown>()
      const customerByLiId = new Map<string, unknown>()
      for (const order of orders) {
        if (order.customer_id && !customerByUuid.has(order.customer_id)) {
          const c = (order.raw_json as Record<string, unknown>)?.cliente as Record<string, unknown>
          customerByUuid.set(order.customer_id, c ? { name: c.nome || null, email: c.email || null, phone: c.telefone_celular || c.telefone_principal || null, doc: c.cpf || c.cnpj || null } : null)
        }
        const rawCliente = (order.raw_json as Record<string, unknown>)?.cliente as Record<string, unknown>
        if (rawCliente?.id) {
          const liId = String(Math.round(Number(rawCliente.id)))
          if (!customerByLiId.has(liId)) {
            customerByLiId.set(liId, { name: rawCliente.nome || null, email: rawCliente.email || null, phone: rawCliente.telefone_celular || rawCliente.telefone_principal || null, doc: rawCliente.cpf || rawCliente.cnpj || null })
          }
        }
      }

      log.info(`[RFM] Customer data extracted from ${orders.length} orders (no separate customer fetch)`)

      const grouped = new Map<string, { orders: Record<string, unknown>[], customer: Record<string, unknown> | null }>()
      for (const order of orders) {
        let customerKey: string | null = null
        let customerData: Record<string, unknown> | null = null

        if (order.customer_id) {
          customerKey = order.customer_id
          customerData = (customerByUuid.get(order.customer_id) as Record<string, unknown>) || null
        }

        const rawJson = order.raw_json as Record<string, unknown> | null
        const rawCliente = rawJson?.cliente as Record<string, unknown> | null
        if (!customerKey && rawCliente?.id) {
          const liClienteId = String(Math.round(Number(rawCliente.id)))
          customerKey = `li_${liClienteId}`
          customerData = (customerByLiId.get(liClienteId) as Record<string, unknown>) || {
            name: rawCliente.nome || null, email: rawCliente.email || null,
            phone: rawCliente.telefone_celular || rawCliente.telefone_principal || null,
            doc: rawCliente.cpf || rawCliente.cnpj || null,
          }
        }

        if (!customerKey) continue
        if (!grouped.has(customerKey)) grouped.set(customerKey, { orders: [], customer: customerData })
        grouped.get(customerKey)!.orders.push(order)
      }

      log.info(`[RFM] Unique customers found: ${grouped.size}`)

      for (const [custId, { orders: custOrders, customer }] of grouped) {
        const totalRevenue = custOrders.reduce((sum, o) => {
          const totals = o.totals_json as Record<string, unknown>
          const total = totals?.valor_total || totals?.total || 0
          return sum + Number(total)
        }, 0)
        const dates = custOrders.map(o => o.created_at_remote as string).filter(Boolean).sort()
        customerMetrics.push({
          customer_id: custId,
          customer_name: (customer?.name || customer?.nome) as string | null || null,
          customer_email: (customer?.email as string) || null,
          customer_phone: (customer?.phone as string) || null,
          customer_doc: (customer?.doc as string) || null,
          last_order_date: dates[dates.length - 1],
          orders_count: custOrders.length,
          revenue_total: totalRevenue,
          order_dates: dates,
        })
      }
    } else if (source_type === 'bling') {
      const orders = await fetchAllRows('bling_orders', (from: Record<string, unknown>) =>
        from.select('id, cliente_id, cliente_nome, cliente_email, cliente_telefone, cliente_cpf_cnpj, valor_total, situacao_nome, data_criacao')
          .eq('integration_id', integration_id).eq('tenant_id', tenantId)
      )

      const paidKeywords = ['pago', 'faturado', 'enviado', 'entregue', 'atendido', 'completo']
      const paidOrders = orders.filter(o => {
        const status = ((o.situacao_nome || '') as string).toLowerCase()
        return paidKeywords.some(k => status.includes(k))
      })
      cachedBlingPaidOrders = paidOrders

      const grouped = new Map<string, Record<string, unknown>[]>()
      for (const order of paidOrders) {
        const key = String(order.cliente_id || 'unknown')
        if (key === 'unknown') continue
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(order)
      }

      for (const [custId, custOrders] of grouped) {
        const first = custOrders[0]
        const totalRevenue = custOrders.reduce((sum, o) => sum + Number(o.valor_total || 0), 0)
        const dates = custOrders.map(o => o.data_criacao as string).filter(Boolean).sort()
        customerMetrics.push({
          customer_id: custId,
          customer_name: (first.cliente_nome as string) || null,
          customer_email: (first.cliente_email as string) || null,
          customer_phone: (first.cliente_telefone as string) || null,
          customer_doc: (first.cliente_cpf_cnpj as string) || null,
          last_order_date: dates[dates.length - 1],
          orders_count: custOrders.length,
          revenue_total: totalRevenue,
          order_dates: dates,
        })
      }
    } else {
      return new Response(JSON.stringify({ error: 'Invalid source_type' }), { status: 400, headers: corsHeaders })
    }

    if (customerMetrics.length === 0) {
      return new Response(JSON.stringify({ success: true, total_processed: 0, segments: {}, message: 'Nenhum cliente com pedidos pagos encontrado nos últimos 12 meses' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const records = customerMetrics.map((c) => {
      const lastDate = new Date(c.last_order_date)
      const recencyDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      const r = scoreRecency(recencyDays)
      const f = scoreFrequency(c.orders_count)
      const m = scoreMonetary(c.revenue_total)
      const aov = c.orders_count > 0 ? c.revenue_total / c.orders_count : 0

      let avgInterval: number | null = null
      let stdDevInterval: number | null = null
      const intervals: number[] = []
      if (c.order_dates.length > 1) {
        const sortedDates = c.order_dates.map(d => new Date(d).getTime()).sort((a, b) => a - b)
        for (let j = 1; j < sortedDates.length; j++) {
          intervals.push((sortedDates[j] - sortedDates[j-1]) / (1000 * 60 * 60 * 24))
        }
        avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        if (intervals.length > 1) {
          const variance = intervals.reduce((sum, v) => sum + Math.pow(v - avgInterval!, 2), 0) / intervals.length
          stdDevInterval = Math.sqrt(variance)
        }
      }

      const segment = determineSegment(r, f, m)
      const churnRisk = determineChurnRisk(recencyDays, avgInterval)

      const firstPurchaseDate = c.order_dates[0]?.slice(0, 10) ?? null
      let ltv_predicted_12m = 0
      if (firstPurchaseDate) {
        const tenureMonths = Math.max(1, (now.getTime() - new Date(firstPurchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
        ltv_predicted_12m = Math.round((c.revenue_total / tenureMonths) * 12 * 100) / 100
      }
      const churn_probability = Math.round(
        Math.min(1, avgInterval && avgInterval > 0 ? recencyDays / (avgInterval * 2.5) : recencyDays / 180) * 100
      ) / 100

      let predicted_next_purchase_date: string | null = null
      let purchase_probability_7d: number | null = null
      let purchase_probability_15d: number | null = null
      let purchase_probability_30d: number | null = null
      let ideal_offer_window_start: number | null = null
      let ideal_offer_window_end: number | null = null

      if (avgInterval && avgInterval > 0) {
        const lastOrderDate = new Date(c.last_order_date)
        const predictedDate = new Date(lastOrderDate.getTime() + avgInterval * 24 * 60 * 60 * 1000)
        predicted_next_purchase_date = predictedDate.toISOString().split('T')[0]

        const sigma = stdDevInterval || (avgInterval * 0.3)
        const calcProb = (windowDays: number): number => {
          const daysUntilWindow = recencyDays + windowDays
          const zScore = (avgInterval! - daysUntilWindow) / Math.max(sigma, 1)
          const prob = 1 / (1 + Math.exp(zScore * 1.5))
          return Math.round(Math.min(99, Math.max(1, prob * 100)) * 10) / 10
        }

        purchase_probability_7d = calcProb(7)
        purchase_probability_15d = calcProb(15)
        purchase_probability_30d = calcProb(30)

        const daysUntilPredicted = Math.max(0, Math.floor((predictedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        const buffer = Math.round(sigma || avgInterval * 0.2)
        ideal_offer_window_start = Math.max(0, daysUntilPredicted - Math.round(buffer * 0.5))
        ideal_offer_window_end = daysUntilPredicted + buffer
      }

      return {
        tenant_id: tenantId, integration_id, source_type,
        customer_id: c.customer_id, customer_name: c.customer_name, customer_email: c.customer_email,
        customer_phone: c.customer_phone, customer_doc: c.customer_doc,
        last_order_date: c.last_order_date, recency_days: recencyDays, orders_count: c.orders_count,
        revenue_total: c.revenue_total, aov: Math.round(aov * 100) / 100,
        avg_order_interval_days: avgInterval ? Math.round(avgInterval * 100) / 100 : null,
        r_score: r, f_score: f, m_score: m, rfm_score: `${r}${f}${m}`,
        segment_name: segment.name, segment_action: segment.action, churn_risk: churnRisk,
        first_purchase_date: firstPurchaseDate, ltv_predicted_12m, churn_probability,
        predicted_next_purchase_date, purchase_probability_7d, purchase_probability_15d,
        purchase_probability_30d, ideal_offer_window_start, ideal_offer_window_end,
        reference_date: referenceDate, updated_at: new Date().toISOString(),
      }
    })

    async function batchDelete(table: string, integId: string, refDate: string) {
      let totalDeleted = 0
      while (true) {
        const { data: ids, error: selErr } = await supabaseAdmin.from(table).select('id').eq('integration_id', integId).eq('reference_date', refDate).limit(200)
        if (selErr) { log.error(`[RFM] batchDelete select error on ${table}:`, selErr); throw selErr }
        if (!ids || ids.length === 0) break
        const idList = ids.map((r: Record<string, unknown>) => r.id)
        const { error: delErr } = await supabaseAdmin.from(table).delete().in('id', idList)
        if (delErr) { log.error(`[RFM] batchDelete delete error on ${table}:`, delErr); throw delErr }
        totalDeleted += idList.length
      }
      log.info(`[RFM] Deleted ${totalDeleted} rows from ${table}`)
    }

    log.info(`[RFM] Starting delete of old snapshots...`)
    await batchDelete('customer_rfm_snapshots', integration_id, referenceDate)
    log.info(`[RFM] Starting insert of ${records.length} records...`)

    const batchSize = 100
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error: insertErr } = await supabaseAdmin.from('customer_rfm_snapshots').insert(batch)
      if (insertErr) { log.error(`[RFM] Insert error at batch ${i}:`, insertErr); throw insertErr }
    }

    log.info(`[RFM] Inserted ${records.length} snapshots successfully`)

    const segmentSummary: Record<string, number> = {}
    for (const r of records) {
      segmentSummary[r.segment_name] = (segmentSummary[r.segment_name] || 0) + 1
    }

    const backgroundWork = () => runRfmBackground({
      supabase: supabaseAdmin, integration_id, source_type, tenantId, referenceDate,
      records, segmentSummary, now, customerMetrics, cachedLiOrders, cachedBlingPaidOrders, log, batchDelete,
    })

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(backgroundWork())
    } else {
      backgroundWork().catch(err => log.error('[RFM] Background error:', err))
    }

    return new Response(JSON.stringify({ success: true, total_processed: records.length, segments: segmentSummary, reference_date: referenceDate }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    if (err instanceof Response) return err;
    log.error('RFM Calculator error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: corsHeaders })
  }
})
