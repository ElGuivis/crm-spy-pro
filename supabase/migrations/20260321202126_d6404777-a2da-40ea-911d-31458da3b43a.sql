
-- Fix encrypt_secret and decrypt_secret to use correct schema for pgcrypto
CREATE OR REPLACE FUNCTION public.encrypt_secret(_plaintext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _key text;
BEGIN
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'TENANT_DATA_ENCRYPTION_KEY'
  LIMIT 1;
  
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in vault';
  END IF;
  
  RETURN encode(extensions.pgp_sym_encrypt(_plaintext, _key), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_secret(_ciphertext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _key text;
BEGIN
  IF _ciphertext IS NULL OR _ciphertext = '' THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO _key
  FROM vault.decrypted_secrets
  WHERE name = 'TENANT_DATA_ENCRYPTION_KEY'
  LIMIT 1;
  
  IF _key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not configured in vault';
  END IF;
  
  RETURN extensions.pgp_sym_decrypt(decode(_ciphertext, 'base64'), _key);
END;
$$;

-- Migrate existing btoa-encoded AI credentials to real encryption
DO $$
DECLARE
  _row RECORD;
  _decoded text;
BEGIN
  FOR _row IN SELECT id, api_key_encrypted FROM public.tenant_ai_credentials 
    WHERE api_key_encrypted IS NOT NULL AND api_key_encrypted != ''
  LOOP
    BEGIN
      _decoded := convert_from(decode(_row.api_key_encrypted, 'base64'), 'UTF8');
      UPDATE public.tenant_ai_credentials 
      SET api_key_encrypted = public.encrypt_secret(_decoded)
      WHERE id = _row.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping credential %: %', _row.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Encrypt existing Bling tokens
UPDATE public.bling_connections
SET access_token_encrypted = public.encrypt_secret(access_token),
    refresh_token_encrypted = public.encrypt_secret(refresh_token)
WHERE access_token IS NOT NULL AND access_token != ''
  AND (access_token_encrypted IS NULL OR access_token_encrypted = '');

-- Encrypt existing Melhor Envio tokens
UPDATE public.melhor_envio_tokens
SET access_token_encrypted = public.encrypt_secret(access_token),
    refresh_token_encrypted = public.encrypt_secret(refresh_token)
WHERE access_token IS NOT NULL AND access_token != ''
  AND (access_token_encrypted IS NULL OR access_token_encrypted = '');

-- Encrypt existing SMTP passwords
UPDATE public.email_integrations
SET smtp_password_encrypted = public.encrypt_secret(smtp_password)
WHERE smtp_password IS NOT NULL AND smtp_password != ''
  AND (smtp_password_encrypted IS NULL OR smtp_password_encrypted = '');

-- Remove API keys from integrations.metadata (was exposed via RLS to non-admin members)
UPDATE public.integrations
SET metadata = metadata - 'api_key_encrypted'
WHERE type LIKE 'ai_%' AND metadata ? 'api_key_encrypted';
