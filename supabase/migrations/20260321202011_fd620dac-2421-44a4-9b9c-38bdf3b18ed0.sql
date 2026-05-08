
-- Store the encryption passphrase in vault for server-side use only
SELECT vault.create_secret('__auto_generated_placeholder__', 'TENANT_DATA_ENCRYPTION_KEY', 'Symmetric key for encrypting tenant secrets at rest');

-- Helper: encrypt text using pgcrypto PGP symmetric encryption
-- Uses the key from vault, so it NEVER leaves the database
CREATE OR REPLACE FUNCTION public.encrypt_secret(_plaintext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  
  RETURN encode(pgcrypto.pgp_sym_encrypt(_plaintext, _key), 'base64');
END;
$$;

-- Helper: decrypt text using pgcrypto PGP symmetric encryption
CREATE OR REPLACE FUNCTION public.decrypt_secret(_ciphertext text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  
  RETURN pgcrypto.pgp_sym_decrypt(decode(_ciphertext, 'base64'), _key);
END;
$$;

-- Helper: mask a secret for display (show only last 4 chars)
CREATE OR REPLACE FUNCTION public.mask_secret(_plaintext text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _plaintext IS NULL OR length(_plaintext) < 5 THEN '••••••••'
    ELSE '••••••••' || right(_plaintext, 4)
  END;
$$;
