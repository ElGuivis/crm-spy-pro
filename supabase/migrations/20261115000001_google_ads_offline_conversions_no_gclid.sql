-- "Compra paga (CRM)" passa a ser enviada pela Data Manager API casando por e-mail/celular (SHA-256),
-- sem depender do gclid no utm_campaign (o sufixo {campaignid}_{gclid} travava o checkout da loja em 13-14/11/2026).
-- O e-mail/celular NAO sao gravados aqui: sao lidos do pedido e enviados so como hash.
ALTER TABLE public.google_ads_offline_conversions ALTER COLUMN gclid DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
