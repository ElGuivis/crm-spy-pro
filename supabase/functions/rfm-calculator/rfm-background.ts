import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
type ServiceClient = ReturnType<typeof createClient>;
import { scoreRecency, scoreFrequency, scoreMonetary, determineSegment } from './rfm-scoring.ts'
import { fetchByIds, fetchLiCategoryNames } from './rfm-fetch.ts'

/** Pedido sem `customer_id`: o cálculo principal usa `li_<id do cliente na loja>`; aqui igual. */
function liCustomerKey(rawJson: unknown): string | null {
  const cliente = (rawJson as Record<string, unknown> | null)?.cliente as Record<string, unknown> | undefined
  return cliente?.id ? `li_${Math.round(Number(cliente.id))}` : null
}

type Log = { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };

export interface CategoryCustomerMetrics {
  customer_id: string
  customer_name: string | null
  category_name: string
  last_order_date: string
  orders_count: number
  revenue_total: number
}

export interface CustomerMetrics {
  customer_id: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  customer_doc: string | null
  last_order_date: string
  orders_count: number
  revenue_total: number
  order_dates: string[]
}

export interface RfmBackgroundContext {
  supabase: ServiceClient
  integration_id: string
  source_type: string
  tenantId: string
  referenceDate: string
  records: Record<string, unknown>[]
  segmentSummary: Record<string, number>
  now: Date
  customerMetrics: CustomerMetrics[]
  cachedLiOrders: Record<string, unknown>[] | null
  cachedBlingPaidOrders: Record<string, unknown>[] | null
  log: Log
  batchDelete: (table: string, integId: string, refDate: string) => Promise<void>
}

export async function runRfmBackground(ctx: RfmBackgroundContext): Promise<void> {
  const { supabase, integration_id, source_type, tenantId, referenceDate, records, segmentSummary, now, customerMetrics, cachedLiOrders, cachedBlingPaidOrders, log, batchDelete } = ctx
  const batchSize = 100

  try {
    // === PHASE 7: Category-level RFM ===
    let categoryProcessed = 0
    try {
      const categoryMetrics: CategoryCustomerMetrics[] = []

      if (source_type === 'loja_integrada') {
        const allOrders = (cachedLiOrders || []).map(o => ({ id: o.id, customer_id: o.customer_id, raw_json: o.raw_json, created_at_remote: o.created_at_remote }))

        if (allOrders && allOrders.length > 0) {
          const orderIds = allOrders.map(o => o.id)
          const orderCustomerMap = new Map(allOrders.map(o => [o.id, { customer_id: o.customer_id || liCustomerKey(o.raw_json), date: o.created_at_remote }]))

          const allItems = await fetchByIds(supabase, 'li_order_items', 'order_id, loja_integrada_product_id, name, price, qty', 'order_id', orderIds)
          log.info(`[RFM] Category step: ${orderIds.length} orders, ${allItems.length} items`)
          const productIds = [...new Set(allItems.map(it => it.loja_integrada_product_id).filter(Boolean))]
          const productCategoryMap = new Map<number, string>()

          const liProducts = await fetchByIds(supabase, 'li_products', 'loja_integrada_product_id, name, raw_json', 'loja_integrada_product_id', productIds)
          const categoryNames = await fetchLiCategoryNames(supabase, integration_id, log)
          for (const p of liProducts) {
            const cats = (p.raw_json as Record<string, unknown>)?.categorias as unknown[] || []
            const catUri = typeof cats[0] === 'string' ? cats[0] : ''
            if (!catUri) continue
            const catId = catUri.split('/').pop() || 'sem_categoria'
            productCategoryMap.set(p.loja_integrada_product_id as number, categoryNames.get(catId) || `cat_${catId}`)
          }
          log.info(`[RFM] Category step: ${productIds.length} products, ${productCategoryMap.size} with category`)
          const custCatGroup = new Map<string, { customer_id: string; customer_name: string | null; category: string; revenue: number; orders: Set<string>; lastDate: string }>()
          const customerNameMap = new Map(customerMetrics.map(c => [c.customer_id, c.customer_name]))

          for (const item of allItems) {
            const orderInfo = orderCustomerMap.get(item.order_id)
            if (!orderInfo || !orderInfo.customer_id) continue
            const category = productCategoryMap.get(item.loja_integrada_product_id as number) || 'Sem Categoria'
            const key = `${orderInfo.customer_id}::${category}`

            if (!custCatGroup.has(key)) {
              custCatGroup.set(key, {
                customer_id: orderInfo.customer_id as string,
                customer_name: customerNameMap.get(orderInfo.customer_id as string) || null,
                category, revenue: 0, orders: new Set(), lastDate: orderInfo.date as string,
              })
            }
            const entry = custCatGroup.get(key)!
            entry.revenue += Number(item.price || 0) * Number(item.qty || 1)
            entry.orders.add(item.order_id as string)
            if ((orderInfo.date as string) > entry.lastDate) entry.lastDate = orderInfo.date as string
          }

          for (const [, data] of custCatGroup) {
            categoryMetrics.push({ customer_id: data.customer_id, customer_name: data.customer_name, category_name: data.category, last_order_date: data.lastDate, orders_count: data.orders.size, revenue_total: data.revenue })
          }
        }
      } else if (source_type === 'bling') {
        const paidOrders = cachedBlingPaidOrders || []

        if (paidOrders.length > 0) {
          const orderIds = paidOrders.map(o => o.id)
          const orderInfoMap = new Map(paidOrders.map(o => [o.id, { customer_id: String(o.cliente_id || 'unknown'), customer_name: o.cliente_nome, date: o.data_criacao }]))

          const allItems = await fetchByIds(supabase, 'bling_order_items', 'order_id, produto_id, produto_nome, valor_total, quantidade', 'order_id', orderIds)
          const productIds = [...new Set(allItems.map(it => it.produto_id).filter(Boolean))]
          const productCategoryMap = new Map<number, string>()

          const blingProducts = await fetchByIds(supabase, 'bling_products', 'bling_id, categoria_nome', 'bling_id', productIds)
          for (const p of blingProducts) {
            if (p.categoria_nome) productCategoryMap.set(p.bling_id as number, p.categoria_nome as string)
          }

          const custCatGroup = new Map<string, { customer_id: string; customer_name: string | null; category: string; revenue: number; orders: Set<string>; lastDate: string }>()

          for (const item of allItems) {
            const orderInfo = orderInfoMap.get(item.order_id)
            if (!orderInfo || orderInfo.customer_id === 'unknown') continue
            const category = productCategoryMap.get(item.produto_id as number) || 'Sem Categoria'
            const key = `${orderInfo.customer_id}::${category}`

            if (!custCatGroup.has(key)) {
              custCatGroup.set(key, { customer_id: orderInfo.customer_id, customer_name: orderInfo.customer_name as string | null, category, revenue: 0, orders: new Set(), lastDate: orderInfo.date as string })
            }
            const entry = custCatGroup.get(key)!
            entry.revenue += Number(item.valor_total || 0)
            entry.orders.add(item.order_id as string)
            if ((orderInfo.date as string) > entry.lastDate) entry.lastDate = orderInfo.date as string
          }

          for (const [, data] of custCatGroup) {
            categoryMetrics.push({ customer_id: data.customer_id, customer_name: data.customer_name, category_name: data.category, last_order_date: data.lastDate, orders_count: data.orders.size, revenue_total: data.revenue })
          }
        }
      }

      if (categoryMetrics.length > 0) {
        const categoriesSet = new Set(categoryMetrics.map(m => m.category_name))
        const catRecords: Record<string, unknown>[] = []

        for (const catName of categoriesSet) {
          const catMetrics = categoryMetrics.filter(m => m.category_name === catName)
          if (catMetrics.length < 2) {
            for (const cm of catMetrics) {
              const recencyDays = Math.floor((now.getTime() - new Date(cm.last_order_date).getTime()) / (1000 * 60 * 60 * 24))
              const aov = cm.orders_count > 0 ? cm.revenue_total / cm.orders_count : 0
              const segment = determineSegment(3, 3, 3)
              catRecords.push({ tenant_id: tenantId, integration_id, source_type, customer_id: cm.customer_id, customer_name: cm.customer_name, category_name: catName, last_order_date: cm.last_order_date, recency_days: recencyDays, orders_count: cm.orders_count, revenue_total: Math.round(cm.revenue_total * 100) / 100, aov: Math.round(aov * 100) / 100, r_score: 3, f_score: 3, m_score: 3, rfm_score: '333', segment_name: segment.name, reference_date: referenceDate })
            }
            continue
          }

          catMetrics.forEach((cm) => {
            const recencyDays = Math.floor((now.getTime() - new Date(cm.last_order_date).getTime()) / (1000 * 60 * 60 * 24))
            const r = scoreRecency(recencyDays)
            const f = scoreFrequency(cm.orders_count)
            const m = scoreMonetary(cm.revenue_total)
            const aov = cm.orders_count > 0 ? cm.revenue_total / cm.orders_count : 0
            const segment = determineSegment(r, f, m)
            catRecords.push({ tenant_id: tenantId, integration_id, source_type, customer_id: cm.customer_id, customer_name: cm.customer_name, category_name: catName, last_order_date: cm.last_order_date, recency_days: recencyDays, orders_count: cm.orders_count, revenue_total: Math.round(cm.revenue_total * 100) / 100, aov: Math.round(aov * 100) / 100, r_score: r, f_score: f, m_score: m, rfm_score: `${r}${f}${m}`, segment_name: segment.name, reference_date: referenceDate })
          })
        }

        await batchDelete('customer_rfm_category_snapshots', integration_id, referenceDate)

        for (let i = 0; i < catRecords.length; i += batchSize) {
          const batch = catRecords.slice(i, i + batchSize)
          const { error: catInsertErr } = await supabase.from('customer_rfm_category_snapshots').insert(batch)
          if (catInsertErr) log.error('[RFM] Category insert error:', catInsertErr)
        }

        categoryProcessed = catRecords.length
        log.info(`[RFM] Category RFM: ${categoriesSet.size} categories, ${catRecords.length} records`)
      }
    } catch (catErr) {
      log.error('[RFM] Category RFM calculation error (non-fatal):', catErr)
    }

    // === PHASE 5: Generate RFM Alerts ===
    try {
      const { data: prevDates } = await supabase
        .from('customer_rfm_snapshots')
        .select('reference_date')
        .eq('integration_id', integration_id)
        .neq('reference_date', referenceDate)
        .order('reference_date', { ascending: false })
        .limit(1)

      if (prevDates && prevDates.length > 0) {
        const prevDate = prevDates[0].reference_date
        const { data: prevSnapshots } = await supabase
          .from('customer_rfm_snapshots')
          .select('customer_id, segment_name, revenue_total, churn_risk')
          .eq('integration_id', integration_id)
          .eq('reference_date', prevDate)

        if (prevSnapshots && prevSnapshots.length > 0) {
          const prevSegments: Record<string, number> = {}
          let prevHighValueAtRisk = 0
          const prevRepurchase = prevSnapshots.filter(s => (s as Record<string, unknown>).orders_count > 1).length

          for (const s of prevSnapshots) {
            const seg = s.segment_name || 'Outros'
            prevSegments[seg] = (prevSegments[seg] || 0) + 1
            if (seg === 'Alto Valor em Risco') prevHighValueAtRisk++
          }

          const alerts: Record<string, unknown>[] = []

          const prevChampions = prevSegments['Campeões'] || 0
          const currChampions = segmentSummary['Campeões'] || 0
          if (prevChampions > 0 && currChampions < prevChampions) {
            const dropPct = Math.round(((prevChampions - currChampions) / prevChampions) * 100)
            alerts.push({ tenant_id: tenantId, integration_id, alert_type: 'champions_drop', title: `Campeões caíram ${dropPct}%`, description: `De ${prevChampions} para ${currChampions} clientes campeões desde ${prevDate}.`, severity: dropPct >= 20 ? 'critical' : 'warning', reference_date: referenceDate, metadata: { prev_count: prevChampions, curr_count: currChampions, drop_pct: dropPct } })
          }

          const currHighValueAtRisk = segmentSummary['Alto Valor em Risco'] || 0
          if (currHighValueAtRisk > prevHighValueAtRisk && currHighValueAtRisk >= 3) {
            alerts.push({ tenant_id: tenantId, integration_id, alert_type: 'high_value_at_risk', title: `${currHighValueAtRisk} clientes alto valor em risco`, description: `Aumento de ${prevHighValueAtRisk} para ${currHighValueAtRisk} clientes de alto valor em risco.`, severity: 'critical', reference_date: referenceDate, metadata: { prev_count: prevHighValueAtRisk, curr_count: currHighValueAtRisk } })
          }

          const currRepurchase = records.filter(r => r.orders_count > 1).length
          const prevRate = prevSnapshots.length > 0 ? (prevRepurchase / prevSnapshots.length * 100) : 0
          const currRate = records.length > 0 ? (currRepurchase / records.length * 100) : 0
          if (prevRate > 0 && currRate < prevRate - 3) {
            alerts.push({ tenant_id: tenantId, integration_id, alert_type: 'repurchase_drop', title: `Taxa de recompra caiu ${(prevRate - currRate).toFixed(1)}%`, description: `Taxa de 2ª compra caiu de ${prevRate.toFixed(1)}% para ${currRate.toFixed(1)}%.`, severity: 'warning', reference_date: referenceDate, metadata: { prev_rate: prevRate, curr_rate: currRate } })
          }

          if (alerts.length > 0) {
            await supabase.from('rfm_alerts').delete().eq('integration_id', integration_id).eq('reference_date', referenceDate)
            await supabase.from('rfm_alerts').insert(alerts)
            log.info(`[RFM] Generated ${alerts.length} alerts`)
          }
        }
      }
    } catch (alertErr) {
      log.error('[RFM] Alert generation error (non-fatal):', alertErr)
    }

    // === PHASE 6: Recalculate dynamic audiences ===
    try {
      const { data: audiences } = await supabase
        .from('rfm_audiences')
        .select('id, tenant_id, rules')
        .eq('integration_id', integration_id)
        .eq('is_active', true)

      if (audiences && audiences.length > 0) {
        for (const aud of audiences) {
          const rules = (aud.rules || {}) as Record<string, unknown>
          let members = [...records]
          if (rules.r_min) members = members.filter(r => r.r_score >= rules.r_min)
          if (rules.r_max) members = members.filter(r => r.r_score <= rules.r_max)
          if (rules.f_min) members = members.filter(r => r.f_score >= rules.f_min)
          if (rules.f_max) members = members.filter(r => r.f_score <= rules.f_max)
          if (rules.m_min) members = members.filter(r => r.m_score >= rules.m_min)
          if (rules.m_max) members = members.filter(r => r.m_score <= rules.m_max)
          if (rules.segment_name) members = members.filter(r => r.segment_name === rules.segment_name)
          if (rules.churn_risk) members = members.filter(r => r.churn_risk === rules.churn_risk)
          if (rules.min_revenue) members = members.filter(r => r.revenue_total >= rules.min_revenue)
          if (rules.max_revenue) members = members.filter(r => r.revenue_total <= rules.max_revenue)
          if (rules.min_orders) members = members.filter(r => r.orders_count >= rules.min_orders)
          if (rules.max_orders) members = members.filter(r => r.orders_count <= rules.max_orders)
          if (rules.min_aov) members = members.filter(r => r.aov >= rules.min_aov)
          if (rules.max_aov) members = members.filter(r => r.aov <= rules.max_aov)

          const totalRevenue = members.reduce((sum, m) => sum + (m.revenue_total as number), 0)
          await supabase.from('rfm_audiences').update({ member_count: members.length, total_revenue: totalRevenue, last_calculated_at: new Date().toISOString() }).eq('id', aud.id)
          log.info(`[RFM] Audience "${aud.id}" updated: ${members.length} members`)
        }
      }
    } catch (audErr) {
      log.error('[RFM] Audience recalc error (non-fatal):', audErr)
    }

    log.info(`[RFM] Background processing completed successfully`)
  } catch (bgErr) {
    log.error('[RFM] Background processing error:', bgErr)
  }
}
