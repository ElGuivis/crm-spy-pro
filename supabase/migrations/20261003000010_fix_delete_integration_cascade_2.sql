-- Segunda parte da correcao de delete_integration_cascade: ainda citava li_cashback_executions, conversation_notes
-- e message_reactions, que nao existem neste schema. Remove os tres DELETEs e valida que NENHUMA tabela citada
-- pela funcao esta ausente (evita descobrir o proximo 42P01 em producao).

DO $$
DECLARE
  def text := replace(pg_get_functiondef('public.delete_integration_cascade(uuid,uuid)'::regprocedure), E'\r', '');
  new_def text;
  t text;
  missing text := '';
BEGIN
  new_def := regexp_replace(def,
    E'\\n\\s*DELETE FROM public\\.(li_cashback_executions|conversation_notes|message_reactions)\\s+WHERE [^;]*;', '', 'g');
  IF new_def = def THEN RAISE EXCEPTION 'patch sem efeito'; END IF;

  FOR t IN
    SELECT DISTINCT m[2]
    FROM regexp_matches(new_def, '(UPDATE|FROM|INTO|JOIN)\s+public\.([a-z_0-9]+)', 'gi') AS m
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      missing := missing || t || ' ';
    END IF;
  END LOOP;
  IF missing <> '' THEN RAISE EXCEPTION 'a funcao ainda cita tabelas inexistentes: %', missing; END IF;

  EXECUTE new_def;
END
$$;
