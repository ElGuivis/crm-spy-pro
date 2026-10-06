-- A11 (revisao 05/10/2026): funcoes de gatilho nao devem ser executaveis por papeis de aplicacao. Chamar uma funcao de gatilho
-- direto ja falha ("trigger functions can only be called as triggers"), entao e so higiene; o gatilho segue disparando
-- (o Postgres confere EXECUTE so ao criar o gatilho, nao a cada disparo).
-- Revisao das demais funcoes SECURITY DEFINER executaveis por authenticated (37): 34 checam quem chama (caller_has_tenant,
-- caller_is_user, auth.uid) ou sao leituras fixas (status de cron). get_user_tenant_id/has_module_permission/is_tenant_admin
-- aceitam um _user_id qualquer (so devolvem tenant/booleano e exigem saber UUIDs): mantidas porque as policies as chamam em todo
-- acesso; ver PLANO.md (A11).
REVOKE EXECUTE ON FUNCTION public.emit_order_ingested() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_coupon_redeemed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_li_unsubscribe() FROM PUBLIC, anon, authenticated;
