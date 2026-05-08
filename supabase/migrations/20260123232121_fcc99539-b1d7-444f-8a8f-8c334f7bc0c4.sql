-- Habilitar realtime para tabelas da Loja Integrada que estão faltando
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.li_customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_coupons;