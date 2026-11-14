import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
type ServiceClient = ReturnType<typeof createClient>;
import { scoreRecency, scoreFrequency, scoreMonetary, determineSegment } from './rfm-scoring.ts'
import { fetchByIds, fetchLiCategoryNames } from './rfm-fetch.ts'
import { loadPreviousDay } from './rfm-history.ts'

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
}

export async function runRfmBackground(ctx: RfmBackgroundContext): Promise<void> {
  const { supabase, integration_id, source_type, tenantId, referenceDate, records, segmentSummary, now, customerMetrics, cachedLiOrders, cachedBlingPaidOrders, log } = ctx
  const batchSize = 500

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

        // upsert no lugar (1 linha por cliente+categoria); só limpa o que sobrou se tudo gravou
        let catFailed = false
        for (let i = 0; i < catRecords.length; i += batchSize) {
          const batch = catRecords.slice(i, i + batchSize)
          const { error: catUpsertErr } = await supabase.from('customer_rfm_category_snapshots').upsert(batch, { onConflict: 'integration_id,customer_id,category_name' })
          if (catUpsertErr) { catFailed = true; log.error('[RFM] Category upsert error:', catUpsertErr) }
        }
        if (!catFailed) {
          await supabase.from('customer_rfm_category_snapshots').delete().eq('integration_id', integration_id).lt('reference_date', referenceDate)
        }

        categoryProcessed = catRecords.length
        log.info(`[RFM] Category RFM: ${categoriesSet.size} categories, ${catRecords.length} records`)
      }
    } catch (catErr) {
      log.error('[RFM] Category RFM calculation error (non-fatal):', catErr)
    }

    // === PHASE 5: Generate RFM Alerts (compara com o último dia do histórico leve) ===
    try {
      const prev = await loadPreviousDay(supabase, integration_id, referenceDate)
      if (prev && prev.total > 0) {
        const alerts: Record<string, unknown>[] = []

        const prevChampions = prev.segments['Campeões'] || 0
        const currChampions = segmentSummary['Campeões'] || 0
        if (prevChampions > 0 && currChampions < prevChampions) {
          const dropPct = Math.round(((prevChampions - currChampions) / prevChampions) * 100)
          alerts.push({ tenant_id: tenantId, integration_id, alert_type: 'champions_drop', title: `Campeões caíram ${dropPct}%`, description: `De ${prevChampions} para ${currChampions} clientes campeões desde ${prev.date}.`, severity: dropPct >= 20 ? 'critical' : 'warning', reference_date: referenceDate, metadata: { prev_count: prevChampions, curr_count: currChampions, drop_pct: dropPct } })
        }

        const prevHighValueAtRisk = prev.segments['Alto Valor em Risco'] || 0
        const currHighValueAtRisk = segmentSummary['Alto Valor em Risco'] || 0
        if (currHighValueAtRisk > prevHighValueAtRisk && currHighValueAtRisk >= 3) {
          alerts.push({ tenant_id: tenantId, integration_id, alert_type: 'high_value_at_risk', title: `${currHighValueAtRisk} clientes alto valor em risco`, description: `Aumento de ${prevHighValueAtRisk} para ${currHighValueAtRisk} clientes de alto valor em risco.`, severity: 'critical', reference_date: referenceDate, metadata: { prev_count: prevHighValueAtRisk, curr_count: currHighValueAtRisk } })
        }

        const currRepurchase = records.filter(r => (r.orders_count as number) > 1).length
        const prevRate = prev.total > 0 ? (prev.repeat / prev.total * 100) : 0
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
    } catch (alertErr) {
      log.error('[RFM] Alert generation error (non-fatal):', alertErr)
    }

    // === PHASE 6: renova os membros das audiências dinâmicas (no banco, com as mesmas regras da tela) ===
    try {
      const { data: audiences } = await supabase
        .from('rfm_audiences')
        .select('id')
        .eq('integration_id', integration_id)
        .eq('is_active', true)

      for (const aud of (audiences || []) as { id: string }[]) {
        const { error: audErr } = await supabase.rpc('rfm_refresh_audience', { p_audience_id: aud.id })
        if (audErr) log.error(`[RFM] Audience ${aud.id} refresh error:`, audErr)
        else log.info(`[RFM] Audience "${aud.id}" renovada`)
      }
    } catch (audErr) {
      log.error('[RFM] Audience recalc error (non-fatal):', audErr)
    }

    log.info(`[RFM] Background processing completed successfully`)
  } catch (bgErr) {
    log.error('[RFM] Background processing error:', bgErr)
  }
}
