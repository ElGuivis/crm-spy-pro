-- Google Ads Manager: visoes agregadas para a tela (a API REST corta em 1.000 linhas; aqui vem ja somado).
CREATE OR REPLACE VIEW public.google_ads_account_monthly WITH (security_invoker = true) AS
SELECT tenant_id, account_id, month,
       sum(impressions)::bigint AS impressions,
       sum(clicks)::bigint AS clicks,
       sum(cost_micros)::bigint AS cost_micros,
       sum(conversions) AS conversions,
       sum(conversions_value) AS conversions_value
FROM public.google_ads_campaign_monthly
GROUP BY tenant_id, account_id, month;

CREATE OR REPLACE VIEW public.google_ads_conversion_lifetime WITH (security_invoker = true) AS
SELECT tenant_id, account_id, conversion_action_name,
       sum(conversions) AS conversions,
       sum(conversions_value) AS conversions_value,
       min(month) AS first_month,
       max(month) AS last_month
FROM public.google_ads_conversion_monthly
GROUP BY tenant_id, account_id, conversion_action_name;

REVOKE ALL ON public.google_ads_account_monthly, public.google_ads_conversion_lifetime FROM anon, authenticated;
GRANT SELECT ON public.google_ads_account_monthly, public.google_ads_conversion_lifetime TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
