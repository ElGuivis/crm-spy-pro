-- Resultado da reativação: quantos receberam, quantos voltaram a comprar (em até 30 dias depois da mensagem) e a receita.
-- Roda com as permissões de quem chama (RLS por loja). Casa a pessoa pelo e-mail ou pelos 10 últimos dígitos do telefone.
CREATE OR REPLACE FUNCTION public.get_reactivation_results(p_config_id uuid)
 RETURNS TABLE(sent bigint, unreachable bigint, failed bigint, returned bigint, revenue numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT id, tenant_id, created_at, lower(coalesce(customer_email, '')) AS em, customer_key
    FROM public.reactivation_executions WHERE config_id = p_config_id AND status = 'sent'
  ),
  m AS (
    SELECT o.id AS order_id, s.id AS exec_id, coalesce((o.totals_json->>'total')::numeric, 0) AS total
    FROM s JOIN public.li_orders o
      ON o.tenant_id = s.tenant_id
     AND o.created_at_remote > s.created_at AND o.created_at_remote < s.created_at + interval '30 days'
     AND coalesce(o.status_name, '') !~* 'cancel|devolv'
     AND ((s.em <> '' AND lower(coalesce(o.raw_json->'cliente'->>'email', '')) = s.em)
       OR (s.customer_key IS NOT NULL AND length(s.customer_key) >= 10
           AND right(regexp_replace(coalesce(o.raw_json->'cliente'->>'telefone_celular', ''), '\D', '', 'g'), 10) = right(s.customer_key, 10)))
  )
  SELECT
    (SELECT count(*) FROM public.reactivation_executions WHERE config_id = p_config_id AND status = 'sent'),
    (SELECT count(*) FROM public.reactivation_executions WHERE config_id = p_config_id AND status = 'unreachable'),
    (SELECT count(*) FROM public.reactivation_executions WHERE config_id = p_config_id AND status = 'failed'),
    (SELECT count(DISTINCT exec_id) FROM m),
    (SELECT coalesce(sum(total), 0) FROM (SELECT DISTINCT ON (order_id) order_id, total FROM m) d);
$function$;
