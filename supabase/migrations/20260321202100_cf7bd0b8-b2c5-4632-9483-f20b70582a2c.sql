
-- Use security definer function to update the vault key
CREATE OR REPLACE FUNCTION public._init_encryption_key()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'TENANT_DATA_ENCRYPTION_KEY';
  PERFORM vault.create_secret(
    encode(extensions.gen_random_bytes(32), 'hex'), 
    'TENANT_DATA_ENCRYPTION_KEY', 
    'Symmetric key for encrypting tenant secrets at rest'
  );
END;
$$;

SELECT public._init_encryption_key();
DROP FUNCTION public._init_encryption_key();

-- Add encrypted columns for Bling
ALTER TABLE public.bling_connections ADD COLUMN IF NOT EXISTS access_token_encrypted text;
ALTER TABLE public.bling_connections ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

-- Add encrypted columns for Melhor Envio
ALTER TABLE public.melhor_envio_tokens ADD COLUMN IF NOT EXISTS access_token_encrypted text;
ALTER TABLE public.melhor_envio_tokens ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

-- Add encrypted column for SMTP
ALTER TABLE public.email_integrations ADD COLUMN IF NOT EXISTS smtp_password_encrypted text;
