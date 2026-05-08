-- Migrate existing plaintext ME tokens to encrypted columns and clear plaintext
-- Only processes rows that have plaintext but no encrypted version
DO $$
DECLARE
  _rec RECORD;
  _enc_access TEXT;
  _enc_refresh TEXT;
  _migrated INT := 0;
BEGIN
  FOR _rec IN
    SELECT id, access_token, refresh_token
    FROM public.melhor_envio_tokens
    WHERE (access_token IS NOT NULL AND access_token != '' AND (access_token_encrypted IS NULL OR access_token_encrypted = ''))
       OR (refresh_token IS NOT NULL AND refresh_token != '' AND (refresh_token_encrypted IS NULL OR refresh_token_encrypted = ''))
  LOOP
    _enc_access := NULL;
    _enc_refresh := NULL;

    IF _rec.access_token IS NOT NULL AND _rec.access_token != '' THEN
      _enc_access := public.encrypt_secret(_rec.access_token);
    END IF;

    IF _rec.refresh_token IS NOT NULL AND _rec.refresh_token != '' THEN
      _enc_refresh := public.encrypt_secret(_rec.refresh_token);
    END IF;

    UPDATE public.melhor_envio_tokens
    SET access_token = '',
        refresh_token = '',
        access_token_encrypted = COALESCE(_enc_access, access_token_encrypted),
        refresh_token_encrypted = COALESCE(_enc_refresh, refresh_token_encrypted),
        updated_at = now()
    WHERE id = _rec.id;

    _migrated := _migrated + 1;
  END LOOP;

  RAISE NOTICE 'Migrated % melhor_envio_tokens records to encrypted storage', _migrated;
END $$;