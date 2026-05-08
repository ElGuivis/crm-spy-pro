-- Step 1: Update encryption triggers to clear plaintext after encryption

-- Bling tokens trigger: clear plaintext after encrypting
CREATE OR REPLACE FUNCTION public.encrypt_bling_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
      NEW.access_token := ''; -- Clear plaintext
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
      NEW.refresh_token := ''; -- Clear plaintext
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Email SMTP password trigger: clear plaintext after encrypting
CREATE OR REPLACE FUNCTION public.encrypt_email_smtp_password()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.smtp_password IS NOT NULL AND NEW.smtp_password != '' THEN
    IF OLD IS NULL OR NEW.smtp_password IS DISTINCT FROM OLD.smtp_password THEN
      NEW.smtp_password_encrypted := public.encrypt_secret(NEW.smtp_password);
      NEW.smtp_password := ''; -- Clear plaintext
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Melhor Envio tokens trigger: clear plaintext after encrypting
CREATE OR REPLACE FUNCTION public.encrypt_melhor_envio_tokens()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
      NEW.access_token := ''; -- Clear plaintext
    END IF;
  END IF;
  IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token != '' THEN
    IF OLD IS NULL OR NEW.refresh_token IS DISTINCT FROM OLD.refresh_token THEN
      NEW.refresh_token_encrypted := public.encrypt_secret(NEW.refresh_token);
      NEW.refresh_token := ''; -- Clear plaintext
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Step 2: Clear any existing plaintext data (encrypt first if not already done)
-- Bling connections: encrypt existing plaintext tokens then clear
UPDATE bling_connections
SET 
  access_token_encrypted = CASE 
    WHEN access_token_encrypted IS NULL AND access_token != '' THEN public.encrypt_secret(access_token)
    ELSE access_token_encrypted
  END,
  refresh_token_encrypted = CASE 
    WHEN refresh_token_encrypted IS NULL AND refresh_token != '' THEN public.encrypt_secret(refresh_token)
    ELSE refresh_token_encrypted
  END,
  access_token = '',
  refresh_token = ''
WHERE access_token != '' OR refresh_token != '';

-- Email integrations: encrypt existing plaintext passwords then clear
UPDATE email_integrations
SET 
  smtp_password_encrypted = CASE 
    WHEN smtp_password_encrypted IS NULL AND smtp_password != '' THEN public.encrypt_secret(smtp_password)
    ELSE smtp_password_encrypted
  END,
  smtp_password = ''
WHERE smtp_password IS NOT NULL AND smtp_password != '';

-- Melhor Envio tokens: encrypt existing plaintext tokens then clear
UPDATE melhor_envio_tokens
SET 
  access_token_encrypted = CASE 
    WHEN access_token_encrypted IS NULL AND access_token != '' THEN public.encrypt_secret(access_token)
    ELSE access_token_encrypted
  END,
  refresh_token_encrypted = CASE 
    WHEN refresh_token_encrypted IS NULL AND refresh_token != '' THEN public.encrypt_secret(refresh_token)
    ELSE refresh_token_encrypted
  END,
  access_token = '',
  refresh_token = ''
WHERE access_token != '' OR refresh_token != '';