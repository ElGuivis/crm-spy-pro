
CREATE OR REPLACE FUNCTION public.link_me_shipments_to_orders(
  p_me_integration_id UUID,
  p_store_integration_id UUID,
  p_store_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked INTEGER := 0;
  v_total INTEGER := 0;
  v_already_linked INTEGER := 0;
BEGIN
  -- Count total
  SELECT COUNT(*) INTO v_total FROM me_shipments WHERE integration_id = p_me_integration_id;

  IF p_store_type = 'loja_integrada' THEN
    -- Count already linked
    SELECT COUNT(*) INTO v_already_linked FROM me_shipments 
    WHERE integration_id = p_me_integration_id AND li_order_id IS NOT NULL;

    -- Batch update
    WITH matched AS (
      UPDATE me_shipments ms
      SET li_order_id = lo.id
      FROM li_orders lo
      WHERE lo.integration_id = p_store_integration_id
        AND lo.order_number = ms.external_order_number
        AND ms.integration_id = p_me_integration_id
        AND ms.li_order_id IS NULL
        AND ms.external_order_number IS NOT NULL
      RETURNING ms.id
    )
    SELECT COUNT(*) INTO v_linked FROM matched;

  ELSIF p_store_type = 'bling' THEN
    SELECT COUNT(*) INTO v_already_linked FROM me_shipments 
    WHERE integration_id = p_me_integration_id AND bling_order_id IS NOT NULL;

    WITH matched AS (
      UPDATE me_shipments ms
      SET bling_order_id = bo.id
      FROM bling_orders bo
      WHERE bo.integration_id = p_store_integration_id
        AND bo.numero = ms.external_order_number
        AND ms.integration_id = p_me_integration_id
        AND ms.bling_order_id IS NULL
        AND ms.external_order_number IS NOT NULL
      RETURNING ms.id
    )
    SELECT COUNT(*) INTO v_linked FROM matched;
  END IF;

  RETURN json_build_object(
    'linked_now', v_linked,
    'already_linked', v_already_linked,
    'total', v_total
  );
END;
$$;
