/**
 * Loja Integrada Coupon Sync + Order Notification Helpers
 * Extracted from li-job-processor/index.ts.
 *
 * NOTE: previously also contained syncAbandonedCarts/updateExistingCarts.
 * The abandoned-cart feature was retired (LI does not expose a real
 * abandoned-cart endpoint), so those helpers were removed alongside the
 * abandoned_cart_* tables.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "./correlation.ts";
const log = createLogger("li-sync-carts", "shared");

type ServiceClient = ReturnType<typeof createClient>;

const LI_API_BASE = "https://api.awsli.com.br/v1";

export async function syncCoupons(
  supabase: ServiceClient,
  authHeader: string,
  tenantId: string | null,
  integrationId: string
): Promise<{ success: boolean; synced: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  let updated = 0;

  try {
    // Fetch coupons from API (limit to recent 200 for incremental sync)
    const response = await fetch(`${LI_API_BASE}/cupom?limit=200&offset=0`, {
      headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const coupons = data.objects || [];
    log.info(`[COUPONS] Fetched ${coupons.length} coupons from API`);

    if (coupons.length === 0) {
      return { success: true, synced: 0, updated: 0, errors: [] };
    }

    // Get existing coupons by code
    const couponCodes = coupons.map((c: Record<string, unknown>) => c.codigo);
    const { data: existingCoupons } = await supabase
      .from('generated_coupons')
      .select('coupon_code, li_coupon_id, li_quantidade_usada')
      .eq('integration_id', integrationId)
      .in('coupon_code', couponCodes);

    const existingMap = new Map(
      (existingCoupons || []).map((c: Record<string, unknown>) => [c.coupon_code, c])
    );

    for (const coupon of coupons) {
      try {
        const existing = existingMap.get(coupon.codigo);

        // Map coupon data
        let discountPercentage = 0;
        let couponValue: number | null = null;

        if (coupon.tipo === 'porcentagem') {
          discountPercentage = coupon.valor || 0;
        } else if (coupon.tipo === 'valor_absoluto') {
          couponValue = coupon.valor || 0;
        }

        const dataFim = coupon.data_fim ? new Date(coupon.data_fim).toISOString() : null;

        if (existing) {
          // ALWAYS update existing coupons with ALL fields from API
          const dataInicio = coupon.data_inicio ? new Date(coupon.data_inicio).toISOString() : null;

          // FIX: Track when coupon is used - set used_at if quantidade_usada increased
          const existingData = existing as { li_quantidade_usada?: number };
          const previousUsage = existingData.li_quantidade_usada || 0;
          const currentUsage = coupon.quantidade_usada || 0;
          const wasJustUsed = currentUsage > previousUsage;

          const updateData: Record<string, unknown> = {
            // Discount values
            discount_percentage: discountPercentage,
            coupon_value: couponValue,
            coupon_type: coupon.tipo,
            coupon_description: coupon.descricao || null,
            // Usage tracking
            li_quantidade_usada: currentUsage,
            li_quantidade_uso_maximo: coupon.quantidade_uso_maximo || null,
            // Dates
            li_data_inicio: dataInicio,
            li_data_fim: dataFim,
            expires_at: dataFim || null,
            // Active status
            is_active: coupon.ativo !== false,
            // Sync timestamp
            synced_at: new Date().toISOString()
          };

          // Set used_at if coupon was just used (and not already set)
          if (wasJustUsed) {
            log.info(`[COUPONS] Coupon ${coupon.codigo} was used! Usage: ${previousUsage} -> ${currentUsage}`);
            updateData.used_at = new Date().toISOString();
          }

          await supabase
            .from('generated_coupons')
            .update(updateData)
            .eq('coupon_code', coupon.codigo)
            .eq('integration_id', integrationId);
          updated++;
        } else {
          // Insert new coupon
          const dataInicio = coupon.data_inicio ? new Date(coupon.data_inicio).toISOString() : null;

          const { error: insertError } = await supabase
            .from('generated_coupons')
            .insert({
              tenant_id: tenantId,
              integration_id: integrationId,
              coupon_code: coupon.codigo,
              discount_percentage: discountPercentage,
              coupon_value: couponValue,
              li_coupon_id: coupon.id,
              source: 'imported',
              coupon_type: coupon.tipo,
              coupon_description: coupon.descricao || null,
              li_data_inicio: dataInicio,
              li_data_fim: dataFim,
              li_quantidade_uso_maximo: coupon.quantidade_uso_maximo || null,
              li_quantidade_usada: coupon.quantidade_usada || 0,
              expires_at: dataFim || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            });

          if (!insertError) {
            synced++;
            log.info(`[COUPONS] ✓ Imported: ${coupon.codigo}`);
          } else if (insertError.code !== '23505') {
            errors.push(`Coupon ${coupon.codigo}: ${insertError.message}`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Coupon ${coupon.codigo}: ${msg}`);
      }
    }

    log.info(`[COUPONS] Sync complete: ${synced} new, ${updated} updated`);
    return { success: true, synced, updated, errors };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('[COUPONS] Sync error:', msg);
    return { success: false, synced: 0, updated: 0, errors: [msg] };
  }
}

// Process order notifications when status changes during sync
export async function processOrderNotificationsInJob(
  supabase: ServiceClient,
  apiOrder: Record<string, unknown>,
  dbOrder: Record<string, unknown>,
  statusName: string,
  tenantId: string,
  integrationId: string
): Promise<void> {
  try {
    const orderRowId = dbOrder?.id;
    if (!orderRowId) {
      log.warn(`[ORDER-NOTIFICATION] Missing dbOrder.id (UUID) for order #${dbOrder?.numero}. Skipping queue insert to avoid UUID errors.`);
      return;
    }

    // GUARD: Skip notifications for old orders (created more than 7 days ago)
    const orderCreatedAt = dbOrder.created_at_remote || dbOrder.created_at;
    if (orderCreatedAt) {
      const orderDate = new Date(orderCreatedAt);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (orderDate < sevenDaysAgo) {
        log.info(`[ORDER-NOTIFICATION] ⏭️ Skipping order #${dbOrder.numero} - created at ${orderCreatedAt} is older than 7 days`);
        return;
      }
    }

    log.info(`[ORDER-NOTIFICATION] Checking notifications for order #${dbOrder.numero} status: "${statusName}" integration: ${integrationId}`);

    // Get active notification configs for this tenant AND this specific integration
    const { data: configs } = await supabase
      .from('order_notification_configs')
      .select('id, integration_id, whatsapp_integration_id, email_integration_id, send_via_whatsapp, send_via_email')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('integration_id', integrationId);

    if (!configs || configs.length === 0) {
      log.info(`[ORDER-NOTIFICATION] No active configs found for integration ${integrationId}`);
      return;
    }

    for (const config of configs) {
      // Get matching rules for this status
      const { data: rules } = await supabase
        .from('order_notification_status_rules')
        .select('id, config_id, status_name, message_template, is_enabled, delay_minutes')
        .eq('config_id', config.id)
        .eq('is_enabled', true)
        .eq('status_name', statusName);

      if (!rules || rules.length === 0) {
        continue;
      }

      log.info(`[ORDER-NOTIFICATION] Found ${rules.length} matching rules for status "${statusName}"`);

      for (const rule of rules) {
        // Check for duplicate execution
        const { data: existing } = await supabase
          .from('order_notification_executions')
          .select('id')
          .eq('order_number', String(dbOrder.numero))
          .eq('rule_id', rule.id)
          .maybeSingle();

        if (existing) {
          log.info(`[ORDER-NOTIFICATION] Already sent for order #${dbOrder.numero}, rule ${rule.id}`);
          continue;
        }

        // Get customer info from DB order or API order
        let customerName = dbOrder.cliente_nome || 'Cliente';
        let customerPhone = dbOrder.cliente_telefone || '';
        let customerEmail = dbOrder.cliente_email || '';
        const orderTotal = dbOrder.valor_total || apiOrder.valor_total || 0;

        // Resolve tracking code from multiple sources:
        // 1. dbOrder.codigo_rastreio (from raw_json)
        // 2. shipping_json.tracking_code (from li_orders)
        // 3. apiOrder.codigo_rastreio (from LI API)
        // 4. me_shipments tracking_code (from Melhor Envio)
        let trackingCode = dbOrder.codigo_rastreio || '';

        // Try shipping_json if available
        if (!trackingCode && dbOrder.shipping_json) {
          const shippingJson = typeof dbOrder.shipping_json === 'string'
            ? JSON.parse(dbOrder.shipping_json)
            : dbOrder.shipping_json;
          trackingCode = shippingJson?.tracking_code || '';
        }

        // Try raw_json
        if (!trackingCode && dbOrder.raw_json) {
          const rawJson = typeof dbOrder.raw_json === 'string'
            ? JSON.parse(dbOrder.raw_json)
            : dbOrder.raw_json;
          trackingCode = rawJson?.codigo_rastreio || '';
        }

        // Try API order
        if (!trackingCode) {
          trackingCode = apiOrder.codigo_rastreio || '';
        }

        // Last resort: check me_shipments for tracking code
        if (!trackingCode && orderRowId) {
          const { data: meShipment } = await supabase
            .from('me_shipments')
            .select('tracking_code')
            .eq('li_order_id', orderRowId)
            .not('tracking_code', 'is', null)
            .limit(1)
            .maybeSingle();
          if (meShipment?.tracking_code) {
            trackingCode = meShipment.tracking_code;
          }
        }

        // Try to get from API if available
        if (apiOrder.cliente && typeof apiOrder.cliente === 'object') {
          customerName = apiOrder.cliente.nome || customerName;
          customerPhone = apiOrder.cliente.telefone_celular || apiOrder.cliente.telefone_principal || customerPhone;
          customerEmail = apiOrder.cliente.email || customerEmail;
        }

        // Format message with CORRECT Portuguese placeholders
        const firstName = customerName.split(' ')[0];
        const formattedTotal = parseFloat(orderTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        // Build product list for {{produtos}} placeholder
        let productList = '';
        if (orderRowId) {
          const { data: orderItems } = await supabase
            .from('li_order_items')
            .select('name, qty, price')
            .eq('order_id', orderRowId);
          if (orderItems && orderItems.length > 0) {
            productList = orderItems.map((item: Record<string, unknown>) => {
              const qty = Number(item.qty) || 1;
              const price = Number(item.price) || 0;
              const formattedPrice = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              return `• ${qty}x ${item.name} - ${formattedPrice}`;
            }).join('\n');
          }
        }

        let message = rule.message_template || '';
        message = message.replace(/\{\{cliente_primeiro_nome\}\}/g, firstName);
        message = message.replace(/\{\{cliente_nome\}\}/g, customerName);
        message = message.replace(/\{\{numero_pedido\}\}/g, String(dbOrder.numero));
        message = message.replace(/\{\{status\}\}/g, statusName);
        message = message.replace(/\{\{valor_total\}\}/g, formattedTotal);
        message = message.replace(/\{\{rastreamento\}\}/g, trackingCode || 'N/A');
        message = message.replace(/\{\{produtos\}\}/g, productList || 'N/A');
        // Legacy placeholders
        message = message.replace(/\{\{customer_name\}\}/g, customerName);
        message = message.replace(/\{\{order_number\}\}/g, String(dbOrder.numero));
        message = message.replace(/\{\{tracking_code\}\}/g, trackingCode || 'N/A');

        log.info(`[ORDER-NOTIFICATION] Prepared message for order #${dbOrder.numero}`);

        // Send via message queue for reliability
        if (config.send_via_whatsapp && customerPhone && config.whatsapp_integration_id) {
          // Format phone number
          let formattedPhone = customerPhone.replace(/\D/g, '');
          if (!formattedPhone.startsWith('55')) {
            formattedPhone = '55' + formattedPhone;
          }

          // Calculate next_retry_at based on delay_minutes from rule
          const delayMinutes = rule.delay_minutes || 0;
          const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);

          // Insert into message queue with expected_status for pre-send validation
          const { error: queueError } = await supabase.from('message_queue').insert({
            tenant_id: tenantId,
            channel: 'whatsapp',
            recipient: formattedPhone,
            message_content: message,
            whatsapp_integration_id: config.whatsapp_integration_id,
            reference_type: 'order_notification',
            // message_queue.reference_id is UUID in DB
            reference_id: orderRowId,
            status: 'pending',
            next_retry_at: nextRetryAt.toISOString(),
            metadata: {
              expected_status: statusName,
              order_number: String(dbOrder.numero),
              delay_minutes: delayMinutes
            }
          });

          if (queueError) {
            log.error(`[ORDER-NOTIFICATION] Queue error:`, queueError);
          }

          // Log execution
          await supabase.from('order_notification_executions').insert({
            tenant_id: tenantId,
            config_id: config.id,
            rule_id: rule.id,
            order_number: String(dbOrder.numero),
            order_id: String(apiOrder.id || dbOrder.li_id),
            status_name: statusName,
            channel: 'whatsapp',
            customer_phone: formattedPhone,
            message_sent: message,
            status: 'pending'
          });

          log.info(`[ORDER-NOTIFICATION] ✓ Queued WhatsApp for order #${dbOrder.numero}`);
        }

        // Send via email if configured
        if (config.send_via_email && customerEmail && config.email_integration_id) {
          const subject = rule.email_subject || `Atualização do Pedido #${dbOrder.numero}`;
          const htmlBody = rule.email_body || `<p>${message}</p>`;

          // Process email template placeholders
          let processedSubject = subject
            .replace(/\{\{numero_pedido\}\}/g, String(dbOrder.numero))
            .replace(/\{\{status\}\}/g, statusName);

          let processedBody = htmlBody
            .replace(/\{\{cliente_primeiro_nome\}\}/g, firstName)
            .replace(/\{\{cliente_nome\}\}/g, customerName)
            .replace(/\{\{numero_pedido\}\}/g, String(dbOrder.numero))
            .replace(/\{\{status\}\}/g, statusName)
            .replace(/\{\{valor_total\}\}/g, formattedTotal)
            .replace(/\{\{rastreamento\}\}/g, trackingCode || 'N/A')
            .replace(/\{\{produtos\}\}/g, productList ? productList.replace(/\n/g, '<br>') : 'N/A');

          // Calculate next_retry_at based on delay_minutes from rule
          const emailDelayMinutes = rule.delay_minutes || 0;
          const emailNextRetryAt = new Date(Date.now() + emailDelayMinutes * 60 * 1000);

          // Insert into message queue for email with expected_status
          await supabase.from('message_queue').insert({
            tenant_id: tenantId,
            channel: 'email',
            recipient: customerEmail,
            message_content: processedBody,
            subject: processedSubject,
            html_content: processedBody,
            email_integration_id: config.email_integration_id,
            reference_type: 'order_notification',
            // message_queue.reference_id is UUID in DB
            reference_id: orderRowId,
            status: 'pending',
            next_retry_at: emailNextRetryAt.toISOString(),
            metadata: {
              expected_status: statusName,
              order_number: String(dbOrder.numero),
              delay_minutes: emailDelayMinutes
            }
          });

          // Log execution
          await supabase.from('order_notification_executions').insert({
            tenant_id: tenantId,
            config_id: config.id,
            rule_id: rule.id,
            order_number: String(dbOrder.numero),
            order_id: String(apiOrder.id || dbOrder.li_id),
            status_name: statusName,
            channel: 'email',
            customer_email: customerEmail,
            message_sent: processedBody,
            status: 'pending'
          });

          log.info(`[ORDER-NOTIFICATION] ✓ Queued Email for order #${dbOrder.numero}`);
        }
      }
    }
  } catch (error) {
    log.error('[ORDER-NOTIFICATION] Error:', error);
  }
}
