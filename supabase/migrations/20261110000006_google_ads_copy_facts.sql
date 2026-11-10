-- Fatos VERIFICADOS no CRM para o redator de anuncios usar sem inventar nada (tipos de peca vendidos,
-- cobertura de entrega, parcelamento no cartao, Pix e volume de pedidos entregues). So leitura.
CREATE OR REPLACE FUNCTION public.google_ads_copy_facts(p_account uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_res jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant FROM google_ads_accounts WHERE id = p_account;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'conta nao encontrada'; END IF;

  SELECT jsonb_build_object(
    'delivered_orders', (SELECT COUNT(*) FROM li_orders WHERE tenant_id = v_tenant AND status_name = 'Pedido Entregue'),
    'states_delivered', (SELECT COUNT(DISTINCT shipping_json->'address'->>'estado') FROM li_orders WHERE tenant_id = v_tenant AND status_name = 'Pedido Entregue'),
    'pix_orders_12m', (SELECT COUNT(*) FROM li_orders WHERE tenant_id = v_tenant AND status_name = 'Pedido Entregue'
                        AND payment_json->>'method' = 'Pix' AND created_at_remote >= now() - interval '12 months'),
    'card_installment_pct', (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE COALESCE((payment_json->>'installments')::int, 1) > 1) / NULLIF(COUNT(*), 0), 1)
                              FROM li_orders WHERE tenant_id = v_tenant AND status_name = 'Pedido Entregue' AND payment_json->>'method' ILIKE '%cart%'),
    'product_types', COALESCE((SELECT jsonb_agg(t ORDER BY q DESC) FROM (
        SELECT initcap(split_part(i.name, ' ', 1)) AS t, SUM(i.qty) AS q
        FROM li_order_items i JOIN li_orders o ON o.id = i.order_id
        WHERE o.tenant_id = v_tenant AND o.status_name = 'Pedido Entregue' AND o.created_at_remote >= now() - interval '18 months'
        GROUP BY 1 HAVING SUM(i.qty) >= 10 ORDER BY 2 DESC LIMIT 5) x), '[]'::jsonb)
  ) INTO v_res;
  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.google_ads_copy_facts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_ads_copy_facts(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
