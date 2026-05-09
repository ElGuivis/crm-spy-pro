/**
 * Explicit column lists for select() queries.
 * Replaces select('*') to reduce data exposure and improve query performance.
 */

/** ai_agents — all columns used by AIAgentRecord */
export const AI_AGENT_COLUMNS = [
  'id', 'tenant_id', 'name', 'system_prompt', 'model', 'temperature', 'max_tokens',
  'ai_provider', 'agent_type', 'is_active', 'welcome_message',
  'human_transfer_column_id', 'transfer_keywords', 'interactive_buttons',
  'data_access', 'keyword_action_rules', 'agent_transfer_rules',
  'inactivity_enabled', 'inactivity_timeout_minutes', 'inactivity_message', 'inactivity_target_column_id',
  'order_verification_enabled', 'order_verification_mode', 'order_verification_messages',
  'verification_type', 'after_verified_column_id', 'cpf_max_attempts_column_id',
  'order_not_found_column_id', 'store_integration_id', 'order_details_template',
  'tracking_link_base', 'message_buffer_enabled', 'message_buffer_delay_seconds',
].join(', ');

/** contacts — fields used in webhook and chat processing */
export const CONTACT_COLUMNS = [
  'id', 'tenant_id', 'phone', 'name', 'email', 'metadata',
  'li_customer_id', 'created_at', 'updated_at',
].join(', ');

/** conversations — fields used in webhook and chat processing */
export const CONVERSATION_COLUMNS = [
  'id', 'tenant_id', 'contact_id', 'channel_id', 'inbox_id', 'status',
  'assigned_to', 'kanban_column_id', 'current_ai_agent_id',
  'ai_enabled', 'handoff_mode', 'awaiting_phone_input',
  'chatwoot_conversation_id', 'bot_state_json',
  'last_message_at', 'last_outbound_at', 'last_incoming_message_id',
  'integration_id', 'verification_data', 'verification_state',
  'lead_capture_state', 'lead_capture_data',
  'buffered_message_ids', 'pending_ai_response_at',
  'source',
  'created_at', 'updated_at',
].join(', ');

/** receptionist_configs — all columns used in webhook */
export const RECEPTIONIST_CONFIG_COLUMNS = [
  'id', 'tenant_id', 'is_active', 'greeting_message', 'menu_options',
  'menu_type', 'menu_trigger_keywords', 'outside_hours_message',
  'business_hours', 'timezone', 'lead_capture_enabled',
  'lead_capture_name_message', 'lead_capture_phone_message',
  'lead_capture_email_message', 'lead_capture_complete_message',
  'lead_capture_require_email',
  'created_at', 'updated_at',
].join(', ');

/** me_shipments — fields used in order verification */
export const ME_SHIPMENT_COLUMNS = [
  'id', 'tenant_id', 'integration_id', 'external_order_number',
  'tracking_code', 'status', 'carrier', 'service_name',
  'delivered_at', 'estimated_delivery', 'tracking_events',
  'li_order_id', 'bling_order_id',
  'created_at', 'updated_at',
].join(', ');

/** generated_coupons — fields used in ai-chat context */
export const COUPON_COLUMNS = [
  'id', 'tenant_id', 'code', 'discount_type', 'discount_value',
  'customer_phone', 'customer_name', 'expires_at', 'used_at',
  'created_at',
].join(', ');

/** bling_orders — fields used in order lookups */
export const BLING_ORDER_COLUMNS = [
  'id', 'tenant_id', 'integration_id', 'bling_id', 'numero',
  'data_criacao', 'data_modificacao', 'situacao_id', 'situacao_nome',
  'valor_total', 'valor_frete', 'valor_desconto', 'valor_produtos',
  'forma_pagamento', 'forma_envio', 'custo_frete',
  'cliente_nome', 'cliente_telefone', 'cliente_cpf_cnpj', 'cliente_email', 'cliente_id',
  'endereco_entrega', 'etiqueta', 'volumes',
  'loja_nome', 'observacoes', 'transportador_nome',
].join(', ');

/** li_orders — fields used in order lookups */
export const LI_ORDER_COLUMNS = [
  'id', 'tenant_id', 'integration_id', 'order_number',
  'loja_integrada_order_id',
  'status_id', 'status_name',
  'created_at_remote', 'updated_at_remote',
  'totals_json', 'shipping_json', 'payment_json', 'items_json',
  'raw_json', 'customer_id',
  'updated_at_local', 'last_status_check_at',
].join(', ');

/** Order items — bling_order_items */
export const BLING_ORDER_ITEM_COLUMNS = [
  'id', 'order_id', 'tenant_id', 'produto_nome', 'quantidade',
  'valor_unitario', 'valor_total', 'desconto', 'sku',
].join(', ');

/** Order items — li_order_items */
export const LI_ORDER_ITEM_COLUMNS = [
  'id', 'order_id', 'tenant_id', 'name', 'qty', 'price',
  'produto_nome', 'quantidade', 'preco_subtotal', 'valor_total', 'sku',
].join(', ');

/** Products — bling_products */
export const BLING_PRODUCT_COLUMNS = [
  'id', 'tenant_id', 'integration_id', 'nome', 'codigo', 'preco',
  'preco_custo', 'estoque_atual', 'situacao', 'categoria_nome',
  'imagem_url', 'descricao_curta',
].join(', ');

/** Products — li_products */
export const LI_PRODUCT_COLUMNS = [
  'id', 'tenant_id', 'integration_id', 'nome', 'ativo', 'destaque',
  'preco_cheio', 'preco_promocional', 'estoque_quantidade',
  'categoria_nome', 'imagem_url',
].join(', ');

/** Customers — bling_customers */
export const BLING_CUSTOMER_COLUMNS = [
  'id', 'tenant_id', 'integration_id', 'nome', 'cpf_cnpj',
  'celular', 'telefone', 'email', 'endereco',
  'data_nascimento', 'sexo',
].join(', ');

/** Customers — li_customers */
export const LI_CUSTOMER_COLUMNS = [
  'id', 'tenant_id', 'integration_id', 'nome', 'name', 'cpf', 'doc',
  'telefone_celular', 'phone', 'email',
  'endereco_logradouro', 'endereco_numero', 'endereco_bairro',
  'endereco_cidade', 'endereco_estado', 'endereco_cep',
  'data_nascimento',
].join(', ');

/**
 * Returns the appropriate column list for a dynamic store table.
 * Use with storeInfo.tables.* queries to avoid select('*').
 */
export function getStoreColumns(tableName: string): string {
  const map: Record<string, string> = {
    'bling_orders': BLING_ORDER_COLUMNS,
    'li_orders': LI_ORDER_COLUMNS,
    'bling_order_items': BLING_ORDER_ITEM_COLUMNS,
    'li_order_items': LI_ORDER_ITEM_COLUMNS,
    'bling_products': BLING_PRODUCT_COLUMNS,
    'li_products': LI_PRODUCT_COLUMNS,
    'bling_customers': BLING_CUSTOMER_COLUMNS,
    'li_customers': LI_CUSTOMER_COLUMNS,
  };
  return map[tableName] || '*';
}
