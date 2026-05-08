
-- Auto-encrypt smtp_password on insert/update via trigger
CREATE OR REPLACE FUNCTION public.encrypt_email_smtp_password()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Only encrypt if smtp_password changed and is not empty
  IF NEW.smtp_password IS NOT NULL AND NEW.smtp_password != '' THEN
    -- Only re-encrypt if password actually changed
    IF OLD IS NULL OR NEW.smtp_password IS DISTINCT FROM OLD.smtp_password THEN
      NEW.smtp_password_encrypted := public.encrypt_secret(NEW.smtp_password);
      -- Clear plaintext after encryption (transition: keep for now)
      -- NEW.smtp_password := ''; -- uncomment after full migration
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_email_smtp_password
  BEFORE INSERT OR UPDATE ON public.email_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_email_smtp_password();

-- Auto-encrypt bling tokens on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_bling_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_bling_tokens
  BEFORE INSERT OR UPDATE ON public.bling_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_bling_tokens();

-- Auto-encrypt melhor envio tokens on insert/update
CREATE OR REPLACE FUNCTION public.encrypt_melhor_envio_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_melhor_envio_tokens
  BEFORE INSERT OR UPDATE ON public.melhor_envio_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_melhor_envio_tokens();

-- Auto-encrypt AI credentials on insert/update (prevents btoa bypass from frontend)
CREATE OR REPLACE FUNCTION public.encrypt_ai_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _test text;
BEGIN
  IF NEW.api_key_encrypted IS NOT NULL AND NEW.api_key_encrypted != '' THEN
    -- Check if already encrypted (pgcrypto produces specific header bytes)
    BEGIN
      _test := public.decrypt_secret(NEW.api_key_encrypted);
      -- If decryption succeeds, it's already encrypted — leave it
    EXCEPTION WHEN OTHERS THEN
      -- Not encrypted yet (probably btoa or plaintext) — encrypt it
      BEGIN
        -- Try to decode as base64 first (btoa legacy)
        NEW.api_key_encrypted := public.encrypt_secret(
          convert_from(decode(NEW.api_key_encrypted, 'base64'), 'UTF8')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Not valid base64, treat as plaintext
        NEW.api_key_encrypted := public.encrypt_secret(NEW.api_key_encrypted);
      END;
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_encrypt_ai_credentials
  BEFORE INSERT OR UPDATE ON public.tenant_ai_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.encrypt_ai_credentials();
