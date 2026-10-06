-- Cupom da loja sem data de validade é normal (a API devolve validade nula). A coluna era NOT NULL e o sync
-- perdia essas páginas inteiras ("null value in column expires_at"). A tela já mostra "Sem validade".
ALTER TABLE public.generated_coupons ALTER COLUMN expires_at DROP NOT NULL;
