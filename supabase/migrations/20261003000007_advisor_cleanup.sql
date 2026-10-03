-- Limpeza dos avisos do advisor do Studio (auditoria 03/10/2026).

-- 1) function_search_path_mutable
ALTER FUNCTION public.update_chatbot_flows_updated_at() SET search_path = public;

-- 2) public_bucket_allows_listing: o app so faz upload e usa getPublicUrl() em email-images; URL publica de bucket
--    publico nao depende de policy de SELECT. A policy aberta permitia LISTAR todos os arquivos de todos os tenants.
DROP POLICY IF EXISTS "Email images are publicly readable" ON storage.objects;
CREATE POLICY "Tenant members read own email-images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'email-images' AND (storage.foldername(name))[1] = (public.get_user_tenant_id(auth.uid()))::text);

-- 3) authenticated_security_definer_function_executable: estas funcoes so sao chamadas com service_role
--    (edge functions) ou por dentro de outras funcoes SECURITY DEFINER; nada no frontend nem em policies as usa.
REVOKE EXECUTE ON FUNCTION
  public.caller_has_tenant(uuid),
  public.decrypt_secret(text),
  public.encrypt_secret(text),
  public.deduct_tokens(uuid, integer, text, text, text),
  public.has_enough_tokens(uuid, integer)
FROM authenticated;
