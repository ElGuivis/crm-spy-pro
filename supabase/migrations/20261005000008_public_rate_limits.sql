-- Limite de taxa para os endpoints publicos (descadastro, pixel de abertura, clique): janela fixa por chave (ex.: "unsub:<ip>").
-- Usado so pelas edge functions (service_role); o banco apaga janelas com mais de 1 dia na limpeza do li-marketing-jobs.
CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_public_rate_limits_window ON public.public_rate_limits (window_start);

-- p_increment = true: conta este acesso e responde se ainda esta dentro do limite (hits <= max).
-- p_increment = false: so consulta (hits < max), sem contar (usado antes de uma checagem cujo "erro" e que conta).
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_bucket text, p_max integer, p_window_seconds integer, p_increment boolean DEFAULT true)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_window timestamptz := to_timestamp(floor(extract(epoch FROM now()) / GREATEST(p_window_seconds, 1)) * GREATEST(p_window_seconds, 1));
  v_hits integer;
BEGIN
  IF p_increment THEN
    INSERT INTO public.public_rate_limits (bucket, window_start, hits) VALUES (left(p_bucket, 200), v_window, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET hits = public.public_rate_limits.hits + 1
    RETURNING hits INTO v_hits;
    RETURN v_hits <= p_max;
  END IF;
  SELECT hits INTO v_hits FROM public.public_rate_limits WHERE bucket = left(p_bucket, 200) AND window_start = v_window;
  RETURN COALESCE(v_hits, 0) < p_max;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_public_rate_limits()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.public_rate_limits WHERE window_start < now() - interval '1 day';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cleanup_public_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_public_rate_limits() TO service_role;
