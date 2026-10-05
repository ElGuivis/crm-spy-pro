-- Identidade do cliente (Fase N5): uma chave unica por pessoa (e-mail normalizado; sem e-mail, telefone com 55) para ligar loja, RFM, newsletter,
-- supressao, toques e cupons. Causa do descasamento do RFM: customer_rfm_snapshots.customer_id vem em dois formatos (uuid de li_customers.id
-- ou 'li_<id da loja>') e a funcao dos grupos so entendia o segundo (so 1.542 de 4.876 pessoas casavam).

CREATE OR REPLACE FUNCTION public.customer_key(p_email text, p_phone text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_email IS NOT NULL AND position('@' IN p_email) > 1 THEN lower(btrim(p_email))
    ELSE (
      SELECT CASE WHEN length(d) BETWEEN 10 AND 11 THEN '55' || d WHEN length(d) BETWEEN 12 AND 13 THEN d ELSE NULL END
      FROM (SELECT regexp_replace(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '^0', '') AS d) x
    )
  END
$$;

-- Ultimo RFM de cada pessoa (por chave unica, nao por customer_id, que tem dois formatos). Respeita o RLS de quem consulta.
CREATE OR REPLACE VIEW public.customer_rfm_latest WITH (security_invoker = true) AS
SELECT DISTINCT ON (s.tenant_id, public.customer_key(s.customer_email, s.customer_phone))
  s.tenant_id, public.customer_key(s.customer_email, s.customer_phone) AS customer_key,
  s.id AS snapshot_id, s.customer_id, s.customer_name, s.customer_email, s.customer_phone,
  s.segment_name, s.segment_action, s.churn_risk, s.rfm_score, s.recency_days, s.orders_count, s.revenue_total, s.aov,
  s.last_order_date, s.first_purchase_date, s.reference_date
FROM public.customer_rfm_snapshots s
WHERE public.customer_key(s.customer_email, s.customer_phone) IS NOT NULL
ORDER BY s.tenant_id, public.customer_key(s.customer_email, s.customer_phone), s.reference_date DESC, s.created_at DESC;
GRANT SELECT ON public.customer_rfm_latest TO authenticated;

CREATE INDEX IF NOT EXISTS idx_rfm_snap_key ON public.customer_rfm_snapshots (tenant_id, (public.customer_key(customer_email, customer_phone)), reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_li_customers_key ON public.li_customers (tenant_id, (public.customer_key(email, phone)));

-- Pessoas de uma audiencia RFM na loja (para mudar de grupo): casa por qualquer um dos tres caminhos (uuid, li_<id> ou chave unica).
-- Tres buscas indexadas unidas (um OR no join ficava lento em audiencias de milhares de pessoas).
CREATE OR REPLACE FUNCTION public.get_rfm_audience_li_customers(p_tenant_id uuid, p_audience_id uuid)
RETURNS TABLE (li_customer_id bigint, email text, current_group text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH snaps AS (
    SELECT s.customer_id,
           CASE WHEN s.customer_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN s.customer_id::uuid END AS li_uuid,
           CASE WHEN s.customer_id ~ '^li_[0-9]+$' THEN substring(s.customer_id FROM 4)::integer END AS li_n,
           public.customer_key(s.customer_email, s.customer_phone) AS k
    FROM public.rfm_audience_members am
    JOIN public.customer_rfm_snapshots s ON s.id = am.snapshot_id
    WHERE am.audience_id = p_audience_id AND am.tenant_id = p_tenant_id AND s.source_type = 'loja_integrada' AND public.caller_has_tenant(p_tenant_id)
  ), matched AS (
    SELECT c.id FROM snaps JOIN public.li_customers c ON c.id = snaps.li_uuid AND c.tenant_id = p_tenant_id
    UNION
    SELECT c.id FROM snaps JOIN public.li_customers c ON c.loja_integrada_customer_id = snaps.li_n AND c.tenant_id = p_tenant_id
    UNION
    SELECT c.id FROM snaps JOIN public.li_customers c ON c.tenant_id = p_tenant_id AND public.customer_key(c.email, c.phone) = snaps.k
  )
  SELECT DISTINCT ON (c.loja_integrada_customer_id) c.loja_integrada_customer_id::bigint, lower(btrim(c.email)), c.raw_json->'grupo'->>'nome'
  FROM matched m JOIN public.li_customers c ON c.id = m.id
$$;
GRANT EXECUTE ON FUNCTION public.get_rfm_audience_li_customers(uuid, uuid) TO authenticated;
