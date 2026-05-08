import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCustomerOrders(phone: string | null | undefined, email?: string | null, integrationId?: string | null) {
  const { tenantId } = useAuth();

  const cleanPhone = phone?.replace(/\D/g, '') || '';
  const phoneSuffix = cleanPhone.slice(-8);

  // Search Loja Integrada orders by phone (raw_json->cliente->telefone_celular or telefone_principal)
  const { data: liOrders = [], isLoading: loadingLI } = useQuery({
    queryKey: ['customer-orders-li', tenantId, phoneSuffix, integrationId],
    queryFn: async () => {
      if (!tenantId || !phoneSuffix) return [];
      let query = supabase
        .from('li_orders')
        .select('id, order_number, status_name, totals_json, raw_json, created_at_remote, items_json')
        .eq('tenant_id', tenantId)
        .order('created_at_remote', { ascending: false })
        .limit(20);
      if (integrationId) query = query.eq('integration_id', integrationId);
      const { data, error } = await query;
      if (error) return [];
      // Filter client-side by phone match in raw_json
      return (data || []).filter((o: any) => {
        const cliente = o.raw_json?.cliente;
        if (!cliente) return false;
        const cel = String(cliente.telefone_celular || '').replace(/\D/g, '');
        const tel = String(cliente.telefone_principal || '').replace(/\D/g, '');
        return cel.includes(phoneSuffix) || tel.includes(phoneSuffix);
      }).slice(0, 10);
    },
    enabled: !!tenantId && !!phoneSuffix,
  });

  // Search Bling orders by phone
  const { data: blingOrders = [], isLoading: loadingBling } = useQuery({
    queryKey: ['customer-orders-bling', tenantId, phoneSuffix, integrationId],
    queryFn: async () => {
      if (!tenantId || !phoneSuffix) return [];
      let query = supabase
        .from('bling_orders')
        .select('id, numero, situacao_nome, valor_total, data_criacao, cliente_nome')
        .eq('tenant_id', tenantId)
        .or(`cliente_telefone.ilike.%${phoneSuffix}%`)
        .order('data_criacao', { ascending: false })
        .limit(10);
      if (integrationId) query = query.eq('integration_id', integrationId);
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    },
    enabled: !!tenantId && !!phoneSuffix,
  });

  // Search shipments by receiver_phone
  const { data: shipments = [], isLoading: loadingShipments } = useQuery({
    queryKey: ['customer-shipments', tenantId, phoneSuffix, integrationId],
    queryFn: async () => {
      if (!tenantId || !phoneSuffix) return [];
      let query = supabase
        .from('me_shipments')
        .select('id, tracking_code, status, service_name, receiver_name, receiver_phone, created_at')
        .eq('tenant_id', tenantId)
        .ilike('receiver_phone', `%${phoneSuffix}%`)
        .order('created_at', { ascending: false })
        .limit(5);
      if (integrationId) query = query.eq('integration_id', integrationId);
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    },
    enabled: !!tenantId && !!phoneSuffix,
  });

  return {
    liOrders,
    blingOrders,
    shipments,
    isLoading: loadingLI || loadingBling || loadingShipments,
  };
}
