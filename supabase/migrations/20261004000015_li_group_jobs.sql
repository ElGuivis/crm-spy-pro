-- Enviar clientes de uma audiencia RFM para um grupo da Loja Integrada (ex.: VIP), em segundo plano e com desfazer.
-- Mudar o grupo pode mudar precos na loja (atacado, VIP): por isso so com confirmacao, em ritmo seguro (a loja limita 100 chamadas/min)
-- e guardando o grupo anterior de cada cliente para voltar.
CREATE TABLE IF NOT EXISTS public.li_group_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  label text NOT NULL,
  -- null = cada cliente volta para o grupo que tinha (desfazer)
  target_group text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'cancelled')),
  total integer NOT NULL DEFAULT 0,
  done integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  undo_of uuid REFERENCES public.li_group_jobs(id) ON DELETE SET NULL,
  undone_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_li_group_jobs_tenant ON public.li_group_jobs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.li_group_job_items (
  job_id uuid NOT NULL REFERENCES public.li_group_jobs(id) ON DELETE CASCADE,
  li_customer_id bigint NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text,
  previous_group text,
  new_group text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  error text,
  done_at timestamptz,
  PRIMARY KEY (job_id, li_customer_id)
);
CREATE INDEX IF NOT EXISTS idx_li_group_items_pending ON public.li_group_job_items (job_id) WHERE status = 'pending';

ALTER TABLE public.li_group_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.li_group_job_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant select" ON public.li_group_jobs;
CREATE POLICY "Tenant select" ON public.li_group_jobs FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
DROP POLICY IF EXISTS "Tenant select" ON public.li_group_job_items;
CREATE POLICY "Tenant select" ON public.li_group_job_items FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Membros de uma audiencia RFM que sao clientes da Loja Integrada, com o grupo atual (so leitura, para a previa e o trabalho)
CREATE OR REPLACE FUNCTION public.get_rfm_audience_li_customers(p_tenant_id uuid, p_audience_id uuid)
RETURNS TABLE (li_customer_id bigint, email text, current_group text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (c.loja_integrada_customer_id) c.loja_integrada_customer_id::bigint, lower(btrim(c.email)), c.raw_json->'grupo'->>'nome'
  FROM public.rfm_audience_members am
  JOIN public.customer_rfm_snapshots s ON s.id = am.snapshot_id
  JOIN public.li_customers c ON c.tenant_id = p_tenant_id AND s.source_type = 'loja_integrada' AND c.loja_integrada_customer_id::text = regexp_replace(s.customer_id, '^li_', '')
  WHERE am.audience_id = p_audience_id AND am.tenant_id = p_tenant_id AND public.caller_has_tenant(p_tenant_id)
$$;
GRANT EXECUTE ON FUNCTION public.get_rfm_audience_li_customers(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'li-group-jobs') THEN
    PERFORM cron.schedule('li-group-jobs', '* * * * *', $job$
      SELECT net.http_post(url := public.functions_base_url() || '/functions/v1/li-marketing-jobs',
                           headers := public.get_internal_headers(), body := '{"job":"groups"}'::jsonb, timeout_milliseconds := 90000)
    $job$);
  END IF;
END
$$;
