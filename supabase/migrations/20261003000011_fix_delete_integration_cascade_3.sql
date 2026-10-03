-- Terceira parte da correcao de delete_integration_cascade: colunas que nao existem neste schema.
--   li_order_items.li_order_id     -> order_id
--   bling_order_items.bling_order_id -> order_id
--   cashback_executions.li_customer_id (nao existe): as execucoes ja sao apagadas por config_id mais adiante.

DO $$
DECLARE
  def text := replace(pg_get_functiondef('public.delete_integration_cascade(uuid,uuid)'::regprocedure), E'\r', '');
  new_def text;
BEGIN
  new_def := regexp_replace(def, E'\\n\\s*DELETE FROM public\\.cashback_executions\\s+WHERE li_customer_id = ANY\\(v_li_customer_ids\\);', '', 'g');
  new_def := replace(new_def, 'DELETE FROM public.li_order_items WHERE li_order_id = ANY(v_li_order_ids)', 'DELETE FROM public.li_order_items WHERE order_id = ANY(v_li_order_ids)');
  new_def := replace(new_def, 'DELETE FROM public.bling_order_items WHERE bling_order_id = ANY(v_bling_order_ids)', 'DELETE FROM public.bling_order_items WHERE order_id = ANY(v_bling_order_ids)');
  IF new_def = def THEN RAISE EXCEPTION 'patch sem efeito'; END IF;
  IF new_def ~ 'li_customer_id = ANY|li_order_id = ANY|bling_order_id = ANY' THEN
    RAISE EXCEPTION 'ainda ha colunas inexistentes';
  END IF;
  EXECUTE new_def;
END
$$;
