-- API de Conversões da Meta na página de pré-venda (22/11/2026).
-- O token fica CIFRADO (public.encrypt_secret, chave do vault); só o servidor decifra.
ALTER TABLE public.presale_pages
  ADD COLUMN IF NOT EXISTS meta_capi_token_encrypted text,
  ADD COLUMN IF NOT EXISTS meta_test_event_code text
    CHECK (meta_test_event_code IS NULL OR meta_test_event_code ~ '^[A-Za-z0-9]{3,20}$');

ALTER TABLE public.presale_signups
  ADD COLUMN IF NOT EXISTS meta_event_id text,
  ADD COLUMN IF NOT EXISTS meta_capi_status text CHECK (meta_capi_status IS NULL OR meta_capi_status IN ('sent','failed')),
  ADD COLUMN IF NOT EXISTS meta_capi_error text;

-- (authenticated tem SELECT na tabela inteira pela política do tenant; o valor é cifrado e
--  decrypt_secret só roda como service_role, então ler a coluna não revela o token)
