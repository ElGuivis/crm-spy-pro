import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
type ServiceClient = ReturnType<typeof createClient>;
import { requireUserOrInternalAuth } from "../_shared/auth-guard.ts"
import { requireResource } from "../_shared/resource-guard.ts"
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

interface CustomerMetrics {
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

interface CategoryCustomerMetrics {
  customer_id: string
  customer_name: string | null
  category_name: string
  last_order_date: string
  orders_count: number
  revenue_total: number
}

// Absolute threshold scoring — replaces quintile-based scoring
// Recency: fewer days = higher score (reverse logic)
function scoreRecency(recencyDays: number): number {
  if (recencyDays <= 30) return 5
  if (recencyDays <= 60) return 4
  if (recencyDays <= 120) return 3
  if (recencyDays <= 240) return 2
  return 1
}

function scoreFrequency(ordersCount: number): number {
  if (ordersCount >= 10) return 5
  if (ordersCount >= 5) return 4
  if (ordersCount >= 3) return 3
  if (ordersCount >= 2) return 2
  return 1
}

function scoreMonetary(revenueTotal: number): number {
  if (revenueTotal >= 2000) return 5
  if (revenueTotal >= 1000) return 4
  if (revenueTotal >= 500) return 3
  if (revenueTotal >= 200) return 2
  return 1
}

// Classic RFM 5×5 grid — matches frontend segmentGrid exactly
const segmentGridBackend: Record<number, Record<number, { name: string; action: string }>> = {
  5: {
    1: { name: 'Não Perder',     action: 'Contato humano urgente, oferta exclusiva' },
    2: { name: 'Em Risco',       action: 'Campanha de reativação + oferta personalizada' },
    3: { name: 'Fiéis',          action: 'Programa de fidelidade, combo, assinatura' },
    4: { name: 'Campeões',       action: 'VIP, upsell premium, atendimento prioritário' },
    5: { name: 'Campeões',       action: 'VIP, upsell premium, atendimento prioritário' },
  },
  4: {
    1: { name: 'Em Risco',       action: 'Campanha de reativação + oferta personalizada' },
    2: { name: 'Precisam Atenção', action: 'Oferta direcionada para reengajar' },
    3: { name: 'Precisam Atenção', action: 'Oferta direcionada para reengajar' },
    4: { name: 'Campeões',       action: 'VIP, upsell premium, atendimento prioritário' },
    5: { name: 'Campeões',       action: 'VIP, upsell premium, atendimento prioritário' },
  },
  3: {
    1: { name: 'Hibernando',     action: 'Win-back com cupom, remarketing' },
    2: { name: 'Precisam Atenção', action: 'Oferta direcionada para reengajar' },
    3: { name: 'Potenciais Fiéis', action: 'Incentivar recorrência, programa fidelidade' },
    4: { name: 'Potenciais Fiéis', action: 'Incentivar recorrência, programa fidelidade' },
    5: { name: 'Fiéis',          action: 'Programa de fidelidade, combo, assinatura' },
  },
  2: {
    1: { name: 'Hibernando',     action: 'Win-back com cupom, remarketing' },
    2: { name: 'Prestes a Dormir', action: 'Lembrete de recompra, oferta relâmpago' },
    3: { name: 'Prestes a Dormir', action: 'Lembrete de recompra, oferta relâmpago' },
    4: { name: 'Promissores',    action: 'Empurrar recorrência de compra' },
    5: { name: 'Promissores',    action: 'Empurrar recorrência de compra' },
  },
  1: {
    1: { name: 'Perdidos',       action: 'Win-back barato ou desistir' },
    2: { name: 'Hibernando',     action: 'Win-back com cupom, remarketing' },
    3: { name: 'Prestes a Dormir', action: 'Lembrete de recompra, oferta relâmpago' },
    4: { name: 'Novos Clientes', action: 'Incentivar 2ª compra com cupom' },
    5: { name: 'Novos Clientes', action: 'Incentivar 2ª compra com cupom' },
  },
}

function determineSegment(r: number, f: number, _m: number): { name: string; action: string } {
  return segmentGridBackend[f]?.[r] || { name: 'Outros', action: 'Monitorar e engajar' }
}

function determineChurnRisk(recencyDays: number, avgInterval: number | null): string {
  if (!avgInterval || avgInterval <= 0) return 'saudavel'
  if (recencyDays <= avgInterval) return 'saudavel'
  if (recencyDays <= avgInterval * 1.5) return 'atencao'
  if (recencyDays <= avgInterval * 2) return 'risco'
  return 'critico'
}

Deno.serve(async (req) => {
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
      // Get tenant_id from the integration directly
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
      // IDOR protection: validate integration belongs to user's tenant
      await requireResource(supabaseAdmin, "integrations", integration_id, tenantId, req)
    }

    const now = new Date()
    const twelveMonthsAgo = new Date(now)
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const referenceDate = now.toISOString().split('T')[0]

    // Helper to fetch ALL rows with pagination (bypasses 1000-row default limit)
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

    let customerMetrics: CustomerMetrics[] = []
    // Store fetched orders for reuse in Phase 7 (category RFM) to avoid duplicate queries
    let cachedLiOrders: Record<string, unknown>[] | null = null
    let cachedBlingPaidOrders: Record<string, unknown>[] | null = null

    if (source_type === 'loja_integrada') {
      // Fetch ALL LI orders with paid statuses (paginated)
      // Include raw_json to extract customer data (most orders have customer_id = NULL)
      const paidStatuses = ['Pedido Pago', 'Pedido Enviado', 'Pedido Entregue']
      const orders = await fetchAllRows('li_orders', (from: Record<string, unknown>) =>
        from
          .select('id, customer_id, totals_json, status_name, created_at_remote, raw_json')
          .eq('integration_id', integration_id)
          .eq('tenant_id', tenantId)
          .in('status_name', paidStatuses)
      )
      cachedLiOrders = orders

      log.info(`[RFM] LI orders fetched: ${orders.length} (all-time)`)

      // Build customer lookup ONLY from orders' raw_json (skip fetching all 15k+ customers)
      // This avoids the heavy query that was causing statement timeouts
      const customerByUuid = new Map<string, unknown>()
      const customerByLiId = new Map<string, unknown>()
      for (const order of orders) {
        if (order.customer_id && !customerByUuid.has(order.customer_id)) {
          const c = order.raw_json?.cliente
          customerByUuid.set(order.customer_id, c ? {
            name: c.nome || null, email: c.email || null,
            phone: c.telefone_celular || c.telefone_principal || null,
            doc: c.cpf || c.cnpj || null,
          } : null)
        }
        if (order.raw_json?.cliente?.id) {
          const liId = String(Math.round(Number(order.raw_json.cliente.id)))
          if (!customerByLiId.has(liId)) {
            const c = order.raw_json.cliente
            customerByLiId.set(liId, {
              name: c.nome || null, email: c.email || null,
              phone: c.telefone_celular || c.telefone_principal || null,
              doc: c.cpf || c.cnpj || null,
            })
          }
        }
      }

      log.info(`[RFM] Customer data extracted from ${orders.length} orders (no separate customer fetch)`)

      // Group by customer - use raw_json->cliente->id as primary key when customer_id is NULL
      const grouped = new Map<string, { orders: Record<string, unknown>[], customer: Record<string, unknown> | null }>()
      for (const order of (orders || [])) {
        // Try to resolve customer: first by customer_id FK, then by raw_json->cliente->id
        let customerKey: string | null = null
        let customerData: Record<string, unknown> | null = null

        if (order.customer_id) {
          customerKey = order.customer_id
          customerData = customerByUuid.get(order.customer_id) || null
        }

        if (!customerKey && order.raw_json?.cliente?.id) {
          const liClienteId = String(Math.round(Number(order.raw_json.cliente.id)))
          customerKey = `li_${liClienteId}`
          customerData = customerByLiId.get(liClienteId) || {
            name: order.raw_json.cliente.nome || null,
            email: order.raw_json.cliente.email || null,
            phone: order.raw_json.cliente.telefone_celular || order.raw_json.cliente.telefone_principal || null,
            doc: order.raw_json.cliente.cpf || order.raw_json.cliente.cnpj || null,
          }
        }

        if (!customerKey) continue

        if (!grouped.has(customerKey)) {
          grouped.set(customerKey, { orders: [], customer: customerData })
        }
        grouped.get(customerKey)!.orders.push(order)
      }

      log.info(`[RFM] Unique customers found: ${grouped.size}`)

      for (const [custId, { orders: custOrders, customer }] of grouped) {
        const totalRevenue = custOrders.reduce((sum, o) => {
          const total = o.totals_json?.valor_total || o.totals_json?.total || 0
          return sum + Number(total)
        }, 0)
        const dates = custOrders.map(o => o.created_at_remote).filter(Boolean).sort()
        const lastDate = dates[dates.length - 1]

        customerMetrics.push({
          customer_id: custId,
          customer_name: customer?.name || customer?.nome || null,
          customer_email: customer?.email || null,
          customer_phone: customer?.phone || null,
          customer_doc: customer?.doc || null,
          last_order_date: lastDate,
          orders_count: custOrders.length,
          revenue_total: totalRevenue,
          order_dates: dates,
        })
      }
    } else if (source_type === 'bling') {
      // Bling paid statuses (common ones) - fetch ALL orders paginated
      const orders = await fetchAllRows('bling_orders', (from: Record<string, unknown>) =>
        from
          .select('id, cliente_id, cliente_nome, cliente_email, cliente_telefone, cliente_cpf_cnpj, valor_total, situacao_nome, data_criacao')
          .eq('integration_id', integration_id)
          .eq('tenant_id', tenantId)
      )

      // Filter paid orders (Bling uses various status names)
        const paidKeywords = ['pago', 'faturado', 'enviado', 'entregue', 'atendido', 'completo']
      const paidOrders = (orders || []).filter(o => {
        const status = (o.situacao_nome || '').toLowerCase()
        return paidKeywords.some(k => status.includes(k))
      })
      cachedBlingPaidOrders = paidOrders

      // Group by cliente_id
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
        const dates = custOrders.map(o => o.data_criacao).filter(Boolean).sort()
        const lastDate = dates[dates.length - 1]

        customerMetrics.push({
          customer_id: custId,
          customer_name: first.cliente_nome || null,
          customer_email: first.cliente_email || null,
          customer_phone: first.cliente_telefone || null,
          customer_doc: first.cliente_cpf_cnpj || null,
          last_order_date: lastDate,
          orders_count: custOrders.length,
          revenue_total: totalRevenue,
          order_dates: dates,
        })
      }
    } else {
      return new Response(JSON.stringify({ error: 'Invalid source_type' }), { status: 400, headers: corsHeaders })
    }

    if (customerMetrics.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        total_processed: 0, 
        segments: {},
        message: 'Nenhum cliente com pedidos pagos encontrado nos últimos 12 meses' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Calculate metrics
    const recencyValues = customerMetrics.map(c => {
      const lastDate = new Date(c.last_order_date)
      return Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
    })
    // frequencyValues and monetaryValues no longer needed — scores computed inline via threshold functions

    // Calculate scores using absolute thresholds
    // Build upsert records
    const records = customerMetrics.map((c, i) => {
      const recencyDays = recencyValues[i]
      const r = scoreRecency(recencyDays)
      const f = scoreFrequency(c.orders_count)
      const m = scoreMonetary(c.revenue_total)
      const aov = c.orders_count > 0 ? c.revenue_total / c.orders_count : 0

      // Calculate avg interval and std deviation between orders
      let avgInterval: number | null = null
      let stdDevInterval: number | null = null
      let intervals: number[] = []
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

      // === LTV & Churn probability ===
      const firstPurchaseDate = c.order_dates[0]?.slice(0, 10) ?? null
      let ltv_predicted_12m = 0
      if (firstPurchaseDate) {
        const tenureMonths = Math.max(1, (now.getTime() - new Date(firstPurchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
        ltv_predicted_12m = Math.round((c.revenue_total / tenureMonths) * 12 * 100) / 100
      }
      const churn_probability = Math.round(
        Math.min(1, avgInterval && avgInterval > 0 ? recencyDays / (avgInterval * 2.5) : recencyDays / 180) * 100
      ) / 100

      // === PHASE 9: Predictive repurchase ===
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

        // Calculate probability using exponential decay model
        // P(purchase within D days) based on how overdue or early
        const sigma = stdDevInterval || (avgInterval * 0.3) // fallback: 30% of avg
        const daysSinceLastOrder = recencyDays

        const calcProb = (windowDays: number): number => {
          const daysUntilWindow = daysSinceLastOrder + windowDays
          // How many "average intervals" does this window cover from last order?
          // If daysUntilWindow >= avgInterval, probability is high
          const zScore = (avgInterval! - daysUntilWindow) / Math.max(sigma, 1)
          // Simple sigmoid approximation for cumulative probability
          const prob = 1 / (1 + Math.exp(zScore * 1.5))
          return Math.round(Math.min(99, Math.max(1, prob * 100)) * 10) / 10
        }

        purchase_probability_7d = calcProb(7)
        purchase_probability_15d = calcProb(15)
        purchase_probability_30d = calcProb(30)

        // Ideal offer window: start before predicted date, end at predicted + buffer
        const daysUntilPredicted = Math.max(0, Math.floor((predictedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        const buffer = Math.round(sigma || avgInterval * 0.2)
        ideal_offer_window_start = Math.max(0, daysUntilPredicted - Math.round(buffer * 0.5))
        ideal_offer_window_end = daysUntilPredicted + buffer
      }

      return {
        tenant_id: tenantId,
        integration_id,
        source_type,
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        customer_email: c.customer_email,
        customer_phone: c.customer_phone,
        customer_doc: c.customer_doc,
        last_order_date: c.last_order_date,
        recency_days: recencyDays,
        orders_count: c.orders_count,
        revenue_total: c.revenue_total,
        aov: Math.round(aov * 100) / 100,
        avg_order_interval_days: avgInterval ? Math.round(avgInterval * 100) / 100 : null,
        r_score: r,
        f_score: f,
        m_score: m,
        rfm_score: `${r}${f}${m}`,
        segment_name: segment.name,
        segment_action: segment.action,
        churn_risk: churnRisk,
        first_purchase_date: firstPurchaseDate,
        ltv_predicted_12m,
        churn_probability,
        predicted_next_purchase_date,
        purchase_probability_7d,
        purchase_probability_15d,
        purchase_probability_30d,
        ideal_offer_window_start,
        ideal_offer_window_end,
        reference_date: referenceDate,
        updated_at: new Date().toISOString(),
      }
    })

    // Delete old snapshots for this integration/date in batches to avoid statement timeout
    async function batchDelete(table: string, integId: string, refDate: string) {
      let totalDeleted = 0
      while (true) {
        const { data: ids, error: selErr } = await supabaseAdmin
          .from(table)
          .select('id')
          .eq('integration_id', integId)
          .eq('reference_date', refDate)
          .limit(200)
        if (selErr) {
          log.error(`[RFM] batchDelete select error on ${table}:`, selErr)
          throw selErr
        }
        if (!ids || ids.length === 0) break
        const idList = ids.map((r: Record<string, unknown>) => r.id)
        const { error: delErr } = await supabaseAdmin
          .from(table)
          .delete()
          .in('id', idList)
        if (delErr) {
          log.error(`[RFM] batchDelete delete error on ${table}:`, delErr)
          throw delErr
        }
        totalDeleted += idList.length
      }
      log.info(`[RFM] Deleted ${totalDeleted} rows from ${table}`)
    }
    
    log.info(`[RFM] Starting delete of old snapshots...`)
    await batchDelete('customer_rfm_snapshots', integration_id, referenceDate)
    log.info(`[RFM] Starting insert of ${records.length} records...`)

    // Insert in batches of 100 to avoid statement timeout
    const batchSize = 100
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error: insertErr } = await supabaseAdmin
        .from('customer_rfm_snapshots')
        .insert(batch)
      if (insertErr) {
        log.error(`[RFM] Insert error at batch ${i}:`, insertErr)
        throw insertErr
      }
    }

    log.info(`[RFM] Inserted ${records.length} snapshots successfully`)

    // Build segment summary
    const segmentSummary: Record<string, number> = {}
    for (const r of records) {
      segmentSummary[r.segment_name] = (segmentSummary[r.segment_name] || 0) + 1
    }

    // === Background processing: categories, alerts, audiences ===
    // Use EdgeRuntime.waitUntil to avoid blocking the response
    const backgroundWork = async () => {
      try {
        // === PHASE 7: Category-level RFM ===
        let categoryProcessed = 0
        try {
          const categoryMetrics: CategoryCustomerMetrics[] = []

          if (source_type === 'loja_integrada') {
            const allOrders = (cachedLiOrders || []).map(o => ({ id: o.id, customer_id: o.customer_id, created_at_remote: o.created_at_remote }))

            if (allOrders && allOrders.length > 0) {
              const orderIds = allOrders.map(o => o.id)
              const orderCustomerMap = new Map(allOrders.map(o => [o.id, { customer_id: o.customer_id, date: o.created_at_remote }]))

              const allItems: Record<string, unknown>[] = []
              for (let i = 0; i < orderIds.length; i += 500) {
                const batchIds = orderIds.slice(i, i + 500)
                const { data: items } = await supabaseAdmin
                  .from('li_order_items')
                  .select('order_id, loja_integrada_product_id, name, price, qty')
                  .in('order_id', batchIds)
                if (items) allItems.push(...items)
              }

              const productIds = [...new Set(allItems.map(it => it.loja_integrada_product_id).filter(Boolean))]
              const productCategoryMap = new Map<number, string>()

              for (let i = 0; i < productIds.length; i += 500) {
                const batchPids = productIds.slice(i, i + 500)
                const { data: products } = await supabaseAdmin
                  .from('li_products')
                  .select('loja_integrada_product_id, name, raw_json')
                  .in('loja_integrada_product_id', batchPids)
                if (products) {
                  for (const p of products) {
                    const cats = p.raw_json?.categorias || []
                    if (cats.length > 0) {
                      const catUri = typeof cats[0] === 'string' ? cats[0] : ''
                      const catId = catUri.split('/').pop() || 'sem_categoria'
                      productCategoryMap.set(p.loja_integrada_product_id, `cat_${catId}`)
                    }
                  }
                }
              }

              const custCatGroup = new Map<string, { customer_id: string; customer_name: string | null; category: string; revenue: number; orders: Set<string>; lastDate: string }>()
              const customerNameMap = new Map(customerMetrics.map(c => [c.customer_id, c.customer_name]))

              for (const item of allItems) {
                const orderInfo = orderCustomerMap.get(item.order_id)
                if (!orderInfo || !orderInfo.customer_id) continue
                const category = productCategoryMap.get(item.loja_integrada_product_id) || 'Sem Categoria'
                const key = `${orderInfo.customer_id}::${category}`
                
                if (!custCatGroup.has(key)) {
                  custCatGroup.set(key, {
                    customer_id: orderInfo.customer_id,
                    customer_name: customerNameMap.get(orderInfo.customer_id) || null,
                    category,
                    revenue: 0,
                    orders: new Set(),
                    lastDate: orderInfo.date,
                  })
                }
                const entry = custCatGroup.get(key)!
                entry.revenue += Number(item.price || 0) * Number(item.qty || 1)
                entry.orders.add(item.order_id)
                if (orderInfo.date > entry.lastDate) entry.lastDate = orderInfo.date
              }

              for (const [, data] of custCatGroup) {
                categoryMetrics.push({
                  customer_id: data.customer_id,
                  customer_name: data.customer_name,
                  category_name: data.category,
                  last_order_date: data.lastDate,
                  orders_count: data.orders.size,
                  revenue_total: data.revenue,
                })
              }
            }
          } else if (source_type === 'bling') {
            const paidOrders = cachedBlingPaidOrders || []

            if (paidOrders.length > 0) {
              const orderIds = paidOrders.map(o => o.id)
              const orderInfoMap = new Map(paidOrders.map(o => [o.id, { customer_id: String(o.cliente_id || 'unknown'), customer_name: o.cliente_nome, date: o.data_criacao }]))

              const allItems: Record<string, unknown>[] = []
              for (let i = 0; i < orderIds.length; i += 500) {
                const batchIds = orderIds.slice(i, i + 500)
                const { data: items } = await supabaseAdmin
                  .from('bling_order_items')
                  .select('order_id, produto_id, produto_nome, valor_total, quantidade')
                  .in('order_id', batchIds)
                if (items) allItems.push(...items)
              }

              const productIds = [...new Set(allItems.map(it => it.produto_id).filter(Boolean))]
              const productCategoryMap = new Map<number, string>()

              for (let i = 0; i < productIds.length; i += 500) {
                const batchPids = productIds.slice(i, i + 500)
                const { data: products } = await supabaseAdmin
                  .from('bling_products')
                  .select('bling_id, categoria_nome')
                  .in('bling_id', batchPids)
                if (products) {
                  for (const p of products) {
                    if (p.categoria_nome) {
                      productCategoryMap.set(p.bling_id, p.categoria_nome)
                    }
                  }
                }
              }

              const custCatGroup = new Map<string, { customer_id: string; customer_name: string | null; category: string; revenue: number; orders: Set<string>; lastDate: string }>()

              for (const item of allItems) {
                const orderInfo = orderInfoMap.get(item.order_id)
                if (!orderInfo || orderInfo.customer_id === 'unknown') continue
                const category = productCategoryMap.get(item.produto_id) || 'Sem Categoria'
                const key = `${orderInfo.customer_id}::${category}`
                
                if (!custCatGroup.has(key)) {
                  custCatGroup.set(key, {
                    customer_id: orderInfo.customer_id,
                    customer_name: orderInfo.customer_name,
                    category,
                    revenue: 0,
                    orders: new Set(),
                    lastDate: orderInfo.date,
                  })
                }
                const entry = custCatGroup.get(key)!
                entry.revenue += Number(item.valor_total || 0)
                entry.orders.add(item.order_id)
                if (orderInfo.date > entry.lastDate) entry.lastDate = orderInfo.date
              }

              for (const [, data] of custCatGroup) {
                categoryMetrics.push({
                  customer_id: data.customer_id,
                  customer_name: data.customer_name,
                  category_name: data.category,
                  last_order_date: data.lastDate,
                  orders_count: data.orders.size,
                  revenue_total: data.revenue,
                })
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
                  catRecords.push({
                    tenant_id: tenantId, integration_id, source_type,
                    customer_id: cm.customer_id, customer_name: cm.customer_name,
                    category_name: catName, last_order_date: cm.last_order_date,
                    recency_days: recencyDays, orders_count: cm.orders_count,
                    revenue_total: Math.round(cm.revenue_total * 100) / 100,
                    aov: Math.round(aov * 100) / 100,
                    r_score: 3, f_score: 3, m_score: 3, rfm_score: '333',
                    segment_name: segment.name, reference_date: referenceDate,
                  })
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

                catRecords.push({
                  tenant_id: tenantId, integration_id, source_type,
                  customer_id: cm.customer_id, customer_name: cm.customer_name,
                  category_name: catName, last_order_date: cm.last_order_date,
                  recency_days: recencyDays, orders_count: cm.orders_count,
                  revenue_total: Math.round(cm.revenue_total * 100) / 100,
                  aov: Math.round(aov * 100) / 100,
                  r_score: r, f_score: f, m_score: m,
                  rfm_score: `${r}${f}${m}`,
                  segment_name: segment.name, reference_date: referenceDate,
                })
              })
            }

            await batchDelete('customer_rfm_category_snapshots', integration_id, referenceDate)

            for (let i = 0; i < catRecords.length; i += batchSize) {
              const batch = catRecords.slice(i, i + batchSize)
              const { error: catInsertErr } = await supabaseAdmin
                .from('customer_rfm_category_snapshots')
                .insert(batch)
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
          const { data: prevDates } = await supabaseAdmin
            .from('customer_rfm_snapshots')
            .select('reference_date')
            .eq('integration_id', integration_id)
            .neq('reference_date', referenceDate)
            .order('reference_date', { ascending: false })
            .limit(1)

          if (prevDates && prevDates.length > 0) {
            const prevDate = prevDates[0].reference_date

            const { data: prevSnapshots } = await supabaseAdmin
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
                alerts.push({
                  tenant_id: tenantId, integration_id,
                  alert_type: 'champions_drop',
                  title: `Campeões caíram ${dropPct}%`,
                  description: `De ${prevChampions} para ${currChampions} clientes campeões desde ${prevDate}.`,
                  severity: dropPct >= 20 ? 'critical' : 'warning',
                  reference_date: referenceDate,
                  metadata: { prev_count: prevChampions, curr_count: currChampions, drop_pct: dropPct },
                })
              }

              const currHighValueAtRisk = segmentSummary['Alto Valor em Risco'] || 0
              if (currHighValueAtRisk > prevHighValueAtRisk && currHighValueAtRisk >= 3) {
                alerts.push({
                  tenant_id: tenantId, integration_id,
                  alert_type: 'high_value_at_risk',
                  title: `${currHighValueAtRisk} clientes alto valor em risco`,
                  description: `Aumento de ${prevHighValueAtRisk} para ${currHighValueAtRisk} clientes de alto valor em risco.`,
                  severity: 'critical',
                  reference_date: referenceDate,
                  metadata: { prev_count: prevHighValueAtRisk, curr_count: currHighValueAtRisk },
                })
              }

              const currRepurchase = records.filter(r => r.orders_count > 1).length
              const prevRate = prevSnapshots.length > 0 ? (prevRepurchase / prevSnapshots.length * 100) : 0
              const currRate = records.length > 0 ? (currRepurchase / records.length * 100) : 0
              if (prevRate > 0 && currRate < prevRate - 3) {
                alerts.push({
                  tenant_id: tenantId, integration_id,
                  alert_type: 'repurchase_drop',
                  title: `Taxa de recompra caiu ${(prevRate - currRate).toFixed(1)}%`,
                  description: `Taxa de 2ª compra caiu de ${prevRate.toFixed(1)}% para ${currRate.toFixed(1)}%.`,
                  severity: 'warning',
                  reference_date: referenceDate,
                  metadata: { prev_rate: prevRate, curr_rate: currRate },
                })
              }

              if (alerts.length > 0) {
                await supabaseAdmin
                  .from('rfm_alerts')
                  .delete()
                  .eq('integration_id', integration_id)
                  .eq('reference_date', referenceDate)

                await supabaseAdmin.from('rfm_alerts').insert(alerts)
                log.info(`[RFM] Generated ${alerts.length} alerts`)
              }
            }
          }
        } catch (alertErr) {
          log.error('[RFM] Alert generation error (non-fatal):', alertErr)
        }

        // === PHASE 6: Recalculate dynamic audiences ===
        try {
          const { data: audiences } = await supabaseAdmin
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

              const totalRevenue = members.reduce((sum, m) => sum + m.revenue_total, 0)

              await supabaseAdmin
                .from('rfm_audiences')
                .update({
                  member_count: members.length,
                  total_revenue: totalRevenue,
                  last_calculated_at: new Date().toISOString(),
                })
                .eq('id', aud.id)

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

    // Start background work without blocking the response
    // @ts-ignore - EdgeRuntime.waitUntil is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(backgroundWork())
    } else {
      // Fallback: fire and forget
      backgroundWork().catch(err => log.error('[RFM] Background error:', err))
    }

    return new Response(JSON.stringify({
      success: true,
      total_processed: records.length,
      segments: segmentSummary,
      reference_date: referenceDate,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    log.error('RFM Calculator error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
