/** Corpo da chamada do li-cashback (um pedido da loja). */
export interface CashbackPayload {
  order_id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cpf?: string;
  order_total: number;
  tenant_id?: string; // Optional: if provided, use this tenant instead of config lookup
  integration_id?: string; // FIX: Add integration_id for proper store isolation
}
