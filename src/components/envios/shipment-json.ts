
/** Formas dos campos jsonb de `me_shipments` (o banco os guarda como `Json`). */
export interface ShipmentAddress {
  name?: string; company?: string; address?: string; number?: string; complement?: string;
  district?: string; city?: string; state?: string; state_abbr?: string; postal_code?: string;
}
export interface ShipmentServiceDetails { company_picture?: string; tracking_link?: string }
export interface ShipmentConciliation { status?: string; billed_weight?: number; difference?: number; date?: string }
export interface ShipmentInvoice { number?: string; serie?: string; key?: string }
export interface ShipmentDimensions { height?: number; width?: number; length?: number }
export interface ShipmentProduct { name?: string; description?: string; quantity?: number; unitary_value?: number; value?: number; weight?: number }
export interface ShipmentVolume { height?: number; width?: number; length?: number; weight?: number }
export interface ShipmentTrackingEvent { title?: string; status?: string; description?: string; city?: string; state?: string; date?: string; created_at?: string }
export interface ShipmentAdditionalInfo { route?: string; destination_unit?: string; barcode?: string }

export { jsonAs, jsonArray } from "@/lib/json-access";
