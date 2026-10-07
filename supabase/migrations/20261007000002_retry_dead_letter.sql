-- Reenfileirar item da dead letter pela tela Operações.
-- Antes a tela fazia UPDATE direto em outbound_queue / instagram_outbox / dead_letter_queue,
-- mas nenhuma dessas tabelas tem política de UPDATE para o usuário logado: o PostgREST devolvia
-- 0 linhas sem erro e a tela mostrava "reenfileirado com sucesso" sem ter feito nada.
CREATE OR REPLACE FUNCTION public.retry_dead_letter(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.dead_letter_queue%ROWTYPE;
  v_rows integer;
BEGIN
  SELECT * INTO d FROM public.dead_letter_queue WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF NOT public.is_tenant_admin(auth.uid(), d.tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF d.source_queue = 'outbound_queue' THEN
    UPDATE public.outbound_queue
       SET status = 'pending', attempts = 0, next_retry_at = now(), last_error = NULL
     WHERE id = d.source_item_id AND tenant_id = d.tenant_id;
  ELSIF d.source_queue = 'instagram_outbox' THEN
    UPDATE public.instagram_outbox
       SET status = 'pending', attempt_count = 0, send_after = now(), error_code = NULL, error_message = NULL
     WHERE id = d.source_item_id AND tenant_id = d.tenant_id;
  ELSE
    RETURN false;
  END IF;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.dead_letter_queue SET status = 'retried', retried_at = now() WHERE id = p_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_dead_letter(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_dead_letter(uuid) TO authenticated, service_role;
