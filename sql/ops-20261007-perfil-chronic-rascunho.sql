-- RASCUNHO do perfil da UseChronic (07/10/2026), gerado so com fatos do catalogo (li_products).
-- Politicas, tom de voz, prazos e regras NAO foram inventados: o dono preenche pela tela (F4) ou editando aqui.
-- Rodar DEPOIS da migration 20261007000003. Nao sobrescreve se o perfil ja existir.

INSERT INTO public.tenant_business_profiles
  (tenant_id, store_name, segment, about, sells, does_not_sell, audience, tone, policies, extra_rules, draft_generated_at)
VALUES (
  'bfbf95be-2ce9-47b5-82b1-c9677f42a5a8',
  'UseChronic',
  'Streetwear e acessórios',
  'Marca de streetwear Chronic, com coleções próprias e colaborações (ex.: Dexter, Mano Fler).',
  'Camisetas (inclusive plus size), regatas, blusas e moletons, bonés (five panel e outros), bermudas, shorts, calças, meias, carteiras, cintos, mochilas, pochetes, toucas, óculos, chaveiros e acessórios como cinzeiros, isqueiros e porta-objetos.',
  NULL,
  NULL,
  NULL,
  '{}'::jsonb,
  NULL,
  now()
)
ON CONFLICT (tenant_id) DO NOTHING;
