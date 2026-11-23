-- Canais do Bling por integração (22/11/2026).
-- integrations.bling_store_ids (já existia): canais de venda cujos PEDIDOS entram; NULL = todos;
--   o id 0 = pedidos sem canal (lançados à mão no Bling).
-- integrations.bling_product_store_id (novo): canal cujos PRODUTOS VINCULADOS entram; NULL = todos.
--   O PDV (loja física) não tem produto vinculado, por isso é uma escolha separada da dos pedidos.
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS bling_product_store_id bigint;

COMMENT ON COLUMN public.integrations.bling_store_ids IS
  'Bling: canais de venda cujos pedidos são sincronizados (NULL = todos; 0 = pedidos sem canal)';
COMMENT ON COLUMN public.integrations.bling_product_store_id IS
  'Bling: canal cujos produtos vinculados são sincronizados (NULL = todos os produtos)';
