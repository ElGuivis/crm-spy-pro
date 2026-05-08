/**
 * Melhor Envio Helpers
 * Pure utility functions extracted from melhor-envio/index.ts for maintainability.
 */

/** Raw ME order/shipment data (loosely typed for external API) */
interface MEOrderRaw {
  id?: string | number;
  tags?: Array<{ tag?: string } | string>;
  reminder?: string;
  reference?: string;
  external_id?: string;
  products?: Array<{ sku?: string; [key: string]: unknown }>;
  order_number?: string | number;
  order_id?: string | number;
  to?: MEAddress;
  from?: MEAddress;
  invoice?: Record<string, unknown>;
  volumes?: Array<Record<string, unknown>>;
  customer?: { document?: string; cpf?: string; cnpj?: string; [key: string]: unknown };
  recipient?: { document?: string; [key: string]: unknown };
  destinatario?: { cpf_cnpj?: string; [key: string]: unknown };
  recipient_document?: string;
  customer_document?: string;
  additional_info?: { document?: string; cpf?: string; [key: string]: unknown };
  status?: string;
  tracking?: string;
  protocol?: string;
  price?: number;
  discount?: number;
  format?: string;
  weight?: number;
  height?: number;
  width?: number;
  length?: number;
  dimensions?: Record<string, unknown>;
  insurance_value?: number;
  receipt?: boolean;
  own_hand?: boolean;
  collect?: boolean;
  posted_at?: string;
  delivered_at?: string;
  canceled_at?: string;
  expired_at?: string;
  generated_at?: string;
  paid_at?: string;
  delivery_min?: number;
  delivery_max?: number;
  service?: {
    name?: string;
    type?: string;
    range?: string;
    company?: { name?: string; picture?: string; tracking_link?: string };
  };
  print?: { url?: string };
  preview?: { url?: string };
  authorization_code?: string;
  quote?: unknown;
  agency?: { name?: string; address?: string };
  cte_key?: string;
  contract?: unknown;
  billed_weight?: number;
  non_commercial?: boolean;
  conciliation?: { billed_weight?: number; [key: string]: unknown };
  details?: unknown;
  [key: string]: unknown;
}

interface MEAddress {
  name?: string;
  phone?: string;
  email?: string;
  document?: string;
  company_document?: string;
  cpf?: string;
  cnpj?: string;
  cpf_cnpj?: string;
  documento?: string;
  tax_id?: string;
  recipient_document?: string;
  sender_document?: string;
  note?: string;
  city?: string;
  state?: string;
  state_abbr?: string;
  address?: string;
  number?: string;
  complement?: string;
  district?: string;
  postal_code?: string;
  [key: string]: unknown;
}

/** Map Melhor Envio status to internal status */
export function mapStatus(meStatus: string): string {
  const statusMap: Record<string, string> = {
    "draft": "pending",
    "pending": "pending",
    "released": "pending",
    "generated": "pending",
    "printed": "posted",
    "posted": "posted",
    "delivered": "delivered",
    "canceled": "canceled",
    "undelivered": "in_transit",
    "returning": "returning",
    "returned": "returned",
    "expired": "expired",
  };
  return statusMap[meStatus] || meStatus || "pending";
}

/** Normalize an order number by stripping common prefixes */
export function normalizeOrderNumber(val: unknown): string | null {
  if (!val) return null;
  const str = String(val).trim().replace(/^[#LI\-\s]+/gi, '').trim();
  if (/^\d+$/.test(str)) return str;
  if (str.length > 0 && str.length < 50) return str;
  return null;
}

/** Extract ecommerce order number from ME order tags/fields */
export function extractEcommerceOrderNumber(raw: MEOrderRaw): string | null {
  const candidates: string[] = [];

  if (Array.isArray(raw?.tags)) {
    for (const t of raw.tags) {
      const tag = typeof t === 'string' ? t : t?.tag;
      if (typeof tag === 'string') {
        const match =
          tag.match(/ecommerce[_\s-]*order[_\s-]*number\s*[:=]\s*([A-Za-z0-9#_-]+)/i) ||
          tag.match(/numero[_\s-]*loja\s*[:=]\s*([A-Za-z0-9#_-]+)/i) ||
          tag.match(/numeroLoja\s*[:=]\s*([A-Za-z0-9#_-]+)/i);
        if (match?.[1]) candidates.push(match[1]);
        candidates.push(tag);
      }
    }
  }

  if (raw?.reminder) candidates.push(raw.reminder);
  if (raw?.reference) candidates.push(raw.reference);
  if (raw?.external_id) candidates.push(raw.external_id);

  if (raw?.products) {
    for (const p of (Array.isArray(raw.products) ? raw.products : [])) {
      if (p?.sku && /^\d+$/.test(String(p.sku))) candidates.push(String(p.sku));
    }
  }

  if (raw?.order_number) candidates.push(String(raw.order_number));
  if (raw?.order_id && /^\d+$/.test(String(raw.order_id))) candidates.push(String(raw.order_id));

  for (const c of candidates) {
    const n = normalizeOrderNumber(c);
    if (n) return n;
  }
  return null;
}

/** Extract CPF/CNPJ document from address/order data */
export function extractDocument(address: MEAddress | null | undefined, order: MEOrderRaw, type: 'receiver' | 'sender'): string | null {
  const candidates: (string | null | undefined)[] = [];
  if (address) {
    candidates.push(
      address.document, address.company_document, address.cpf,
      address.cnpj, address.cpf_cnpj, address.documento, address.tax_id,
      address.recipient_document, address.sender_document
    );
  }
  if (type === 'receiver' && order.invoice) {
    const inv = order.invoice as Record<string, string | undefined>;
    candidates.push(
      inv.recipient_document, inv.customer_document,
      inv.cpf, inv.cnpj, inv.cpf_cnpj
    );
  }
  if (type === 'receiver' && Array.isArray(order.volumes)) {
    for (const vol of order.volumes) {
      const v = vol as Record<string, Record<string, string> | undefined>;
      if (v?.to?.document) candidates.push(v.to.document);
      if (v?.recipient?.document) candidates.push(v.recipient.document);
    }
  }
  if (order.customer?.document) candidates.push(order.customer.document);
  if (order.customer?.cpf) candidates.push(order.customer.cpf);
  if (order.customer?.cnpj) candidates.push(order.customer.cnpj);
  if (order.recipient?.document) candidates.push(order.recipient.document);
  if (order.destinatario?.cpf_cnpj) candidates.push(order.destinatario.cpf_cnpj);
  if (order.recipient_document) candidates.push(order.recipient_document);
  if (order.customer_document) candidates.push(order.customer_document);
  if (order.additional_info?.document) candidates.push(order.additional_info.document);
  if (order.additional_info?.cpf) candidates.push(order.additional_info.cpf);
  for (const doc of candidates) {
    if (doc && typeof doc === 'string') {
      const cleaned = doc.replace(/\D/g, '');
      if (cleaned.length === 11 || cleaned.length === 14) return cleaned;
    }
  }
  return null;
}

/** Build a shipment record from raw ME order data */
export function buildShipmentRecord(
  order: MEOrderRaw,
  liOrderId: string | null,
  tenantId: string,
  integrationId: string,
  blingOrderId?: string | null
): Record<string, unknown> {
  const toAddress = order.to || {} as MEAddress;
  const fromAddress = order.from || {} as MEAddress;

  let estimatedDeliveryAt = null;
  if (order.posted_at && order.delivery_max) {
    const postedDate = new Date(order.posted_at);
    estimatedDeliveryAt = new Date(postedDate.getTime() + order.delivery_max * 24 * 60 * 60 * 1000).toISOString();
  }

  const receiverDocument = extractDocument(toAddress, order, 'receiver');
  const senderDocument = extractDocument(fromAddress, order, 'sender');

  const record: Record<string, unknown> = {
    tenant_id: tenantId,
    integration_id: integrationId,
    me_id: String(order.id),
    order_id: order.order_id || null,
    order_number: order.order_number || (order.invoice as Record<string, unknown>)?.key || null,
    external_order_number: extractEcommerceOrderNumber(order),
    li_order_id: liOrderId,
    tracking_code: order.tracking || null,
    protocol: order.protocol || null,
    status: mapStatus(order.status || ''),
    carrier: order.service?.company?.name || null,
    service_name: order.service?.name || null,
    price: order.price || null,
    discount: order.discount || null,
    format: order.format || null,
    weight: order.weight || null,
    height: order.height || null,
    width: order.width || null,
    length: order.length || null,
    dimensions: order.dimensions || { height: order.height, width: order.width, length: order.length },
    insurance_value: order.insurance_value || null,
    receipt: order.receipt || false,
    own_hand: order.own_hand || false,
    collect: order.collect || false,
    from_address: order.from || null,
    to_address: order.to || null,
    receiver_name: toAddress.name || null,
    receiver_phone: toAddress.phone || null,
    receiver_city: toAddress.city || null,
    receiver_state: toAddress.state_abbr || toAddress.state || null,
    receiver_address: {
      street: toAddress.address,
      number: toAddress.number,
      complement: toAddress.complement,
      district: toAddress.district,
      city: toAddress.city,
      state: toAddress.state_abbr || toAddress.state,
      postal_code: toAddress.postal_code,
    },
    invoice: order.invoice || null,
    volumes: order.volumes || null,
    tags: order.tags || null,
    products: order.products || null,
    authorization_code: order.authorization_code || null,
    quote: order.quote || null,
    paid_at: order.paid_at || null,
    generated_at: order.generated_at || null,
    posted_at: order.posted_at || null,
    delivered_at: order.delivered_at || null,
    canceled_at: order.canceled_at || null,
    expired_at: order.expired_at || null,
    delivery_min: order.delivery_min || null,
    delivery_max: order.delivery_max || null,
    estimated_delivery_at: estimatedDeliveryAt,
    print_url: order.print?.url || null,
    preview_url: order.preview?.url || null,
    raw_data: order,
    synced_at: new Date().toISOString(),
    last_sync_at: new Date().toISOString(),
    sender_document: senderDocument || fromAddress.document || fromAddress.company_document || null,
    sender_email: fromAddress.email || null,
    sender_phone: fromAddress.phone || null,
    receiver_email: toAddress.email || null,
    receiver_document: receiverDocument || toAddress.document || toAddress.company_document || null,
    receiver_note: toAddress.note || null,
    agency_name: order.agency?.name || null,
    agency_address: order.agency?.address || null,
    cte_key: order.cte_key || null,
    contract: order.contract || null,
    billed_weight: order.billed_weight || order.conciliation?.billed_weight || null,
    non_commercial: order.non_commercial || false,
    conciliation: order.conciliation || null,
    additional_info: order.additional_info || null,
    service_details: {
      company_name: order.service?.company?.name || null,
      company_picture: order.service?.company?.picture || null,
      tracking_link: order.service?.company?.tracking_link || null,
      service_name: order.service?.name || null,
      service_type: order.service?.type || null,
      service_range: order.service?.range || null,
    },
    financial_details: order.details || null,
  };

  if (blingOrderId) {
    record.bling_order_id = blingOrderId;
  }

  return record;
}
