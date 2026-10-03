-- delete_integration_cascade referenciava as tabelas abandoned_cart_configs e abandoned_carts, aposentadas em
-- 20260509000010-011. Resultado: a exclusao de integracao falhava com 42P01 ("relation ... does not exist") e a
-- tela caia num plano B que apagava os dados tabela por tabela (o que removeu os dados da Loja Integrada em 03/10).
-- Remove as tres referencias mortas, mantendo o resto da funcao identico.

DO $$
DECLARE
  def text := replace(pg_get_functiondef('public.delete_integration_cascade(uuid,uuid)'::regprocedure), E'\r', '');
  new_def text;
BEGIN
  new_def := regexp_replace(def, E'\\n\\s*UPDATE public\\.abandoned_cart_configs\\s+SET whatsapp_integration_id = NULL\\s+WHERE whatsapp_integration_id = p_integration_id;', '', 'g');
  new_def := regexp_replace(new_def, E'\\n\\s*DELETE FROM public\\.abandoned_cart_configs\\s+WHERE integration_id = p_integration_id;', '', 'g');
  new_def := regexp_replace(new_def, E'\\n\\s*DELETE FROM public\\.abandoned_carts\\s+WHERE integration_id = p_integration_id;', '', 'g');
  IF new_def = def THEN RAISE EXCEPTION 'patch sem efeito'; END IF;
  IF new_def ~ 'abandoned_cart' THEN RAISE EXCEPTION 'ainda ha referencia a abandoned_cart'; END IF;
  EXECUTE new_def;
END
$$;
