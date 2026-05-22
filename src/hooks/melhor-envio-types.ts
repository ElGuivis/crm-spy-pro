export interface MelhorEnvioUser { id: string; name: string; email: string; }

export interface MelhorEnvioStatus {
  connected: boolean; expired: boolean; user: MelhorEnvioUser | null; expires_at: string | null;
}

export interface MelhorEnvioShipment {
  id: string; me_id: string; order_id: string | null; order_number: string | null;
  external_order_number: string | null; tracking_code: string | null; protocol: string | null;
  status: string | null; carrier: string | null; service_name: string | null;
  price: number | null; discount: number | null; weight: number | null;
  height: number | null; width: number | null; length: number | null; format: string | null;
  dimensions: unknown; insurance_value: number | null; receipt: boolean | null;
  own_hand: boolean | null; collect: boolean | null; from_address: unknown;
  to_address: unknown; tracking_events: unknown;
  receiver_name: string | null; receiver_phone: string | null; receiver_city: string | null;
  receiver_state: string | null; receiver_address: unknown; invoice: unknown;
  volumes: unknown; products: unknown; authorization_code: string | null;
  print_url: string | null; preview_url: string | null; delivery_min: number | null;
  delivery_max: number | null; estimated_delivery_at: string | null; paid_at: string | null;
  generated_at: string | null; posted_at: string | null; delivered_at: string | null;
  created_at: string | null; last_sync_at: string | null;
  sender_document: string | null; sender_email: string | null; sender_phone: string | null;
  receiver_email: string | null; receiver_document: string | null; receiver_note: string | null;
  agency_name: string | null; agency_address: unknown; cte_key: string | null;
  contract: string | null; billed_weight: number | null; non_commercial: boolean | null;
  conciliation: unknown; additional_info: unknown; service_details: unknown; financial_details: unknown;
}

export interface ShipmentFilters {
  status?: string; carrier?: string; search?: string; dateFrom?: string; dateTo?: string;
  receiverCity?: string; receiverState?: string; page?: number; pageSize?: number;
  integrationId?: string; delayedOnly?: boolean;
}

export interface GlobalShipmentStats {
  total: number; pending: number; posted: number; inTransit: number; delivered: number;
  canceled: number; returning: number; delayed: number; totalValue: number;
}

export function calculateAverageDeliveryDays(shipments: MelhorEnvioShipment[]): number {
  const delivered = shipments.filter((s) => s.status === "delivered" && s.posted_at && s.delivered_at);
  if (delivered.length === 0) return 0;
  const totalDays = delivered.reduce((sum, s) => {
    const days = Math.ceil((new Date(s.delivered_at!).getTime() - new Date(s.posted_at!).getTime()) / 86400000);
    return sum + days;
  }, 0);
  return Math.round(totalDays / delivered.length);
}
