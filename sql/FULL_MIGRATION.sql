--
-- PostgreSQL database dump
--

\restrict Ct7uUxV05pnpvQtdkbxbp602a8CnyGOUb2lj6yZvNYyDFeq1NLhZI1gWx0ABRni

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: email_campaign_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.email_campaign_status AS ENUM (
    'draft',
    'scheduled',
    'sending',
    'sent',
    'paused',
    'canceled',
    'error'
);


--
-- Name: email_campaign_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.email_campaign_type AS ENUM (
    'newsletter',
    'promotion',
    'relationship',
    'automation',
    'update'
);


--
-- Name: email_template_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.email_template_type AS ENUM (
    'newsletter',
    'promotional',
    'reactivation',
    'launch',
    'relationship'
);


--
-- Name: instagram_channel_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instagram_channel_status AS ENUM (
    'connected',
    'expiring',
    'expired',
    'error',
    'disconnected'
);


--
-- Name: instagram_delivery_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instagram_delivery_status AS ENUM (
    'pending',
    'sent',
    'delivered',
    'read',
    'failed'
);


--
-- Name: instagram_message_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instagram_message_direction AS ENUM (
    'incoming',
    'outgoing',
    'inbound',
    'outbound'
);


--
-- Name: instagram_outbox_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instagram_outbox_status AS ENUM (
    'queued',
    'processing',
    'sent',
    'failed',
    'dead_letter',
    'pending',
    'retry',
    'sending',
    'dead'
);


--
-- Name: instagram_thread_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.instagram_thread_status AS ENUM (
    'open',
    'pending',
    'bot_active',
    'human_active',
    'paused',
    'closed',
    'spam',
    'blocked'
);


--
-- Name: module_permission; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.module_permission AS ENUM (
    'dashboard',
    'sales',
    'clients',
    'conversations',
    'automations',
    'integrations',
    'settings',
    'coupons',
    'products',
    'contacts',
    'tenants'
);


--
-- Name: team_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.team_role AS ENUM (
    'owner',
    'admin',
    'member'
);


--
-- Name: add_message_to_buffer(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_message_to_buffer(_conversation_id uuid, _message_id text, _delay_seconds integer DEFAULT 3) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.conversations
  SET 
    buffered_message_ids = array_append(
      COALESCE(buffered_message_ids, ARRAY[]::TEXT[]), 
      _message_id
    ),
    pending_ai_response_at = COALESCE(
      pending_ai_response_at,
      NOW() + (_delay_seconds || ' seconds')::INTERVAL
    ),
    updated_at = NOW()
  WHERE id = _conversation_id;
END;
$$;


--
-- Name: add_tokens(uuid, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_tokens(_tenant_id uuid, _amount integer, _type text, _description text DEFAULT NULL::text, _reference_id text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _current_balance integer;
  _new_balance integer;
BEGIN
  -- Get current balance with lock, create if not exists
  SELECT balance INTO _current_balance
  FROM public.tenant_tokens
  WHERE tenant_id = _tenant_id
  FOR UPDATE;
  
  IF _current_balance IS NULL THEN
    -- Create new token record
    INSERT INTO public.tenant_tokens (tenant_id, balance)
    VALUES (_tenant_id, _amount);
    _new_balance := _amount;
  ELSE
    -- Update existing balance
    _new_balance := _current_balance + _amount;
    UPDATE public.tenant_tokens
    SET balance = _new_balance, updated_at = now()
    WHERE tenant_id = _tenant_id;
  END IF;
  
  -- Record transaction
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, reference_id, balance_after)
  VALUES (_tenant_id, _amount, _type, _description, _reference_id, _new_balance);
  
  RETURN true;
END;
$$;


--
-- Name: block_new_signups(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_new_signups() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF coalesce(current_setting('app.allow_signup', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Cadastro desativado' USING ERRCODE = 'P0001';
END;
$$;


--
-- Name: cleanup_old_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_logs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE cutoff timestamptz := NOW() - INTERVAL '90 days';
BEGIN
  DELETE FROM public.ai_usage_logs WHERE created_at < cutoff;
  DELETE FROM public.email_events WHERE created_at < cutoff;
  DELETE FROM public.email_campaign_logs WHERE created_at < cutoff;
  DELETE FROM public.function_metrics WHERE created_at < cutoff;
  DELETE FROM public.instagram_event_log WHERE created_at < cutoff;
  DELETE FROM public.instagram_comment_replies_log WHERE created_at < cutoff;
  DELETE FROM public.instagram_data_collection_events WHERE created_at < cutoff;
END;
$$;


--
-- Name: cleanup_operational_logs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_operational_logs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'cron', 'net'
    AS $$
DECLARE
  cutoff timestamptz := NOW() - INTERVAL '7 days';
BEGIN
  DELETE FROM cron.job_run_details WHERE start_time < cutoff;
  DELETE FROM net._http_response    WHERE created < cutoff;
END;
$$;


--
-- Name: clear_message_buffer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_message_buffer(_conversation_id uuid) RETURNS text[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _buffered_ids TEXT[];
BEGIN
  UPDATE public.conversations
  SET 
    buffered_message_ids = ARRAY[]::TEXT[],
    pending_ai_response_at = NULL,
    updated_at = NOW()
  WHERE id = _conversation_id
  RETURNING buffered_message_ids INTO _buffered_ids;
  
  RETURN _buffered_ids;
END;
$$;


--
-- Name: decrypt_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrypt_secret(_ciphertext text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: deduct_tokens(uuid, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deduct_tokens(_tenant_id uuid, _amount integer, _type text, _description text DEFAULT NULL::text, _reference_id text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _current_balance integer;
  _new_balance integer;
BEGIN
  -- Get current balance with lock
  SELECT balance INTO _current_balance
  FROM public.tenant_tokens
  WHERE tenant_id = _tenant_id
  FOR UPDATE;
  
  -- Check if tenant has tokens record
  IF _current_balance IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if enough tokens
  IF _current_balance < _amount THEN
    RETURN false;
  END IF;
  
  -- Calculate new balance
  _new_balance := _current_balance - _amount;
  
  -- Update balance
  UPDATE public.tenant_tokens
  SET balance = _new_balance, updated_at = now()
  WHERE tenant_id = _tenant_id;
  
  -- Record transaction
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, reference_id, balance_after)
  VALUES (_tenant_id, -_amount, _type, _description, _reference_id, _new_balance);
  
  RETURN true;
END;
$$;


--
-- Name: delete_account_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_account_data(_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _owned_tenant_id uuid;
  _is_owner boolean := false;
  _logs text[] := ARRAY[]::text[];
BEGIN
  -- Check if user owns a tenant
  SELECT id INTO _owned_tenant_id
  FROM public.tenants
  WHERE owner_id = _user_id;

  _is_owner := (_owned_tenant_id IS NOT NULL);

  _logs := array_append(_logs, 'Iniciando exclusão transacional...');

  -- =========================================================
  -- STEP 1: Always remove memberships in OTHER tenants
  -- =========================================================
  IF _is_owner THEN
    -- Owner: remove from teams they don't own
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (
      SELECT id FROM public.team_members
      WHERE user_id = _user_id AND tenant_id != _owned_tenant_id
    );
    DELETE FROM public.team_members
    WHERE user_id = _user_id AND tenant_id != _owned_tenant_id;
    _logs := array_append(_logs, 'Removido de equipes externas');
  ELSE
    -- Member-only: remove from ALL teams
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (
      SELECT id FROM public.team_members WHERE user_id = _user_id
    );
    DELETE FROM public.team_members WHERE user_id = _user_id;
    _logs := array_append(_logs, 'Removido de todas as equipes');
  END IF;

  -- =========================================================
  -- STEP 2: If owner, delete the owned tenant (CASCADE handles 90+ tables)
  -- =========================================================
  IF _is_owner THEN
    DELETE FROM public.bling_webhook_events WHERE tenant_id = _owned_tenant_id;
    _logs := array_append(_logs, 'Webhook events limpos');

    DELETE FROM public.ai_assistant_configs 
    WHERE default_ai_agent_id IN (
      SELECT id FROM public.ai_agents WHERE tenant_id = _owned_tenant_id
    );
    _logs := array_append(_logs, 'AI configs limpos');

    DELETE FROM public.tenants WHERE id = _owned_tenant_id;
    _logs := array_append(_logs, 'Tenant e dados cascateados excluídos');
  END IF;

  -- =========================================================
  -- STEP 3: Always clean up profile and oauth
  -- =========================================================
  DELETE FROM public.profiles WHERE user_id = _user_id;
  _logs := array_append(_logs, 'Perfil excluído');

  DELETE FROM public.oauth_states WHERE user_id = _user_id;

  _logs := array_append(_logs, '✅ Dados excluídos com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'was_owner', _is_owner,
    'tenant_id', _owned_tenant_id,
    'logs', to_jsonb(_logs)
  );
END;
$$;


--
-- Name: delete_integration_cascade(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_integration_cascade(p_integration_id uuid, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_li_customer_ids      uuid[];
  v_li_order_ids         uuid[];
  v_bling_order_ids      uuid[];
  v_conv_ids             uuid[];
  v_rfm_audience_ids     uuid[];
  v_channel_ids          uuid[];
  v_cashback_config_ids  uuid[];
  v_coupon_ids           uuid[];
BEGIN
  SET LOCAL statement_timeout = 0;

  IF NOT EXISTS (
    SELECT 1 FROM public.integrations
    WHERE id = p_integration_id AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Integration not found or access denied';
  END IF;

  -- Self-referential FK
  UPDATE public.integrations
    SET store_integration_id = NULL
    WHERE store_integration_id = p_integration_id;

  -- Collect IDs for multi-level cascades
  SELECT array_agg(id) INTO v_li_customer_ids
    FROM public.li_customers WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_li_order_ids
    FROM public.li_orders WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_bling_order_ids
    FROM public.bling_orders WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_conv_ids
    FROM public.conversations WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_rfm_audience_ids
    FROM public.rfm_audiences WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_channel_ids
    FROM public.whatsapp_channels WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_cashback_config_ids
    FROM public.cashback_configs WHERE integration_id = p_integration_id;

  SELECT array_agg(id) INTO v_coupon_ids
    FROM public.generated_coupons WHERE integration_id = p_integration_id;

  -- NULL out secondary FK references on config tables
  UPDATE public.abandoned_cart_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.birthday_configs
    SET email_integration_id = NULL
    WHERE email_integration_id = p_integration_id;

  UPDATE public.birthday_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.cashback_configs
    SET email_integration_id = NULL
    WHERE email_integration_id = p_integration_id;

  UPDATE public.cashback_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.order_notification_configs
    SET email_integration_id = NULL
    WHERE email_integration_id = p_integration_id;

  UPDATE public.order_notification_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  UPDATE public.reactivation_configs
    SET whatsapp_integration_id = NULL
    WHERE whatsapp_integration_id = p_integration_id;

  -- Second-level: LI
  IF v_li_customer_ids IS NOT NULL THEN
    DELETE FROM public.li_cashback_executions WHERE li_customer_id = ANY(v_li_customer_ids);
    DELETE FROM public.cashback_executions     WHERE li_customer_id = ANY(v_li_customer_ids);
  END IF;

  IF v_li_order_ids IS NOT NULL THEN
    DELETE FROM public.li_order_items WHERE li_order_id = ANY(v_li_order_ids);
  END IF;

  -- Second-level: Bling
  IF v_bling_order_ids IS NOT NULL THEN
    DELETE FROM public.bling_order_items WHERE bling_order_id = ANY(v_bling_order_ids);
  END IF;

  -- Second-level: Conversations
  IF v_conv_ids IS NOT NULL THEN
    DELETE FROM public.messages           WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.conversation_tags  WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.conversation_notes WHERE conversation_id = ANY(v_conv_ids);
    DELETE FROM public.message_reactions  WHERE conversation_id = ANY(v_conv_ids);
  END IF;

  -- Second-level: RFM audiences
  IF v_rfm_audience_ids IS NOT NULL THEN
    DELETE FROM public.rfm_audience_members WHERE audience_id = ANY(v_rfm_audience_ids);
  END IF;

  -- Second-level: WhatsApp channels
  IF v_channel_ids IS NOT NULL THEN
    DELETE FROM public.outbound_queue WHERE channel_id = ANY(v_channel_ids);
    DELETE FROM public.webhook_events  WHERE channel_id = ANY(v_channel_ids);
  END IF;

  -- Second-level: Cashback (executions → reminders → configs/coupons)
  IF v_cashback_config_ids IS NOT NULL OR v_coupon_ids IS NOT NULL THEN
    DELETE FROM public.cashback_executions
      WHERE (v_cashback_config_ids IS NOT NULL AND config_id = ANY(v_cashback_config_ids))
         OR (v_coupon_ids IS NOT NULL AND coupon_id = ANY(v_coupon_ids));

    DELETE FROM public.cashback_reminders
      WHERE (v_cashback_config_ids IS NOT NULL AND config_id = ANY(v_cashback_config_ids))
         OR (v_coupon_ids IS NOT NULL AND coupon_id = ANY(v_coupon_ids));
  END IF;

  -- Direct deletes — children before parents

  -- LI
  DELETE FROM public.li_orders           WHERE integration_id = p_integration_id;
  DELETE FROM public.li_customers        WHERE integration_id = p_integration_id;
  DELETE FROM public.li_products         WHERE integration_id = p_integration_id;
  DELETE FROM public.li_sync_state       WHERE integration_id = p_integration_id;
  DELETE FROM public.li_webhook_events   WHERE integration_id = p_integration_id;

  -- Bling
  DELETE FROM public.bling_orders        WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_customers     WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_products      WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_code_mappings WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_situacoes     WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_sync_jobs     WHERE integration_id = p_integration_id;
  DELETE FROM public.bling_sync_logs     WHERE integration_id = p_integration_id;

  -- Melhor Envio
  DELETE FROM public.me_auto_sync_configs WHERE integration_id = p_integration_id;
  DELETE FROM public.me_shipments         WHERE integration_id = p_integration_id;
  DELETE FROM public.me_sync_jobs         WHERE integration_id = p_integration_id;

  -- Conversations / channels
  DELETE FROM public.conversations     WHERE integration_id = p_integration_id;
  DELETE FROM public.whatsapp_channels WHERE integration_id = p_integration_id;
  DELETE FROM public.inboxes           WHERE integration_id = p_integration_id;
  DELETE FROM public.leads             WHERE integration_id = p_integration_id;

  -- RFM
  DELETE FROM public.rfm_audiences                   WHERE integration_id = p_integration_id;
  DELETE FROM public.rfm_alerts                      WHERE integration_id = p_integration_id;
  DELETE FROM public.customer_rfm_snapshots          WHERE integration_id = p_integration_id;
  DELETE FROM public.customer_rfm_category_snapshots WHERE integration_id = p_integration_id;

  -- Cashback / coupons (reminders and executions already deleted above)
  DELETE FROM public.cashback_configs  WHERE integration_id = p_integration_id;
  DELETE FROM public.generated_coupons WHERE integration_id = p_integration_id;

  -- Campaigns / email
  DELETE FROM public.bulk_campaigns           WHERE whatsapp_integration_id = p_integration_id;
  DELETE FROM public.email_campaigns          WHERE email_integration_id    = p_integration_id;
  DELETE FROM public.email_integration_senders WHERE integration_id         = p_integration_id;

  -- Configs
  DELETE FROM public.abandoned_cart_configs     WHERE integration_id = p_integration_id;
  DELETE FROM public.abandoned_carts            WHERE integration_id = p_integration_id;
  DELETE FROM public.ai_agents                  WHERE store_integration_id = p_integration_id;
  DELETE FROM public.birthday_configs           WHERE integration_id = p_integration_id;
  DELETE FROM public.order_notification_configs WHERE integration_id = p_integration_id;
  DELETE FROM public.reactivation_configs       WHERE integration_id = p_integration_id;

  -- Finally the integration itself
  DELETE FROM public.integrations
    WHERE id = p_integration_id AND tenant_id = p_tenant_id;

END;
$$;


--
-- Name: encrypt_ai_credentials(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_ai_credentials() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: encrypt_bling_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_bling_tokens() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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
$$;


--
-- Name: encrypt_email_smtp_password(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_email_smtp_password() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  IF NEW.smtp_password IS NOT NULL AND NEW.smtp_password != '' THEN
    IF OLD IS NULL OR NEW.smtp_password IS DISTINCT FROM OLD.smtp_password THEN
      NEW.smtp_password_encrypted := public.encrypt_secret(NEW.smtp_password);
      NEW.smtp_password := ''; -- Clear plaintext
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: encrypt_melhor_envio_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_melhor_envio_tokens() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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
$$;


--
-- Name: encrypt_nuvemshop_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_nuvemshop_tokens() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token != '' THEN
    IF OLD IS NULL OR NEW.access_token IS DISTINCT FROM OLD.access_token THEN
      NEW.access_token_encrypted := public.encrypt_secret(NEW.access_token);
      NEW.access_token := '';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: encrypt_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encrypt_secret(_plaintext text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: estimate_email_audience(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estimate_email_audience(_audience_type text, _audience_reference jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _tenant_id uuid;
  _seg_id uuid;
  _rfm_audience_id uuid;
  _ref jsonb := COALESCE(_audience_reference, '{}'::jsonb);
  _filters jsonb := COALESCE(_audience_reference->'filters', '{}'::jsonb);
  _integration_id uuid;
  _tag_ids uuid[];
  _name_contains text;
  _email_contains text;
  _phone_contains text;
  _doc_contains text;
  _updated_from timestamptz;
  _updated_to timestamptz;
  _emails text[];
  _total int := 0;
  _suppressed int := 0;
BEGIN
  _tenant_id := public.get_user_tenant_id(auth.uid());
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF _audience_type = 'segment' THEN
    _seg_id := NULLIF(_ref->>'segment_id', '')::uuid;
    IF _seg_id IS NULL THEN
      RAISE EXCEPTION 'segment_id is required';
    END IF;
    SELECT filters INTO _filters
    FROM public.crm_segments
    WHERE id = _seg_id AND tenant_id = _tenant_id;
    IF _filters IS NULL THEN
      RAISE EXCEPTION 'segment not found';
    END IF;
  END IF;

  IF _audience_type = 'rfm' THEN
    _rfm_audience_id := NULLIF(_ref->>'rfm_audience_id', '')::uuid;
    IF _rfm_audience_id IS NULL THEN
      RAISE EXCEPTION 'rfm_audience_id is required';
    END IF;
    WITH rfm_emails AS (
      SELECT DISTINCT lower(trim(COALESCE(s.customer_email, s.customer_data->>'email'))) AS email
      FROM public.rfm_audience_members am
      JOIN public.customer_rfm_snapshots s ON s.id = am.snapshot_id
      WHERE am.audience_id = _rfm_audience_id AND am.tenant_id = _tenant_id
        AND (s.customer_email IS NOT NULL OR s.customer_data->>'email' IS NOT NULL)
    ), suppressed AS (
      SELECT count(*)::int AS cnt FROM rfm_emails e
      JOIN public.email_suppression_list sl ON sl.tenant_id = _tenant_id AND lower(sl.email) = e.email
        AND sl.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT (SELECT count(*)::int FROM rfm_emails WHERE email IS NOT NULL AND email <> ''),
           (SELECT cnt FROM suppressed) INTO _total, _suppressed;
    RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
  END IF;

  IF _audience_type = 'manual' THEN
    SELECT COALESCE(array_agg(value::text), ARRAY[]::text[]) INTO _emails
    FROM jsonb_array_elements_text(COALESCE(_ref->'emails', '[]'::jsonb));
    WITH candidates AS (
      SELECT DISTINCT lower(trim(e)) AS email FROM unnest(_emails) e WHERE e IS NOT NULL AND trim(e) <> ''
    ), suppressed AS (
      SELECT count(*)::int AS cnt FROM candidates c
      JOIN public.email_suppression_list s ON s.tenant_id = _tenant_id AND lower(s.email) = c.email
        AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
    )
    SELECT (SELECT count(*)::int FROM candidates), (SELECT cnt FROM suppressed) INTO _total, _suppressed;
    RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
  END IF;

  -- all / filters / custom / segment all use filter-based resolution
  _integration_id := NULLIF(_filters->>'integration_id', '')::uuid;
  IF jsonb_typeof(_filters->'tag_ids') = 'array' THEN
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[]) INTO _tag_ids FROM jsonb_array_elements_text(_filters->'tag_ids');
  ELSE _tag_ids := NULL; END IF;
  _name_contains := NULLIF(_filters->>'name_contains', '');
  _email_contains := NULLIF(_filters->>'email_contains', '');
  _phone_contains := NULLIF(_filters->>'phone_contains', '');
  _doc_contains := NULLIF(_filters->>'doc_contains', '');
  _updated_from := NULLIF(_filters->>'updated_from', '')::timestamptz;
  _updated_to := NULLIF(_filters->>'updated_to', '')::timestamptz;

  WITH candidates AS (
    SELECT DISTINCT lower(c.email) AS email FROM public.li_customers c
    WHERE c.tenant_id = _tenant_id AND c.email IS NOT NULL
      AND (_integration_id IS NULL OR c.integration_id = _integration_id)
      AND (_name_contains IS NULL OR c.name ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR c.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR c.phone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR c.doc ILIKE '%' || _doc_contains || '%')
      AND (_updated_from IS NULL OR c.updated_at_local >= _updated_from)
      AND (_updated_to IS NULL OR c.updated_at_local <= _updated_to)
      AND (_tag_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.customer_tags ct WHERE ct.tenant_id = _tenant_id AND ct.customer_id = c.id AND ct.tag_id = ANY(_tag_ids)
      ))
    UNION
    SELECT DISTINCT lower(bc.email) AS email FROM public.bling_customers bc
    WHERE bc.tenant_id = _tenant_id AND bc.email IS NOT NULL
      AND (_integration_id IS NULL OR bc.integration_id = _integration_id)
      AND (_name_contains IS NULL OR bc.nome ILIKE '%' || _name_contains || '%')
      AND (_email_contains IS NULL OR bc.email ILIKE '%' || _email_contains || '%')
      AND (_phone_contains IS NULL OR bc.celular ILIKE '%' || _phone_contains || '%' OR bc.telefone ILIKE '%' || _phone_contains || '%')
      AND (_doc_contains IS NULL OR bc.cpf_cnpj ILIKE '%' || _doc_contains || '%')
  ), suppressed AS (
    SELECT count(*)::int AS cnt FROM candidates cand
    JOIN public.email_suppression_list s ON s.tenant_id = _tenant_id AND lower(s.email) = cand.email
      AND s.reason IN ('unsubscribed','bounced','complained','invalid','blocked')
  )
  SELECT (SELECT count(*)::int FROM candidates), (SELECT cnt FROM suppressed) INTO _total, _suppressed;

  RETURN jsonb_build_object('total_with_email', _total, 'suppressed', _suppressed, 'eligible', GREATEST(_total - _suppressed, 0));
END;
$$;


--
-- Name: functions_base_url(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.functions_base_url() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(nullif(current_setting('app.settings.functions_url', true), ''), 'https://api.spypro.com.br');
$$;


--
-- Name: get_best_send_days(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_best_send_days(p_tenant_id uuid) RETURNS TABLE(day_of_week integer, open_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT
    EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Sao_Paulo')::INTEGER,
    COUNT(*)
  FROM public.email_events
  WHERE tenant_id = p_tenant_id
    AND event_type = 'open'
    AND created_at >= NOW() - INTERVAL '90 days'
  GROUP BY 1
  ORDER BY COUNT(*) DESC;
$$;


--
-- Name: get_best_send_hours(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_best_send_hours(p_tenant_id uuid) RETURNS TABLE(hour_of_day integer, open_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  SELECT
    EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::INTEGER,
    COUNT(*)
  FROM public.email_events
  WHERE tenant_id = p_tenant_id
    AND event_type = 'open'
    AND created_at >= NOW() - INTERVAL '90 days'
  GROUP BY 1
  ORDER BY COUNT(*) DESC;
$$;


--
-- Name: get_cron_job_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cron_job_status() RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'cron'
    AS $$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'invoke-li-reconciliation-processor-every-3-min'
  LIMIT 1;
$$;


--
-- Name: get_cron_last_run(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cron_last_run() RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'cron'
    AS $$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'invoke-li-reconciliation-processor-every-3-min'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$$;


--
-- Name: get_dashboard_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_stats(_tenant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb;
  _start_this_month timestamptz := date_trunc('month', now());
  _start_last_month timestamptz := date_trunc('month', now() - interval '1 month');
  _end_last_month timestamptz := date_trunc('month', now());
  _30d_ago timestamptz := now() - interval '30 days';
  
  -- Revenue vars
  _li_revenue_this_month numeric := 0;
  _li_orders_this_month bigint := 0;
  _li_revenue_last_month numeric := 0;
  _bling_revenue_this_month numeric := 0;
  _bling_orders_this_month bigint := 0;
  _bling_revenue_last_month numeric := 0;
  _avg_ticket numeric := 0;
  _total_revenue_this_month numeric := 0;
  _total_orders_this_month bigint := 0;
  _revenue_change numeric := 0;
  
  -- Messages
  _msgs_sent bigint := 0;
  _msgs_received bigint := 0;
  
  -- RFM summary
  _rfm_summary jsonb := '[]'::jsonb;
  
  -- Sales by day
  _sales_by_day jsonb := '[]'::jsonb;
  
  -- Delivered counts
  _me_delivered_this_month bigint := 0;
  _me_delivered_30d bigint := 0;
  
  -- Effective LI statuses array
  _effective_statuses text[] := ARRAY['Pedido Entregue', 'Pedido Enviado', 'Pedido Pago'];
BEGIN
  -- LI Revenue this month (effective statuses including Pedido Pago)
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0), COUNT(*)
  INTO _li_revenue_this_month, _li_orders_this_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name = ANY(_effective_statuses)
    AND created_at_remote >= _start_this_month;

  -- LI Revenue last month
  SELECT COALESCE(SUM((totals_json->>'total')::numeric), 0)
  INTO _li_revenue_last_month
  FROM li_orders
  WHERE tenant_id = _tenant_id
    AND status_name = ANY(_effective_statuses)
    AND created_at_remote >= _start_last_month
    AND created_at_remote < _end_last_month;

  -- Bling Revenue this month
  SELECT COALESCE(SUM(valor_total), 0), COUNT(*)
  INTO _bling_revenue_this_month, _bling_orders_this_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_this_month;

  -- Bling Revenue last month
  SELECT COALESCE(SUM(valor_total), 0)
  INTO _bling_revenue_last_month
  FROM bling_orders
  WHERE tenant_id = _tenant_id
    AND data_criacao >= _start_last_month
    AND data_criacao < _end_last_month;

  _total_revenue_this_month := _li_revenue_this_month + _bling_revenue_this_month;
  _total_orders_this_month := _li_orders_this_month + _bling_orders_this_month;
  
  IF _total_orders_this_month > 0 THEN
    _avg_ticket := _total_revenue_this_month / _total_orders_this_month;
  END IF;

  DECLARE
    _total_last numeric := _li_revenue_last_month + _bling_revenue_last_month;
  BEGIN
    IF _total_last > 0 THEN
      _revenue_change := ROUND(((_total_revenue_this_month - _total_last) / _total_last) * 100);
    END IF;
  END;

  -- Messages last 30 days
  SELECT 
    COUNT(*) FILTER (WHERE direction = 'outgoing'),
    COUNT(*) FILTER (WHERE direction = 'incoming')
  INTO _msgs_sent, _msgs_received
  FROM messages
  WHERE tenant_id = _tenant_id
    AND created_at >= _30d_ago;

  -- RFM Summary (latest snapshot)
  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO _rfm_summary
  FROM (
    SELECT segment_name, COUNT(*) as count
    FROM customer_rfm_snapshots
    WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      AND reference_date = (
        SELECT MAX(reference_date) FROM customer_rfm_snapshots 
        WHERE integration_id IN (SELECT id FROM integrations WHERE tenant_id = _tenant_id)
      )
    GROUP BY segment_name
    ORDER BY count DESC
  ) r;

  -- Sales by day (last 30 days) - combined LI + Bling
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.date), '[]'::jsonb)
  INTO _sales_by_day
  FROM (
    SELECT d::date as date, 
      COALESCE(li.revenue, 0) + COALESCE(bl.revenue, 0) as total,
      COALESCE(li.cnt, 0) + COALESCE(bl.cnt, 0) as count
    FROM generate_series(_30d_ago::date, now()::date, '1 day') d
    LEFT JOIN (
      SELECT created_at_remote::date as day, 
        SUM((totals_json->>'total')::numeric) as revenue,
        COUNT(*) as cnt
      FROM li_orders
      WHERE tenant_id = _tenant_id
        AND status_name = ANY(_effective_statuses)
        AND created_at_remote >= _30d_ago
      GROUP BY day
    ) li ON li.day = d::date
    LEFT JOIN (
      SELECT data_criacao::date as day,
        SUM(valor_total) as revenue,
        COUNT(*) as cnt
      FROM bling_orders
      WHERE tenant_id = _tenant_id
        AND data_criacao >= _30d_ago
      GROUP BY day
    ) bl ON bl.day = d::date
  ) r;

  -- ME delivered counts
  SELECT COUNT(*) INTO _me_delivered_this_month
  FROM me_shipments
  WHERE tenant_id = _tenant_id AND status = 'delivered' AND delivered_at >= _start_this_month;
  
  SELECT COUNT(*) INTO _me_delivered_30d
  FROM me_shipments
  WHERE tenant_id = _tenant_id AND status = 'delivered' AND delivered_at >= _30d_ago;

  -- Top products (this month, with 30d fallback)
  DECLARE
    _top_products jsonb := '[]'::jsonb;
    _top_products_30d jsonb := '[]'::jsonb;
  BEGIN
    -- This month
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        SELECT boi.produto_nome as name, COALESCE(boi.quantidade, 0) as quantity, COALESCE(boi.valor_total, 0) as revenue
        FROM bling_order_items boi
        JOIN bling_orders bo ON bo.id = boi.order_id
        WHERE boi.tenant_id = _tenant_id
          AND bo.data_criacao >= _start_this_month
        UNION ALL
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND o.status_name = ANY(_effective_statuses)
          AND o.created_at_remote >= _start_this_month
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    -- Last 30 days (fallback)
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    INTO _top_products_30d
    FROM (
      SELECT name, SUM(quantity) as quantity, SUM(revenue) as revenue
      FROM (
        SELECT boi.produto_nome as name, COALESCE(boi.quantidade, 0) as quantity, COALESCE(boi.valor_total, 0) as revenue
        FROM bling_order_items boi
        JOIN bling_orders bo ON bo.id = boi.order_id
        WHERE boi.tenant_id = _tenant_id
          AND bo.data_criacao >= _30d_ago
        UNION ALL
        SELECT oi.name, COALESCE(oi.qty, 0), COALESCE(oi.price, 0) * COALESCE(oi.qty, 0)
        FROM li_order_items oi
        JOIN li_orders o ON o.id = oi.order_id
        WHERE oi.tenant_id = _tenant_id
          AND o.status_name = ANY(_effective_statuses)
          AND o.created_at_remote >= _30d_ago
      ) combined
      WHERE name IS NOT NULL
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    ) r;

    result := jsonb_build_object(
      'total_revenue_this_month', _total_revenue_this_month,
      'total_orders_this_month', _total_orders_this_month,
      'revenue_change', _revenue_change,
      'avg_ticket', ROUND(_avg_ticket, 2),
      'msgs_sent_30d', _msgs_sent,
      'msgs_received_30d', _msgs_received,
      'rfm_summary', _rfm_summary,
      'sales_by_day', _sales_by_day,
      'top_products', _top_products,
      'top_products_30d', _top_products_30d,
      'me_delivered_this_month', _me_delivered_this_month,
      'me_delivered_30d', _me_delivered_30d
    );
  END;

  RETURN result;
END;
$$;


--
-- Name: get_internal_headers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_internal_headers() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1),
      'missing-cron-secret'
    )
  );
$$;


--
-- Name: get_me_cron_job_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_me_cron_job_status() RETURNS TABLE(jobid bigint, schedule text, active boolean, jobname text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'cron'
    AS $$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'melhor-envio-sync-hourly'
  LIMIT 1;
$$;


--
-- Name: get_me_cron_last_run(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_me_cron_last_run() RETURNS TABLE(runid bigint, job_pid integer, status text, start_time timestamp with time zone, end_time timestamp with time zone, return_message text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'cron'
    AS $$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'melhor-envio-sync-hourly'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$$;


--
-- Name: get_revenue_attribution(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_attribution(p_tenant_id uuid, p_lookback_days integer DEFAULT 90) RETURNS TABLE(campaign_id uuid, campaign_name text, sent_count bigint, opens bigint, clicks bigint, attributed_customers bigint, attributed_revenue numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
  WITH engaged AS (
    SELECT DISTINCT
      ee.campaign_id,
      ee.recipient_email,
      MAX(CASE WHEN ee.event_type = 'open'  THEN 1 ELSE 0 END) AS had_open,
      MAX(CASE WHEN ee.event_type = 'click' THEN 1 ELSE 0 END) AS had_click
    FROM public.email_events ee
    WHERE ee.tenant_id = p_tenant_id
      AND ee.event_type IN ('open', 'click')
      AND ee.created_at >= NOW() - (p_lookback_days || ' days')::INTERVAL
    GROUP BY ee.campaign_id, ee.recipient_email
  ),
  per_campaign AS (
    SELECT
      e.campaign_id,
      SUM(e.had_open)                            AS opens,
      SUM(e.had_click)                           AS clicks,
      COUNT(DISTINCT e.recipient_email)          AS unique_engaged,
      COALESCE(SUM(s.revenue_total), 0)          AS attributed_revenue
    FROM engaged e
    LEFT JOIN public.customer_rfm_snapshots s
      ON s.tenant_id = p_tenant_id
      AND LOWER(s.customer_email) = LOWER(e.recipient_email)
    GROUP BY e.campaign_id
  )
  SELECT
    ec.id                                AS campaign_id,
    ec.internal_name                     AS campaign_name,
    COALESCE(ec.total_sent, 0)::BIGINT    AS sent_count,
    COALESCE(pc.opens, 0)::BIGINT        AS opens,
    COALESCE(pc.clicks, 0)::BIGINT       AS clicks,
    COALESCE(pc.unique_engaged, 0)       AS attributed_customers,
    COALESCE(pc.attributed_revenue, 0)   AS attributed_revenue
  FROM public.email_campaigns ec
  LEFT JOIN per_campaign pc ON pc.campaign_id = ec.id
  WHERE ec.tenant_id = p_tenant_id
    AND ec.status = 'sent'
  ORDER BY COALESCE(pc.attributed_revenue, 0) DESC
  LIMIT 25;
$$;


--
-- Name: get_tenant_token_balance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_token_balance(_tenant_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(balance, 0) FROM public.tenant_tokens WHERE tenant_id = _tenant_id;
$$;


--
-- Name: get_user_tenant_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_tenant_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    -- 1. Explicit active tenant (if user still has access)
    (
      SELECT p.active_tenant_id 
      FROM public.profiles p 
      WHERE p.user_id = _user_id 
        AND p.active_tenant_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p.active_tenant_id AND t.owner_id = _user_id)
          OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.tenant_id = p.active_tenant_id AND tm.user_id = _user_id)
        )
    ),
    -- 2. Fallback: tenant where user is owner
    (SELECT id FROM public.tenants WHERE owner_id = _user_id LIMIT 1),
    -- 3. Fallback: tenant via team membership
    (SELECT tenant_id FROM public.team_members WHERE user_id = _user_id LIMIT 1)
  );
$$;


--
-- Name: get_user_tenants(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_tenants(_user_id uuid) RETURNS TABLE(tenant_id uuid, tenant_name text, role text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Tenants owned by user
  SELECT t.id AS tenant_id, t.name AS tenant_name, 'owner'::text AS role
  FROM public.tenants t
  WHERE t.owner_id = _user_id
  UNION
  -- Tenants via team membership
  SELECT tm.tenant_id, t.name AS tenant_name, tm.role::text
  FROM public.team_members tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = _user_id;
$$;


--
-- Name: handle_new_tenant_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_tenant_tokens() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.tenant_tokens (tenant_id, balance)
  VALUES (NEW.id, 100);

  INSERT INTO public.token_transactions (tenant_id, amount, type, description, balance_after)
  VALUES (NEW.id, 100, 'credit', 'Crédito inicial de boas-vindas', 100);

  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, company_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'company_name');

  IF (NEW.raw_user_meta_data ->> 'is_team_member')::boolean IS NOT TRUE THEN
    IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
      INSERT INTO public.tenants (owner_id, name)
      VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Minha Empresa'))
      RETURNING id INTO _tenant_id;

      INSERT INTO public.team_members (tenant_id, user_id, role)
      VALUES (_tenant_id, NEW.id, 'admin');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: has_enough_tokens(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_enough_tokens(_tenant_id uuid, _amount integer) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(balance, 0) >= _amount FROM public.tenant_tokens WHERE tenant_id = _tenant_id;
$$;


--
-- Name: has_module_permission(uuid, public.module_permission, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_module_permission(_user_id uuid, _module public.module_permission, _require_edit boolean DEFAULT false) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 
    -- Owners have all permissions
    EXISTS (SELECT 1 FROM public.tenants WHERE owner_id = _user_id)
    OR
    -- Admins have all permissions
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE user_id = _user_id AND role IN ('owner', 'admin')
    )
    OR
    -- Members need explicit permission
    EXISTS (
      SELECT 1 FROM public.member_permissions mp
      JOIN public.team_members tm ON tm.id = mp.team_member_id
      WHERE tm.user_id = _user_id 
        AND mp.permission = _module
        AND mp.can_view = true
        AND (NOT _require_edit OR mp.can_edit = true)
    );
$$;


--
-- Name: increment_campaign_unsubscribed(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_campaign_unsubscribed(_campaign_id uuid, _tenant_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.email_campaigns
  SET total_unsubscribed = COALESCE(total_unsubscribed, 0) + 1
  WHERE id = _campaign_id AND tenant_id = _tenant_id;
$$;


--
-- Name: increment_cta_click_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_cta_click_count(p_cta_link_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE instagram_cta_links
  SET click_count = COALESCE(click_count, 0) + 1
  WHERE id = p_cta_link_id;
$$;


--
-- Name: is_tenant_admin(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_tenant_admin(_user_id uuid, _tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_members WHERE tenant_id = _tenant_id AND user_id = _user_id AND role IN ('owner', 'admin')
  );
$$;


--
-- Name: leave_team_memberships(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.leave_team_memberships(_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _removed_count integer := 0;
  _logs text[] := ARRAY[]::text[];
BEGIN
  _logs := array_append(_logs, 'Removendo participações em equipes...');

  -- Remove permissions first
  DELETE FROM public.member_permissions
  WHERE team_member_id IN (
    SELECT id FROM public.team_members WHERE user_id = _user_id
  );

  -- Remove team memberships
  WITH deleted AS (
    DELETE FROM public.team_members WHERE user_id = _user_id RETURNING id
  )
  SELECT count(*) INTO _removed_count FROM deleted;

  _logs := array_append(_logs, format('Removido de %s equipe(s)', _removed_count));
  _logs := array_append(_logs, '✅ Saiu de todas as equipes com sucesso');

  RETURN jsonb_build_object(
    'success', true,
    'removed_count', _removed_count,
    'logs', to_jsonb(_logs)
  );
END;
$$;


--
-- Name: link_me_shipments_to_orders(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_me_shipments_to_orders(p_me_integration_id uuid, p_store_integration_id uuid, p_store_type text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_linked INTEGER := 0;
  v_total INTEGER := 0;
  v_already_linked INTEGER := 0;
BEGIN
  -- Count total
  SELECT COUNT(*) INTO v_total FROM me_shipments WHERE integration_id = p_me_integration_id;

  IF p_store_type = 'loja_integrada' THEN
    -- Count already linked
    SELECT COUNT(*) INTO v_already_linked FROM me_shipments 
    WHERE integration_id = p_me_integration_id AND li_order_id IS NOT NULL;

    -- Batch update
    WITH matched AS (
      UPDATE me_shipments ms
      SET li_order_id = lo.id
      FROM li_orders lo
      WHERE lo.integration_id = p_store_integration_id
        AND lo.order_number = ms.external_order_number
        AND ms.integration_id = p_me_integration_id
        AND ms.li_order_id IS NULL
        AND ms.external_order_number IS NOT NULL
      RETURNING ms.id
    )
    SELECT COUNT(*) INTO v_linked FROM matched;

  ELSIF p_store_type = 'bling' THEN
    SELECT COUNT(*) INTO v_already_linked FROM me_shipments 
    WHERE integration_id = p_me_integration_id AND bling_order_id IS NOT NULL;

    WITH matched AS (
      UPDATE me_shipments ms
      SET bling_order_id = bo.id
      FROM bling_orders bo
      WHERE bo.integration_id = p_store_integration_id
        AND bo.numero = ms.external_order_number
        AND ms.integration_id = p_me_integration_id
        AND ms.bling_order_id IS NULL
        AND ms.external_order_number IS NOT NULL
      RETURNING ms.id
    )
    SELECT COUNT(*) INTO v_linked FROM matched;
  END IF;

  RETURN json_build_object(
    'linked_now', v_linked,
    'already_linked', v_already_linked,
    'total', v_total
  );
END;
$$;


--
-- Name: loyalty_calculate(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.loyalty_calculate(p_integration_id uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id UUID;
  v_program   RECORD;
  v_integration RECORD;
  v_since     TIMESTAMPTZ;
  v_credited  INT;
  v_scanned   INT;
  v_batch_at  TIMESTAMPTZ;
BEGIN
  v_tenant_id := get_user_tenant_id(auth.uid());
  IF v_tenant_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_program
  FROM loyalty_programs
  WHERE integration_id = p_integration_id
    AND tenant_id = v_tenant_id
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Programa de fidelidade não configurado');
  END IF;

  SELECT id, type INTO v_integration
  FROM integrations
  WHERE id = p_integration_id AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Integração não encontrada');
  END IF;

  v_since    := COALESCE(p_since, NOW() - INTERVAL '30 days');
  v_batch_at := NOW();  -- FIX: was clock_timestamp() (wall clock, > now()); use txn time so filter matches inserted rows

  IF v_integration.type = 'bling' THEN
    INSERT INTO loyalty_points (
      tenant_id, integration_id, customer_external_id,
      customer_name, customer_phone, points, type, description, order_id
    )
    SELECT
      v_tenant_id,
      p_integration_id,
      COALESCE(bo.customer_phone, bo.customer_name, ''),
      bo.customer_name,
      bo.customer_phone,
      GREATEST(1, FLOOR(
        bo.total_value::NUMERIC * v_program.points_per_brl *
        CASE WHEN EXISTS (
          SELECT 1 FROM customer_rfm_snapshots rr
          WHERE rr.integration_id = p_integration_id
            AND rr.segment_name = 'Champions'
            AND rr.customer_id::TEXT = COALESCE(bo.customer_phone, bo.customer_name, '')
        ) THEN v_program.champion_multiplier ELSE 1 END
      ))::INT,
      'earn',
      'Pedido #' || bo.bling_order_id::TEXT,
      bo.bling_order_id::TEXT
    FROM bling_orders bo
    WHERE bo.integration_id = p_integration_id
      AND bo.situation IN ('Em aberto', 'Atendido', 'Faturado')
      AND bo.created_at >= v_since
      AND COALESCE(bo.customer_phone, bo.customer_name, '') <> ''
      AND bo.total_value > 0
      AND NOT EXISTS (
        SELECT 1 FROM loyalty_points lp
        WHERE lp.integration_id = p_integration_id
          AND lp.type = 'earn'
          AND lp.order_id = bo.bling_order_id::TEXT
      )
    LIMIT 1000;

    GET DIAGNOSTICS v_credited = ROW_COUNT;

    SELECT COUNT(*) INTO v_scanned
    FROM bling_orders
    WHERE integration_id = p_integration_id
      AND situation IN ('Em aberto', 'Atendido', 'Faturado')
      AND created_at >= v_since;

  ELSE
    INSERT INTO loyalty_points (
      tenant_id, integration_id, customer_external_id,
      customer_name, customer_phone, points, type, description, order_id
    )
    SELECT
      v_tenant_id,
      p_integration_id,
      COALESCE(lo.customer_phone, lo.customer_name, lo.customer_id::TEXT, ''),
      lo.customer_name,
      lo.customer_phone,
      GREATEST(1, FLOOR(
        lo.valor_total::NUMERIC * v_program.points_per_brl *
        CASE WHEN EXISTS (
          SELECT 1 FROM customer_rfm_snapshots rr
          WHERE rr.integration_id = p_integration_id
            AND rr.segment_name = 'Champions'
            AND (rr.customer_id = lo.customer_id
              OR rr.customer_id::TEXT = COALESCE(lo.customer_phone, lo.customer_name, ''))
        ) THEN v_program.champion_multiplier ELSE 1 END
      ))::INT,
      'earn',
      'Pedido #' || lo.loja_integrada_order_id::TEXT,
      lo.loja_integrada_order_id::TEXT
    FROM li_orders lo
    WHERE lo.integration_id = p_integration_id
      AND lo.created_at >= v_since
      AND COALESCE(lo.customer_phone, lo.customer_name, lo.customer_id::TEXT, '') <> ''
      AND lo.valor_total > 0
      AND NOT EXISTS (
        SELECT 1 FROM loyalty_points lp
        WHERE lp.integration_id = p_integration_id
          AND lp.type = 'earn'
          AND lp.order_id = lo.loja_integrada_order_id::TEXT
      )
    LIMIT 1000;

    GET DIAGNOSTICS v_credited = ROW_COUNT;

    SELECT COUNT(*) INTO v_scanned
    FROM li_orders
    WHERE integration_id = p_integration_id
      AND created_at >= v_since;
  END IF;

  -- Enfileirar notificações WhatsApp para os pontos recém-creditados
  IF v_program.notify_via_whatsapp
     AND v_program.whatsapp_integration_id IS NOT NULL
     AND v_credited > 0
  THEN
    INSERT INTO message_queue (
      tenant_id, channel, recipient, message_content,
      whatsapp_integration_id, reference_type, metadata
    )
    SELECT
      v_tenant_id,
      'whatsapp',
      lp.customer_phone,
      REPLACE(
        REPLACE(
          REPLACE(
            v_program.notification_template_earn,
            '{{cliente_primeiro_nome}}', COALESCE(split_part(lp.customer_name, ' ', 1), 'Cliente')
          ),
          '{{pontos}}', lp.points::text
        ),
        '{{total_pontos}}', (
          SELECT COALESCE(SUM(lp2.points), 0)::text
          FROM loyalty_points lp2
          WHERE lp2.integration_id = p_integration_id
            AND lp2.customer_external_id = lp.customer_external_id
        )
      ),
      v_program.whatsapp_integration_id,
      'loyalty_earn',
      jsonb_build_object('integration_id', p_integration_id, 'points_earned', lp.points)
    FROM loyalty_points lp
    WHERE lp.integration_id = p_integration_id
      AND lp.type = 'earn'
      AND lp.created_at >= v_batch_at
      AND lp.customer_phone IS NOT NULL
      AND lp.customer_phone <> '';
  END IF;

  RETURN json_build_object('success', true, 'credited', v_credited, 'scanned', v_scanned);
END;
$$;


--
-- Name: loyalty_redeem(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.loyalty_redeem(p_integration_id uuid, p_customer_external_id text, p_points_to_redeem integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tenant_id    UUID;
  v_program      RECORD;
  v_balance      INT;
  v_coupon_value NUMERIC;
  v_coupon_code  TEXT;
  v_customer_name  TEXT;
  v_customer_phone TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i INT;
BEGIN
  v_tenant_id := get_user_tenant_id(auth.uid());
  IF v_tenant_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  IF p_points_to_redeem <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'pointsToRedeem deve ser positivo');
  END IF;

  SELECT * INTO v_program
  FROM loyalty_programs
  WHERE integration_id = p_integration_id
    AND tenant_id = v_tenant_id
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Programa de fidelidade não configurado');
  END IF;

  IF p_points_to_redeem < v_program.min_points_redeem THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Mínimo para resgate: ' || v_program.min_points_redeem || ' pontos'
    );
  END IF;

  SELECT COALESCE(SUM(points), 0) INTO v_balance
  FROM loyalty_points
  WHERE integration_id = p_integration_id
    AND tenant_id = v_tenant_id
    AND customer_external_id = p_customer_external_id;

  IF v_balance < p_points_to_redeem THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Saldo insuficiente (' || v_balance || ' pontos disponíveis)'
    );
  END IF;

  SELECT customer_name, customer_phone INTO v_customer_name, v_customer_phone
  FROM loyalty_points
  WHERE integration_id = p_integration_id
    AND customer_external_id = p_customer_external_id
    AND customer_name IS NOT NULL
  LIMIT 1;

  -- Gerar código do cupom: PONTOS + 6 chars aleatórios
  v_coupon_code := 'PONTOS';
  FOR v_i IN 1..6 LOOP
    v_coupon_code := v_coupon_code ||
      substr(v_chars, (floor(random() * length(v_chars)))::INT + 1, 1);
  END LOOP;

  v_coupon_value := ROUND(p_points_to_redeem * v_program.points_to_brl, 2);

  INSERT INTO generated_coupons (
    tenant_id, integration_id, coupon_code, discount_percentage,
    coupon_value, customer_name, customer_phone, source, coupon_type,
    coupon_description, expires_at, li_quantidade_usada, li_quantidade_uso_maximo
  ) VALUES (
    v_tenant_id, p_integration_id, v_coupon_code, 0,
    v_coupon_value, v_customer_name, v_customer_phone, 'loyalty', 'valor_absoluto',
    'Resgate de ' || p_points_to_redeem || ' pontos',
    NOW() + INTERVAL '90 days', 0, 1
  );

  INSERT INTO loyalty_points (
    tenant_id, integration_id, customer_external_id,
    customer_name, customer_phone, points, type, description, coupon_code
  ) VALUES (
    v_tenant_id, p_integration_id, p_customer_external_id,
    v_customer_name, v_customer_phone, -p_points_to_redeem,
    'redeem', 'Resgate de cupom ' || v_coupon_code, v_coupon_code
  );

  -- Enfileirar notificação WhatsApp de resgate
  IF v_program.notify_via_whatsapp
     AND v_program.whatsapp_integration_id IS NOT NULL
     AND v_customer_phone IS NOT NULL
     AND v_customer_phone <> ''
  THEN
    INSERT INTO message_queue (
      tenant_id, channel, recipient, message_content,
      whatsapp_integration_id, reference_type, metadata
    ) VALUES (
      v_tenant_id,
      'whatsapp',
      v_customer_phone,
      REPLACE(
        REPLACE(
          REPLACE(
            v_program.notification_template_redeem,
            '{{cupom_codigo}}', v_coupon_code
          ),
          '{{pontos}}', p_points_to_redeem::text
        ),
        '{{validade}}', TO_CHAR(NOW() + INTERVAL '90 days', 'DD/MM/YYYY')
      ),
      v_program.whatsapp_integration_id,
      'loyalty_redeem',
      jsonb_build_object(
        'integration_id', p_integration_id,
        'coupon_code', v_coupon_code,
        'coupon_value', v_coupon_value
      )
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'couponCode', v_coupon_code,
    'couponValue', v_coupon_value,
    'newBalance', v_balance - p_points_to_redeem
  );
END;
$$;


--
-- Name: map_evolution_status(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.map_evolution_status(status text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN CASE UPPER(status)
    WHEN 'PENDING' THEN 'pending'
    WHEN 'SENT' THEN 'sent'
    WHEN 'DELIVERY_ACK' THEN 'delivered'
    WHEN 'READ' THEN 'read'
    WHEN 'PLAYED' THEN 'read'
    WHEN 'FAILED' THEN 'failed'
    WHEN 'ERROR' THEN 'failed'
    ELSE LOWER(COALESCE(status, 'unknown'))
  END;
END;
$$;


--
-- Name: mask_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mask_secret(_plaintext text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN _plaintext IS NULL OR length(_plaintext) < 5 THEN '••••••••'
    ELSE '••••••••' || right(_plaintext, 4)
  END;
$$;


--
-- Name: process_churn_campaigns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_churn_campaigns() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  cfg           RECORD;
  cutoff_ts     TIMESTAMPTZ;
  excluded_ids  TEXT[];
  campaign_id   UUID;
  eligible_cnt  INTEGER;
  inserted_cnt  INTEGER;
BEGIN
  FOR cfg IN
    SELECT id, tenant_id, churn_threshold, channel,
           whatsapp_integration_id, whatsapp_message, cooldown_days
    FROM public.churn_campaign_configs
    WHERE is_active = true
  LOOP
    cutoff_ts := NOW() - (cfg.cooldown_days || ' days')::INTERVAL;

    SELECT ARRAY_AGG(customer_id) INTO excluded_ids
    FROM public.churn_campaign_triggers
    WHERE config_id = cfg.id
      AND triggered_at >= cutoff_ts;

    SELECT COUNT(*) INTO eligible_cnt
    FROM public.customer_rfm_snapshots
    WHERE tenant_id        = cfg.tenant_id
      AND churn_probability >= cfg.churn_threshold
      AND customer_phone IS NOT NULL
      AND (excluded_ids IS NULL OR customer_id != ALL(excluded_ids));

    CONTINUE WHEN eligible_cnt = 0;

    -- Cap at 500 contacts per run to avoid overloading
    eligible_cnt := LEAST(eligible_cnt, 500);

    IF cfg.channel = 'whatsapp'
       AND cfg.whatsapp_integration_id IS NOT NULL
       AND cfg.whatsapp_message IS NOT NULL
    THEN
      INSERT INTO public.bulk_campaigns (
        tenant_id, name, message_template, whatsapp_integration_id,
        delay_seconds, delay_max_seconds, total_contacts, tokens_per_message,
        status, scheduled_at
      ) VALUES (
        cfg.tenant_id,
        'Anti-Churn ' || TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
        cfg.whatsapp_message,
        cfg.whatsapp_integration_id,
        120, 360,
        eligible_cnt, 2,
        'scheduled', NOW()
      ) RETURNING id INTO campaign_id;

      INSERT INTO public.campaign_contacts
        (campaign_id, tenant_id, name, phone, variables, status)
      SELECT
        campaign_id,
        cfg.tenant_id,
        customer_name,
        REGEXP_REPLACE(COALESCE(customer_phone, ''), '\D', '', 'g'),
        JSONB_BUILD_OBJECT(
          'nome',          COALESCE(customer_name, ''),
          'primeiro_nome', SPLIT_PART(COALESCE(customer_name, ''), ' ', 1),
          'email',         COALESCE(customer_email, '')
        ),
        'pending'
      FROM public.customer_rfm_snapshots
      WHERE tenant_id        = cfg.tenant_id
        AND churn_probability >= cfg.churn_threshold
        AND customer_phone IS NOT NULL
        AND (excluded_ids IS NULL OR customer_id != ALL(excluded_ids))
      LIMIT 500;

      -- Fix total_contacts to reflect actual rows inserted
      GET DIAGNOSTICS inserted_cnt = ROW_COUNT;
      UPDATE public.bulk_campaigns
      SET total_contacts = inserted_cnt
      WHERE id = campaign_id;

      INSERT INTO public.churn_campaign_triggers
        (tenant_id, config_id, customer_id, customer_name, customer_email, customer_phone, churn_probability, channel)
      SELECT
        cfg.tenant_id, cfg.id,
        customer_id, customer_name, customer_email, customer_phone,
        churn_probability, cfg.channel
      FROM public.customer_rfm_snapshots
      WHERE tenant_id        = cfg.tenant_id
        AND churn_probability >= cfg.churn_threshold
        AND customer_phone IS NOT NULL
        AND (excluded_ids IS NULL OR customer_id != ALL(excluded_ids))
      LIMIT 500;

      UPDATE public.churn_campaign_configs
      SET last_run_at = NOW(), updated_at = NOW()
      WHERE id = cfg.id;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: release_bot_lock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_bot_lock(_conversation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.conversations
  SET bot_locked_until = NULL
  WHERE id = _conversation_id;
END;
$$;


--
-- Name: release_bulk_campaign_lock(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_bulk_campaign_lock(_campaign_id uuid, _next_send_seconds integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.bulk_campaigns
  SET processing_lock_until = NULL,
      next_send_at = now() + make_interval(secs => _next_send_seconds)
  WHERE id = _campaign_id;
END;
$$;


--
-- Name: replace_chatbot_flow(uuid, uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_chatbot_flow(p_flow_id uuid, p_tenant_id uuid, p_nodes jsonb, p_edges jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  n jsonb;
  e jsonb;
BEGIN
  IF p_flow_id IS NULL THEN
    RAISE EXCEPTION 'p_flow_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;
  IF p_nodes IS NULL OR jsonb_typeof(p_nodes) <> 'array' THEN
    RAISE EXCEPTION 'p_nodes must be a JSON array';
  END IF;
  IF p_edges IS NULL OR jsonb_typeof(p_edges) <> 'array' THEN
    RAISE EXCEPTION 'p_edges must be a JSON array';
  END IF;

  -- Delete in FK-safe order: edges first, then nodes
  DELETE FROM public.chatbot_flow_edges WHERE flow_id = p_flow_id;
  DELETE FROM public.chatbot_flow_nodes WHERE flow_id = p_flow_id;

  -- Insert nodes first (edges reference them)
  IF jsonb_array_length(p_nodes) > 0 THEN
    FOR n IN SELECT jsonb_array_elements(p_nodes) LOOP
      INSERT INTO public.chatbot_flow_nodes (
        id, flow_id, tenant_id, node_type, label, config,
        position_x, position_y, is_entry
      )
      VALUES (
        (n->>'id')::uuid,
        p_flow_id,
        p_tenant_id,
        n->>'node_type',
        NULLIF(n->>'label', ''),
        COALESCE(n->'config', '{}'::jsonb),
        COALESCE((n->>'position_x')::float, 0),
        COALESCE((n->>'position_y')::float, 0),
        COALESCE((n->>'is_entry')::boolean, false)
      );
    END LOOP;
  END IF;

  -- Insert edges after nodes
  IF jsonb_array_length(p_edges) > 0 THEN
    FOR e IN SELECT jsonb_array_elements(p_edges) LOOP
      INSERT INTO public.chatbot_flow_edges (
        id, flow_id, tenant_id, source_node_id, target_node_id, condition
      )
      VALUES (
        (e->>'id')::uuid,
        p_flow_id,
        p_tenant_id,
        (e->>'source_node_id')::uuid,
        (e->>'target_node_id')::uuid,
        e->'condition'
      );
    END LOOP;
  END IF;
END;
$$;


--
-- Name: replace_instagram_flow_version(uuid, uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_instagram_flow_version(p_version_id uuid, p_tenant_id uuid, p_nodes jsonb, p_edges jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  n jsonb;
  e jsonb;
BEGIN
  IF p_version_id IS NULL THEN
    RAISE EXCEPTION 'p_version_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;
  IF p_nodes IS NULL OR jsonb_typeof(p_nodes) <> 'array' THEN
    RAISE EXCEPTION 'p_nodes must be a JSON array';
  END IF;
  IF p_edges IS NULL OR jsonb_typeof(p_edges) <> 'array' THEN
    RAISE EXCEPTION 'p_edges must be a JSON array';
  END IF;

  -- Delete in FK-safe order
  DELETE FROM public.instagram_flow_edges WHERE version_id = p_version_id;
  DELETE FROM public.instagram_flow_nodes WHERE version_id = p_version_id;

  -- Insert nodes first
  IF jsonb_array_length(p_nodes) > 0 THEN
    FOR n IN SELECT jsonb_array_elements(p_nodes) LOOP
      INSERT INTO public.instagram_flow_nodes (
        id, tenant_id, version_id, node_type, label, config,
        position_x, position_y, is_entry
      )
      VALUES (
        (n->>'id')::uuid,
        p_tenant_id,
        p_version_id,
        n->>'node_type',
        NULLIF(n->>'label', ''),
        COALESCE(n->'config', '{}'::jsonb),
        COALESCE((n->>'position_x')::double precision, 0),
        COALESCE((n->>'position_y')::double precision, 0),
        COALESCE((n->>'is_entry')::boolean, false)
      );
    END LOOP;
  END IF;

  -- Insert edges after nodes
  IF jsonb_array_length(p_edges) > 0 THEN
    FOR e IN SELECT jsonb_array_elements(p_edges) LOOP
      INSERT INTO public.instagram_flow_edges (
        id, tenant_id, version_id, source_node_id, target_node_id,
        source_handle, label, condition
      )
      VALUES (
        (e->>'id')::uuid,
        p_tenant_id,
        p_version_id,
        (e->>'source_node_id')::uuid,
        (e->>'target_node_id')::uuid,
        NULLIF(e->>'source_handle', ''),
        NULLIF(e->>'label', ''),
        e->'condition'
      );
    END LOOP;
  END IF;
END;
$$;


--
-- Name: replace_member_permissions(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_member_permissions(p_team_member_id uuid, p_permissions jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  perm jsonb;
BEGIN
  IF p_team_member_id IS NULL THEN
    RAISE EXCEPTION 'p_team_member_id is required';
  END IF;
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array' THEN
    RAISE EXCEPTION 'p_permissions must be a JSON array';
  END IF;

  DELETE FROM public.member_permissions WHERE team_member_id = p_team_member_id;

  IF jsonb_array_length(p_permissions) > 0 THEN
    FOR perm IN SELECT jsonb_array_elements(p_permissions) LOOP
      INSERT INTO public.member_permissions (
        team_member_id, permission, can_view, can_edit
      )
      VALUES (
        p_team_member_id,
        (perm->>'permission')::module_permission,
        COALESCE((perm->>'can_view')::boolean, false),
        COALESCE((perm->>'can_edit')::boolean, false)
      );
    END LOOP;
  END IF;
END;
$$;


--
-- Name: replace_order_notification_rules(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_order_notification_rules(p_config_id uuid, p_tenant_id uuid, p_rules jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  r jsonb;
BEGIN
  -- Validate inputs
  IF p_config_id IS NULL THEN
    RAISE EXCEPTION 'p_config_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' THEN
    RAISE EXCEPTION 'p_rules must be a JSON array';
  END IF;

  -- Replace rules atomically (function execution is a single transaction)
  DELETE FROM public.order_notification_status_rules WHERE config_id = p_config_id;

  IF jsonb_array_length(p_rules) > 0 THEN
    FOR r IN SELECT jsonb_array_elements(p_rules) LOOP
      INSERT INTO public.order_notification_status_rules (
        config_id, tenant_id, status_name, status_id, is_enabled,
        message_template, email_subject, email_body, delay_minutes
      )
      VALUES (
        p_config_id,
        p_tenant_id,
        r->>'status_name',
        NULLIF((r->>'status_id'), '')::integer,
        COALESCE((r->>'is_enabled')::boolean, true),
        r->>'message_template',
        NULLIF(r->>'email_subject', ''),
        NULLIF(r->>'email_body', ''),
        COALESCE((r->>'delay_minutes')::integer, 0)
      );
    END LOOP;
  END IF;
END;
$$;


--
-- Name: replace_reactivation_cycle_steps(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_reactivation_cycle_steps(p_config_id uuid, p_tenant_id uuid, p_steps jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  s jsonb;
  idx int := 1;
BEGIN
  IF p_config_id IS NULL THEN
    RAISE EXCEPTION 'p_config_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) <> 'array' THEN
    RAISE EXCEPTION 'p_steps must be a JSON array';
  END IF;

  DELETE FROM public.reactivation_cycle_steps WHERE config_id = p_config_id;

  IF jsonb_array_length(p_steps) > 0 THEN
    FOR s IN SELECT jsonb_array_elements(p_steps) LOOP
      INSERT INTO public.reactivation_cycle_steps (
        config_id, tenant_id, step_number, delay_days, message_template,
        is_active, use_custom_coupon, coupon_discount_percent, coupon_duration_days
      )
      VALUES (
        p_config_id,
        p_tenant_id,
        idx,
        COALESCE((s->>'delay_days')::integer, 7),
        COALESCE(s->>'message_template', ''),
        COALESCE((s->>'is_active')::boolean, true),
        COALESCE((s->>'use_custom_coupon')::boolean, false),
        NULLIF(s->>'coupon_discount_percent', '')::integer,
        NULLIF(s->>'coupon_duration_days', '')::integer
      );
      idx := idx + 1;
    END LOOP;
  END IF;
END;
$$;


--
-- Name: rollup_instagram_metrics(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rollup_instagram_metrics(p_date date DEFAULT (CURRENT_DATE - 1)) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_start         TIMESTAMPTZ := p_date::TIMESTAMPTZ;
  v_end           TIMESTAMPTZ := (p_date + 1)::TIMESTAMPTZ;
  v_ch            RECORD;
  v_rolled        INT := 0;
  v_inbound       BIGINT;
  v_outbound      BIGINT;
  v_new_threads   BIGINT;
  v_priv_reply    BIGINT;
  v_flow_start    BIGINT;
  v_flow_complete BIGINT;
  v_handoff       BIGINT;
  v_comment_trg   BIGINT;
  v_story_reply   BIGINT;
  v_story_mention BIGINT;
  v_live_comment  BIGINT;
  v_ad_entry      BIGINT;
  v_ref_url       BIGINT;
  v_failures      BIGINT;
  v_emails        BIGINT;
  v_phones        BIGINT;
  v_cta           BIGINT;
BEGIN
  FOR v_ch IN
    SELECT id, tenant_id FROM instagram_channels WHERE status IN ('connected', 'expiring')
  LOOP
    -- messages: single JOIN scan (was two correlated subqueries re-running the same thread lookup)
    SELECT
      COUNT(*) FILTER (WHERE m.direction = 'inbound'),
      COUNT(*) FILTER (WHERE m.direction = 'outbound')
    INTO v_inbound, v_outbound
    FROM instagram_messages m
    JOIN instagram_threads t ON t.id = m.thread_id
    WHERE t.channel_id = v_ch.id
      AND m.created_at >= v_start AND m.created_at < v_end;

    SELECT COUNT(*) INTO v_new_threads
    FROM instagram_threads
    WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end;

    -- events: single scan (was 9 separate scans with identical WHERE predicate)
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'private_reply_sent'),
      COUNT(*) FILTER (WHERE event_type = 'flow_started'),
      COUNT(*) FILTER (WHERE event_type = 'flow_completed'),
      COUNT(*) FILTER (WHERE event_type = 'handoff_to_human'),
      COUNT(*) FILTER (WHERE event_type = 'comment_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'story_reply_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'story_mention_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'live_comment_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'ad_entry_trigger'),
      COUNT(*) FILTER (WHERE event_type = 'ref_url_entry')
    INTO
      v_priv_reply, v_flow_start, v_flow_complete, v_handoff,
      v_comment_trg, v_story_reply, v_story_mention, v_live_comment,
      v_ad_entry, v_ref_url
    FROM instagram_event_log
    WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end;

    SELECT COUNT(*) INTO v_failures
    FROM instagram_outbox
    WHERE channel_id = v_ch.id AND status = 'dead'
      AND created_at >= v_start AND created_at < v_end;

    -- captures: single scan (was two separate subqueries)
    SELECT
      COUNT(*) FILTER (WHERE field_name = 'email'),
      COUNT(*) FILTER (WHERE field_name = 'phone')
    INTO v_emails, v_phones
    FROM instagram_data_collection_events
    WHERE channel_id = v_ch.id AND created_at >= v_start AND created_at < v_end;

    -- cta clicks: table has no channel_id — intentionally scoped to tenant
    SELECT COUNT(*) INTO v_cta
    FROM instagram_cta_link_clicks
    WHERE tenant_id = v_ch.tenant_id AND clicked_at >= v_start AND clicked_at < v_end;

    INSERT INTO instagram_metrics_daily (
      tenant_id, channel_id, metric_date,
      inbound_messages, outbound_messages, new_threads,
      private_replies_sent, flows_started, flows_completed,
      handoffs_to_human, comment_triggers, story_reply_triggers,
      story_mention_triggers, live_comment_triggers, ad_entry_triggers,
      ref_url_entries, send_failures, emails_captured, phones_captured,
      cta_clicks, updated_at
    ) VALUES (
      v_ch.tenant_id, v_ch.id, p_date,
      v_inbound, v_outbound, v_new_threads,
      v_priv_reply, v_flow_start, v_flow_complete,
      v_handoff, v_comment_trg, v_story_reply,
      v_story_mention, v_live_comment, v_ad_entry,
      v_ref_url, v_failures, v_emails, v_phones,
      v_cta, NOW()
    )
    ON CONFLICT (channel_id, metric_date) DO UPDATE SET
      inbound_messages       = EXCLUDED.inbound_messages,
      outbound_messages      = EXCLUDED.outbound_messages,
      new_threads            = EXCLUDED.new_threads,
      private_replies_sent   = EXCLUDED.private_replies_sent,
      flows_started          = EXCLUDED.flows_started,
      flows_completed        = EXCLUDED.flows_completed,
      handoffs_to_human      = EXCLUDED.handoffs_to_human,
      comment_triggers       = EXCLUDED.comment_triggers,
      story_reply_triggers   = EXCLUDED.story_reply_triggers,
      story_mention_triggers = EXCLUDED.story_mention_triggers,
      live_comment_triggers  = EXCLUDED.live_comment_triggers,
      ad_entry_triggers      = EXCLUDED.ad_entry_triggers,
      ref_url_entries        = EXCLUDED.ref_url_entries,
      send_failures          = EXCLUDED.send_failures,
      emails_captured        = EXCLUDED.emails_captured,
      phones_captured        = EXCLUDED.phones_captured,
      cta_clicks             = EXCLUDED.cta_clicks,
      updated_at             = EXCLUDED.updated_at;

    v_rolled := v_rolled + 1;
  END LOOP;

  RETURN jsonb_build_object('rolled_up', v_rolled, 'date', p_date);
END;
$$;


--
-- Name: schedule_bulk_campaigns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_bulk_campaigns() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_base_url   TEXT := public.functions_base_url() || '/functions/v1/bulk-campaign-processor';
  v_headers    JSONB := public.get_internal_headers();
  v_now        TIMESTAMPTZ := NOW();
  v_campaign   RECORD;
  v_started    INT := 0;
  v_dow        INT;
  v_local_time TIME;
  v_window     JSONB;
  v_pending    BIGINT;
BEGIN
  FOR v_campaign IN
    SELECT id, status, scheduled_at, sending_schedule, timezone,
           next_send_at, processing_lock_until
    FROM bulk_campaigns
    WHERE status IN ('scheduled', 'processing')
      AND (next_send_at IS NULL OR next_send_at <= v_now)
      AND (processing_lock_until IS NULL OR processing_lock_until < v_now)
    ORDER BY created_at ASC
  LOOP
    IF v_campaign.status = 'scheduled' THEN
      IF v_campaign.scheduled_at IS NULL OR v_campaign.scheduled_at > v_now THEN
        CONTINUE;
      END IF;
      UPDATE bulk_campaigns
      SET status = 'processing', started_at = v_now
      WHERE id = v_campaign.id;
    END IF;

    IF v_campaign.sending_schedule IS NOT NULL
       AND v_campaign.sending_schedule <> 'null'::JSONB
       AND v_campaign.sending_schedule <> '{}'::JSONB THEN

      v_dow := EXTRACT(
        DOW FROM (v_now AT TIME ZONE COALESCE(v_campaign.timezone, 'America/Sao_Paulo'))
      )::INT;
      v_local_time := (v_now AT TIME ZONE COALESCE(v_campaign.timezone, 'America/Sao_Paulo'))::TIME;
      v_window := v_campaign.sending_schedule -> v_dow::TEXT;

      IF v_window IS NULL THEN CONTINUE; END IF;
      IF NOT (v_local_time >= (v_window->>'start')::TIME
              AND v_local_time < (v_window->>'end')::TIME) THEN CONTINUE; END IF;
    END IF;

    SELECT COUNT(*) INTO v_pending
    FROM campaign_contacts
    WHERE campaign_id = v_campaign.id AND status = 'pending';

    IF v_pending = 0 THEN CONTINUE; END IF;

    PERFORM net.http_post(
      url     := v_base_url,
      headers := v_headers,
      body    := jsonb_build_object('campaign_id', v_campaign.id),
      timeout_milliseconds := 90000
    );
    v_started := v_started + 1;
  END LOOP;

  RETURN jsonb_build_object('started', v_started);
END;
$$;


--
-- Name: schedule_email_campaigns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_email_campaigns() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_base_url TEXT := public.functions_base_url() || '/functions/v1/email-campaign-send';
  v_headers  JSONB := public.get_internal_headers();
  v_now      TIMESTAMPTZ := NOW();
  v_campaign RECORD;
  v_triggered INT := 0;
BEGIN
  FOR v_campaign IN
    SELECT id
    FROM email_campaigns
    WHERE status = 'scheduled'
      AND scheduled_at <= v_now
    ORDER BY scheduled_at ASC
  LOOP
    PERFORM net.http_post(
      url     := v_base_url,
      headers := v_headers,
      body    := jsonb_build_object('campaign_id', v_campaign.id),
      timeout_milliseconds := 90000
    );
    v_triggered := v_triggered + 1;
  END LOOP;

  RETURN jsonb_build_object('triggered', v_triggered);
END;
$$;


--
-- Name: set_active_tenant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_active_tenant(_user_id uuid, _tenant_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Verify user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id AND owner_id = _user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.team_members WHERE tenant_id = _tenant_id AND user_id = _user_id
  ) THEN
    RETURN false;
  END IF;
  
  UPDATE public.profiles
  SET active_tenant_id = _tenant_id, updated_at = now()
  WHERE user_id = _user_id;
  
  RETURN true;
END;
$$;


--
-- Name: set_first_response_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_first_response_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.sender_type = 'agent' THEN
    UPDATE conversations
    SET first_response_at = NEW.created_at
    WHERE id = NEW.conversation_id
    AND first_response_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: store_cron_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_cron_secret(_secret text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'CRON_SECRET';
  PERFORM vault.create_secret(_secret, 'CRON_SECRET', 'Used by pg_cron jobs for internal auth');
END;
$$;


--
-- Name: trigger_rfm_calculations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_rfm_calculations() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_base_url TEXT := public.functions_base_url() || '/functions/v1/rfm-calculator';
  v_headers  JSONB := public.get_internal_headers();
  v_int      RECORD;
  v_count    INT := 0;
BEGIN
  FOR v_int IN
    SELECT id,
           CASE WHEN type = 'bling_v3' THEN 'bling' ELSE 'loja_integrada' END AS source_type
    FROM integrations
    WHERE type IN ('loja_integrada', 'bling_v3')
      AND status = 'connected'
  LOOP
    PERFORM net.http_post(
      url     := v_base_url,
      headers := v_headers,
      body    := jsonb_build_object(
                   'integration_id', v_int.id,
                   'source_type',    v_int.source_type
                 ),
      timeout_milliseconds := 90000
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_count);
END;
$$;


--
-- Name: try_acquire_bot_lock(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_acquire_bot_lock(_conversation_id uuid, _lock_seconds integer DEFAULT 30) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _acquired boolean;
BEGIN
  UPDATE public.conversations
  SET bot_locked_until = now() + (_lock_seconds || ' seconds')::interval
  WHERE id = _conversation_id
    AND (bot_locked_until IS NULL OR bot_locked_until < now())
  RETURNING true INTO _acquired;
  
  RETURN COALESCE(_acquired, false);
END;
$$;


--
-- Name: try_acquire_bulk_campaign_lock(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_acquire_bulk_campaign_lock(_campaign_id uuid, _lock_seconds integer DEFAULT 90) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _acquired boolean;
BEGIN
  UPDATE public.bulk_campaigns
  SET processing_lock_until = now() + make_interval(secs => _lock_seconds)
  WHERE id = _campaign_id
    AND status = 'processing'
    AND (processing_lock_until IS NULL OR processing_lock_until < now())
    AND (next_send_at IS NULL OR next_send_at <= now())
  RETURNING true INTO _acquired;

  RETURN COALESCE(_acquired, false);
END;
$$;


--
-- Name: update_campaign_stats_on_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_campaign_stats_on_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.event_type = 'open' THEN
    UPDATE email_campaigns
    SET total_opened = total_opened + 1
    WHERE id = NEW.campaign_id;
  ELSIF NEW.event_type = 'click' THEN
    UPDATE email_campaigns
    SET total_clicked = total_clicked + 1
    WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_chatbot_flows_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chatbot_flows_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--
-- Name: update_li_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_li_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_agent_column_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_column_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    column_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    system_prompt text NOT NULL,
    welcome_message text,
    transfer_keywords text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true NOT NULL,
    model text DEFAULT 'google/gemini-2.5-flash'::text NOT NULL,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 1024,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    data_access jsonb DEFAULT '{"orders": true, "coupons": true, "cashback": false, "products": false, "order_items": true, "smart_search": true, "order_tracking": true, "abandoned_carts": true, "customer_details": true, "products_catalog": false, "products_featured": false}'::jsonb,
    agent_transfer_rules jsonb DEFAULT '[]'::jsonb,
    interactive_buttons jsonb DEFAULT '[]'::jsonb,
    human_transfer_column_id uuid,
    inactivity_enabled boolean DEFAULT false,
    inactivity_timeout_minutes integer,
    inactivity_target_column_id uuid,
    inactivity_message text DEFAULT 'Por inatividade estamos finalizando a conversa. Fique à vontade para mandar uma nova mensagem quando precisar!'::text,
    keyword_action_rules jsonb DEFAULT '[]'::jsonb,
    message_buffer_enabled boolean DEFAULT false,
    message_buffer_delay_seconds integer DEFAULT 10,
    store_integration_id uuid,
    order_verification_enabled boolean DEFAULT false,
    order_verification_mode text DEFAULT 'sequential'::text,
    order_verification_messages jsonb DEFAULT '{"ask_cpf": "Agora preciso dos *3 primeiros dígitos do CPF* cadastrado no pedido para confirmar sua identidade.", "ask_both": "Para consultar seu pedido, por favor informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado", "cpf_wrong": "❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_", "after_verified": "Posso ajudar com mais alguma coisa sobre este pedido?", "order_verified": "✅ *Pedido encontrado!*\n\n{order_details}", "order_not_found": "❌ Não encontrei o pedido *#{order_number}* em nosso sistema.\n\nPor favor, verifique o número e tente novamente.", "ask_order_number": "Por favor, informe o *número do pedido* para que eu possa consultar.", "cpf_max_attempts": "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um de nossos atendentes que poderá ajudá-lo."}'::jsonb,
    order_details_template text DEFAULT '📦 *Pedido #{numero}*
📅 Data: {data_criacao}
👤 Cliente: {cliente_nome}
📊 Status: {situacao_nome}
💰 Total: R$ {valor_total}
🚚 Rastreio: {codigo_rastreio}

🛒 *Itens:*
{order_items}'::text,
    order_not_found_column_id uuid,
    cpf_max_attempts_column_id uuid,
    after_verified_column_id uuid,
    verification_type text DEFAULT 'order'::text,
    tracking_link_base text,
    agent_type text DEFAULT 'chatbot'::text NOT NULL,
    ai_provider text,
    flow_id uuid
);


--
-- Name: ai_assistant_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_assistant_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    system_prompt text,
    welcome_message text DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudá-lo?'::text,
    transfer_keywords text[] DEFAULT ARRAY['atendente'::text, 'humano'::text, 'pessoa'::text, 'falar com alguém'::text],
    business_hours jsonb DEFAULT '{"enabled": false}'::jsonb,
    out_of_hours_message text DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!'::text,
    max_context_messages integer DEFAULT 10,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_ai_agent_id uuid,
    inactivity_timeout_minutes integer,
    inactivity_message text DEFAULT 'Encerrando o atendimento por inatividade. Quando precisar, é só chamar novamente!'::text,
    auto_close_enabled boolean DEFAULT false NOT NULL,
    auto_close_minutes integer DEFAULT 120 NOT NULL,
    auto_close_message text DEFAULT 'Como não tivemos mais contato, estamos encerrando o seu atendimento. Caso precise de alguma ajuda, fique à vontade para entrar em contato novamente!'::text NOT NULL,
    automation_auto_close_enabled boolean DEFAULT true,
    automation_auto_close_minutes integer DEFAULT 120,
    automation_auto_close_message text DEFAULT 'Como não tivemos mais contato estamos encerrando o seu atendimento, caso precise de alguma ajuda fique a vontade para entrar em contato novamente.'::text
);


--
-- Name: ai_provider_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_provider_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'unknown'::text NOT NULL,
    last_error_code text,
    last_error_message text,
    last_check_at timestamp with time zone,
    last_success_at timestamp with time zone,
    consecutive_failures integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_provider_health_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'google'::text, 'lovable'::text]))),
    CONSTRAINT ai_provider_health_status_check CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'error'::text, 'unknown'::text])))
);


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text DEFAULT 'lovable'::text NOT NULL,
    model text NOT NULL,
    tokens_input integer DEFAULT 0,
    tokens_output integer DEFAULT 0,
    tokens_total integer GENERATED ALWAYS AS ((tokens_input + tokens_output)) STORED,
    agent_id uuid,
    conversation_id uuid,
    response_time_ms integer,
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auto_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auto_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    message_type text NOT NULL,
    content text NOT NULL,
    is_active boolean DEFAULT true,
    delay_seconds integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: birthday_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.birthday_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    name text DEFAULT 'Aniversariantes'::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    coupon_discount_percent numeric DEFAULT 10 NOT NULL,
    coupon_duration_days integer DEFAULT 30 NOT NULL,
    whatsapp_integration_id uuid,
    email_enabled boolean DEFAULT false,
    email_integration_id uuid,
    email_subject text DEFAULT 'Feliz Aniversário! 🎂'::text,
    email_body text,
    message_template text DEFAULT 'Olá {nome}! 🎂🎉 Feliz aniversário! Para comemorar, preparamos um cupom especial de {desconto}% de desconto para você! Use o código *{cupom}* e aproveite. Válido por {validade} dias!'::text NOT NULL,
    tokens_per_execution integer DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: birthday_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.birthday_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    config_id uuid,
    customer_name text,
    customer_phone text,
    customer_email text,
    customer_source text,
    coupon_code text,
    action_type text DEFAULT 'birthday_message'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    tokens_used integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bling_code_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_code_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    mapping_type text NOT NULL,
    original_code text NOT NULL,
    display_name text NOT NULL,
    color text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bling_code_mappings_mapping_type_check CHECK ((mapping_type = ANY (ARRAY['order_status'::text, 'payment_method'::text])))
);


--
-- Name: bling_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    created_by_user_id uuid,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expires_at timestamp with time zone NOT NULL,
    refresh_expires_at timestamp with time zone,
    scopes text[],
    status text DEFAULT 'connected'::text,
    bling_user_id text,
    bling_user_name text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    bling_company_id text,
    access_token_encrypted text,
    refresh_token_encrypted text
);


--
-- Name: bling_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bling_id bigint NOT NULL,
    nome text NOT NULL,
    fantasia text,
    tipo_pessoa text,
    cpf_cnpj text,
    ie text,
    email text,
    telefone text,
    celular text,
    endereco jsonb,
    situacao text,
    data_inclusao timestamp with time zone,
    raw_data jsonb,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    data_nascimento date,
    sexo text,
    naturalidade text,
    rg text,
    orgao_emissor text
);

ALTER TABLE ONLY public.bling_customers REPLICA IDENTITY FULL;


--
-- Name: bling_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    bling_id bigint,
    produto_id bigint,
    produto_nome text,
    sku text,
    quantidade numeric(12,4),
    valor_unitario numeric(12,2),
    valor_total numeric(12,2),
    desconto numeric(12,2),
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    unidade text,
    aliquota_ipi numeric DEFAULT 0,
    descricao_detalhada text,
    comissao_base numeric DEFAULT 0,
    comissao_aliquota numeric DEFAULT 0,
    comissao_valor numeric DEFAULT 0,
    natureza_operacao_id bigint,
    raw_data jsonb,
    preco_custo numeric DEFAULT 0
);


--
-- Name: bling_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bling_id bigint NOT NULL,
    numero text NOT NULL,
    data_criacao timestamp with time zone,
    data_modificacao timestamp with time zone,
    situacao_id integer,
    situacao_nome text,
    cliente_id bigint,
    cliente_nome text,
    cliente_cpf_cnpj text,
    cliente_email text,
    cliente_telefone text,
    valor_total numeric(12,2),
    valor_desconto numeric(12,2),
    valor_frete numeric(12,2),
    valor_produtos numeric(12,2),
    forma_pagamento text,
    forma_envio text,
    observacoes text,
    observacoes_internas text,
    endereco_entrega jsonb,
    loja_id bigint,
    loja_nome text,
    raw_data jsonb,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    numero_loja text,
    data_saida timestamp with time zone,
    data_prevista timestamp with time zone,
    outras_despesas numeric DEFAULT 0,
    numero_pedido_compra text,
    categoria_id bigint,
    nota_fiscal_id bigint,
    total_icms numeric DEFAULT 0,
    total_ipi numeric DEFAULT 0,
    vendedor_id bigint,
    intermediador_cnpj text,
    intermediador_nome_usuario text,
    taxa_comissao numeric DEFAULT 0,
    custo_frete numeric DEFAULT 0,
    valor_base numeric DEFAULT 0,
    frete_por_conta integer,
    quantidade_volumes integer,
    peso_bruto numeric,
    prazo_entrega integer,
    transportador_id bigint,
    transportador_nome text,
    etiqueta jsonb,
    volumes jsonb,
    parcelas jsonb
);

ALTER TABLE ONLY public.bling_orders REPLICA IDENTITY FULL;


--
-- Name: bling_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bling_id bigint NOT NULL,
    nome text NOT NULL,
    codigo text,
    preco numeric(12,2),
    preco_custo numeric(12,2),
    estoque_atual numeric(12,4),
    estoque_minimo numeric(12,4),
    tipo text,
    situacao text,
    formato text,
    descricao_curta text,
    descricao_completa text,
    unidade text,
    peso_liquido numeric(12,4),
    peso_bruto numeric(12,4),
    gtin text,
    imagem_url text,
    categoria_id bigint,
    categoria_nome text,
    raw_data jsonb,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    altura numeric,
    largura numeric,
    profundidade numeric,
    fornecedor_id integer,
    fornecedor_nome text,
    fornecedor_codigo text,
    marca text,
    imagens jsonb,
    variacoes jsonb,
    produto_pai_id bigint,
    ncm text,
    cest text,
    origem integer,
    tributacao jsonb,
    estoque_depositos jsonb,
    condicao integer,
    frete_gratis boolean DEFAULT false,
    producao_propria boolean DEFAULT false,
    observacoes text,
    localizacao text,
    cross_docking integer,
    garantia integer,
    volumes_por_produto integer,
    gtin_embalagem text,
    campos_customizados jsonb,
    data_validade date,
    classe_fiscal text,
    sob_encomenda boolean DEFAULT false,
    ean text,
    dados_nfe jsonb
);

ALTER TABLE ONLY public.bling_products REPLICA IDENTITY FULL;


--
-- Name: bling_situacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_situacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    situacao_id integer NOT NULL,
    nome text NOT NULL,
    id_herdado integer,
    cor text,
    modulo_id integer NOT NULL,
    modulo_nome text,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bling_sync_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_log_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'pending'::text,
    current_page integer DEFAULT 0,
    total_count integer DEFAULT 0,
    processed_count integer DEFAULT 0,
    saved_count integer DEFAULT 0,
    error_message text,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resume_page integer DEFAULT 1 NOT NULL,
    max_pages_per_run integer DEFAULT 3 NOT NULL,
    last_heartbeat_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    locked_at timestamp with time zone,
    locked_by text
);

ALTER TABLE ONLY public.bling_sync_jobs REPLICA IDENTITY FULL;


--
-- Name: bling_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    sync_type text NOT NULL,
    status text DEFAULT 'pending'::text,
    records_synced integer DEFAULT 0,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: bling_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bling_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_key text NOT NULL,
    tenant_id uuid,
    company_id text NOT NULL,
    resource text NOT NULL,
    action text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    status text DEFAULT 'received'::text,
    error text
);


--
-- Name: bulk_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bulk_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    message_template text NOT NULL,
    whatsapp_integration_id uuid,
    delay_seconds integer DEFAULT 10 NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    total_contacts integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    delivered_count integer DEFAULT 0 NOT NULL,
    read_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    tokens_per_message integer DEFAULT 2 NOT NULL,
    total_tokens_used integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    media_url text,
    media_type text DEFAULT 'text'::text,
    delay_max_seconds integer DEFAULT 360,
    timezone text DEFAULT 'America/Sao_Paulo'::text,
    sending_schedule jsonb,
    next_send_at timestamp with time zone,
    processing_lock_until timestamp with time zone,
    ab_test_id uuid,
    ab_variant text
);


--
-- Name: business_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    end_time time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT business_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: campaign_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text,
    phone text NOT NULL,
    variables jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    whatsapp_message_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cashback_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    balance numeric(10,2) DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cashback_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_name text NOT NULL,
    discount_percentage numeric DEFAULT 5 NOT NULL,
    coupon_duration_days integer DEFAULT 7 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    min_purchase_value numeric,
    max_discount_value numeric,
    trigger_statuses text[] DEFAULT '{}'::text[],
    webhook_url text,
    send_via_whatsapp boolean DEFAULT true,
    whatsapp_integration_id uuid,
    message_template text DEFAULT 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.'::text,
    name text DEFAULT 'Cashback'::text NOT NULL,
    send_via_email boolean DEFAULT false,
    email_integration_id uuid,
    email_subject text,
    email_body_text text,
    email_body_html text,
    reminder_1_enabled boolean DEFAULT false,
    reminder_1_days_before integer DEFAULT 7,
    reminder_1_message text DEFAULT 'Olá {{cliente_nome}}! ⏰ Seu cupom {{cupom}} de {{valor_cupom}} de desconto expira em {{dias_restantes}} dias! Não perca essa oportunidade. Válido até {{validade}}.'::text,
    reminder_2_enabled boolean DEFAULT false,
    reminder_2_days_before integer DEFAULT 3,
    reminder_2_message text DEFAULT 'Olá {{cliente_nome}}! 🚨 Última chance! Seu cupom {{cupom}} expira em {{dias_restantes}} dias. Use agora e garanta {{valor_cupom}} de desconto!'::text,
    tenant_id uuid,
    integration_id uuid
);


--
-- Name: cashback_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid,
    coupon_id uuid,
    reminder_id uuid,
    order_id text,
    order_number text,
    coupon_code text,
    action_type text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    error_message text,
    tokens_used integer DEFAULT 1,
    metadata jsonb,
    executed_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid
);


--
-- Name: cashback_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cashback_reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    config_id uuid,
    reminder_number integer NOT NULL,
    scheduled_date date NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    message text,
    webhook_url text,
    webhook_payload jsonb,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid
);


--
-- Name: chatbot_flow_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_flow_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    source_node_id uuid NOT NULL,
    target_node_id uuid NOT NULL,
    condition jsonb,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.chatbot_flow_edges REPLICA IDENTITY FULL;


--
-- Name: chatbot_flow_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_flow_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    node_type text NOT NULL,
    label text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    position_x double precision DEFAULT 0 NOT NULL,
    position_y double precision DEFAULT 0 NOT NULL,
    is_entry boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chatbot_flow_nodes_node_type_check CHECK ((node_type = ANY (ARRAY['start'::text, 'message'::text, 'question'::text, 'condition'::text, 'action'::text, 'end'::text])))
);

ALTER TABLE ONLY public.chatbot_flow_nodes REPLICA IDENTITY FULL;


--
-- Name: chatbot_flow_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_flow_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    session jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: chatbot_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    trigger_keywords text[] DEFAULT '{}'::text[] NOT NULL
);

ALTER TABLE ONLY public.chatbot_flows REPLICA IDENTITY FULL;


--
-- Name: churn_campaign_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.churn_campaign_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text DEFAULT 'Campanha Anti-Churn'::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    churn_threshold numeric DEFAULT 0.7 NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    whatsapp_integration_id uuid,
    whatsapp_message text,
    email_subject text,
    email_body text,
    cooldown_days integer DEFAULT 30 NOT NULL,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: churn_campaign_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.churn_campaign_triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    config_id uuid NOT NULL,
    customer_id text,
    customer_email text,
    customer_phone text,
    customer_name text,
    churn_probability numeric,
    channel text,
    triggered_at timestamp with time zone DEFAULT now()
);


--
-- Name: circuit_breaker_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.circuit_breaker_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    tenant_id uuid NOT NULL,
    state text DEFAULT 'closed'::text NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    last_failure_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_error text,
    opened_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    phone_e164 text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_custom_field_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_custom_field_values (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    options jsonb,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_merges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_merges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    primary_contact_id uuid NOT NULL,
    merged_contact_id uuid NOT NULL,
    similarity_score integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'suggested'::text NOT NULL,
    merged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    li_customer_id uuid,
    phone character varying(20) NOT NULL,
    name character varying(255),
    email character varying(255),
    avatar_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_user_id uuid,
    payload_json jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversation_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_tags (
    conversation_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    integration_id uuid,
    chatwoot_conversation_id integer,
    status character varying(20) DEFAULT 'bot'::character varying NOT NULL,
    assigned_to uuid,
    ai_enabled boolean DEFAULT true NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kanban_column_id uuid,
    current_ai_agent_id uuid,
    pending_ai_response_at timestamp with time zone,
    buffered_message_ids uuid[] DEFAULT '{}'::uuid[],
    verification_state text,
    verification_data jsonb,
    awaiting_phone_input boolean DEFAULT false,
    lead_capture_state text,
    lead_capture_data jsonb DEFAULT '{}'::jsonb,
    last_incoming_message_id text,
    inbox_id uuid,
    channel_id uuid,
    handoff_mode boolean DEFAULT false NOT NULL,
    bot_state_json jsonb,
    priority text DEFAULT 'normal'::text NOT NULL,
    last_inbound_at timestamp with time zone,
    last_outbound_at timestamp with time zone,
    closed_at timestamp with time zone,
    source text DEFAULT 'organic'::text NOT NULL,
    bot_locked_until timestamp with time zone,
    first_response_at timestamp with time zone,
    csat_score smallint,
    csat_submitted_at timestamp with time zone,
    csat_token uuid DEFAULT gen_random_uuid(),
    intent text,
    ai_sentiment text,
    CONSTRAINT conversations_csat_score_check CHECK (((csat_score >= 1) AND (csat_score <= 5))),
    CONSTRAINT conversations_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text])))
);

ALTER TABLE ONLY public.conversations REPLICA IDENTITY FULL;


--
-- Name: crm_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '[]'::jsonb NOT NULL,
    contact_count integer DEFAULT 0 NOT NULL,
    last_computed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_rfm_category_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_rfm_category_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    source_type text NOT NULL,
    customer_id text NOT NULL,
    customer_name text,
    category_name text NOT NULL,
    last_order_date timestamp with time zone,
    recency_days integer,
    orders_count integer,
    revenue_total numeric(12,2),
    aov numeric(12,2),
    r_score integer,
    f_score integer,
    m_score integer,
    rfm_score text,
    segment_name text,
    reference_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_rfm_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_rfm_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    source_type text NOT NULL,
    customer_id text NOT NULL,
    customer_name text,
    customer_email text,
    customer_phone text,
    customer_doc text,
    last_order_date timestamp with time zone,
    recency_days integer,
    orders_count integer,
    revenue_total numeric DEFAULT 0,
    aov numeric DEFAULT 0,
    avg_order_interval_days numeric,
    r_score integer,
    f_score integer,
    m_score integer,
    rfm_score text,
    segment_name text,
    segment_action text,
    churn_risk text DEFAULT 'saudavel'::text,
    reference_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    predicted_next_purchase_date date,
    purchase_probability_7d numeric(5,2),
    purchase_probability_15d numeric(5,2),
    purchase_probability_30d numeric(5,2),
    ideal_offer_window_start integer,
    ideal_offer_window_end integer,
    first_purchase_date date,
    ltv_predicted_12m numeric DEFAULT 0,
    churn_probability numeric DEFAULT 0
);

ALTER TABLE ONLY public.customer_rfm_snapshots REPLICA IDENTITY FULL;


--
-- Name: customer_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tags (
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dead_letter_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dead_letter_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    source_queue text NOT NULL,
    source_item_id uuid NOT NULL,
    channel_type text NOT NULL,
    channel_id uuid,
    destination text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    error_code text,
    attempts integer DEFAULT 0 NOT NULL,
    correlation_id text,
    metadata jsonb,
    status text DEFAULT 'dead'::text NOT NULL,
    retried_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_campaign_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    event_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    recipient_email text,
    recipient_name text,
    status text,
    error_message text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    is_test boolean DEFAULT false NOT NULL,
    sender_email text
);


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    internal_name text NOT NULL,
    subject text NOT NULL,
    preheader text,
    sender_name text NOT NULL,
    sender_email text NOT NULL,
    reply_to text,
    campaign_type public.email_campaign_type NOT NULL,
    status public.email_campaign_status DEFAULT 'draft'::public.email_campaign_status NOT NULL,
    scheduled_at timestamp with time zone,
    audience_type text,
    audience_reference text,
    content_json jsonb,
    content_html text,
    template_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    total_recipients integer DEFAULT 0,
    total_sent integer DEFAULT 0,
    total_delivered integer DEFAULT 0,
    total_opened integer DEFAULT 0,
    total_clicked integer DEFAULT 0,
    total_bounced integer DEFAULT 0,
    total_complained integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    is_archived boolean DEFAULT false,
    has_unsubscribe_link boolean DEFAULT false,
    compliance_checked_at timestamp with time zone,
    total_unsubscribed integer DEFAULT 0,
    email_integration_id uuid,
    ab_test_id uuid,
    ab_variant text,
    ab_split_pct integer DEFAULT 50,
    ab_offset_pct integer DEFAULT 0
);


--
-- Name: email_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    log_id uuid,
    event_type text NOT NULL,
    recipient_email text NOT NULL,
    link_url text,
    user_agent text,
    ip_address text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_events_event_type_check CHECK ((event_type = ANY (ARRAY['open'::text, 'click'::text, 'bounce'::text, 'complaint'::text, 'unsubscribe'::text])))
);


--
-- Name: email_integration_senders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_integration_senders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    sender_email text NOT NULL,
    sender_name text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sender_email text NOT NULL,
    smtp_host text NOT NULL,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_user text NOT NULL,
    smtp_password text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid,
    smtp_secure boolean DEFAULT false,
    smtp_tls boolean DEFAULT true,
    reply_to text,
    sender_name text,
    daily_send_limit integer,
    max_sends_per_second integer,
    smtp_password_encrypted text
);


--
-- Name: email_suppression_list; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_suppression_list (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    reason text NOT NULL,
    source text,
    campaign_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_suppression_list_reason_check CHECK ((reason = ANY (ARRAY['unsubscribed'::text, 'bounced'::text, 'complained'::text, 'invalid'::text, 'blocked'::text])))
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    template_type public.email_template_type NOT NULL,
    content_json jsonb,
    content_html text,
    thumbnail_url text,
    is_system boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true
);


--
-- Name: email_unsubscribe_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_unsubscribe_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    recipient_email text NOT NULL,
    recipient_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone,
    last_opened_at timestamp with time zone,
    last_clicked_at timestamp with time zone
);


--
-- Name: function_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.function_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    function_name text NOT NULL,
    tenant_id uuid,
    correlation_id text,
    status text DEFAULT 'ok'::text NOT NULL,
    duration_ms integer,
    items_processed integer DEFAULT 0,
    items_failed integer DEFAULT 0,
    items_dead integer DEFAULT 0,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: generated_coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generated_coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid,
    coupon_code text NOT NULL,
    discount_percentage numeric NOT NULL,
    customer_email text,
    customer_phone text,
    order_id text,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_name text,
    customer_cpf text,
    coupon_value numeric,
    used_in_order_id text,
    used_order_value numeric,
    tenant_id uuid,
    integration_id uuid,
    li_coupon_id integer,
    source text DEFAULT 'cashback'::text,
    coupon_type text,
    coupon_description text,
    li_data_inicio timestamp with time zone,
    li_data_fim timestamp with time zone,
    li_quantidade_uso_maximo integer,
    li_quantidade_usada integer DEFAULT 0
);

ALTER TABLE ONLY public.generated_coupons REPLICA IDENTITY FULL;


--
-- Name: inbox_routing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inbox_routing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    channel text NOT NULL,
    condition_type text DEFAULT 'all'::text NOT NULL,
    condition_value text,
    target_inbox_id uuid,
    target_type text DEFAULT 'inbox'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inboxes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inboxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    channel_id uuid NOT NULL,
    bot_enabled boolean DEFAULT false NOT NULL,
    sla_first_response_minutes integer,
    sla_resolution_minutes integer,
    business_hours_json jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_agent_id uuid,
    integration_id uuid
);


--
-- Name: instagram_ad_welcome_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_ad_welcome_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    name text NOT NULL,
    campaign_id text,
    adset_id text,
    ad_id text,
    flow_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_ai_flow_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_ai_flow_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    objective text,
    trigger_type text,
    tone text,
    language text DEFAULT 'pt-BR'::text,
    cta text,
    data_fields text[] DEFAULT '{}'::text[],
    include_handoff boolean DEFAULT false,
    generated_nodes jsonb DEFAULT '[]'::jsonb,
    generated_edges jsonb DEFAULT '[]'::jsonb,
    suggested_tags text[] DEFAULT '{}'::text[],
    suggested_fields text[] DEFAULT '{}'::text[],
    validation_report jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'draft'::text,
    created_at timestamp with time zone DEFAULT now(),
    converted_flow_id uuid
);


--
-- Name: instagram_blocked_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_blocked_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    igsid text,
    username text,
    blocked_by uuid,
    reason text,
    blocked_at timestamp with time zone DEFAULT now(),
    unblocked_at timestamp with time zone,
    is_active boolean DEFAULT true
);


--
-- Name: instagram_channel_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_channel_capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    comments boolean DEFAULT false NOT NULL,
    private_replies boolean DEFAULT false NOT NULL,
    story_reply boolean DEFAULT false NOT NULL,
    story_mention boolean DEFAULT false NOT NULL,
    live_comments boolean DEFAULT false NOT NULL,
    welcome_ads boolean DEFAULT false NOT NULL,
    ice_breakers boolean DEFAULT false NOT NULL,
    persistent_menu boolean DEFAULT false NOT NULL,
    follow_to_dm boolean DEFAULT false NOT NULL,
    share_to_dm boolean DEFAULT false NOT NULL,
    content_publish boolean DEFAULT false NOT NULL,
    insights boolean DEFAULT false NOT NULL,
    moderation boolean DEFAULT false NOT NULL,
    raw_capabilities jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_channel_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_channel_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    insight_date date NOT NULL,
    followers_count integer,
    follows_count integer,
    media_count integer,
    impressions integer DEFAULT 0,
    reach integer DEFAULT 0,
    profile_views integer DEFAULT 0,
    website_clicks integer DEFAULT 0,
    email_contacts integer DEFAULT 0,
    phone_call_clicks integer DEFAULT 0,
    get_directions_clicks integer DEFAULT 0,
    audience_demographics jsonb DEFAULT '{}'::jsonb,
    online_followers jsonb DEFAULT '{}'::jsonb,
    insights_raw jsonb DEFAULT '{}'::jsonb,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    ig_user_id text NOT NULL,
    instagram_username text,
    access_token_encrypted text NOT NULL,
    token_expires_at timestamp with time zone,
    token_refresh_at timestamp with time zone,
    status public.instagram_channel_status DEFAULT 'disconnected'::public.instagram_channel_status NOT NULL,
    webhook_verified boolean DEFAULT false NOT NULL,
    app_mode text DEFAULT 'development'::text NOT NULL,
    default_locale text DEFAULT 'pt_BR'::text,
    default_timezone text DEFAULT 'America/Sao_Paulo'::text,
    last_sync_at timestamp with time zone,
    last_healthcheck_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_comment_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_comment_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    ig_comment_id text NOT NULL,
    ig_media_id text,
    parent_comment_id text,
    commenter_igsid text,
    commenter_username text,
    text text,
    is_hidden boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    moderation_status text DEFAULT 'pending'::text,
    flagged_terms text[],
    replied_publicly boolean DEFAULT false,
    replied_privately boolean DEFAULT false,
    media_type text,
    is_live_comment boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    moderated_at timestamp with time zone,
    moderated_by uuid,
    CONSTRAINT instagram_comment_queue_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'flagged'::text, 'hidden'::text, 'deleted'::text])))
);


--
-- Name: instagram_comment_replies_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_comment_replies_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    comment_id text NOT NULL,
    reply_type text NOT NULL,
    watchlist_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_contact_pauses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_contact_pauses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    paused_until timestamp with time zone,
    reason text,
    source text DEFAULT 'manual'::text NOT NULL,
    paused_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_contact_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_contact_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    igsid text NOT NULL,
    instagram_username text,
    display_name text,
    profile_pic_url text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_user_interaction_at timestamp with time zone,
    standard_window_expires_at timestamp with time zone,
    human_window_expires_at timestamp with time zone,
    is_blocked boolean DEFAULT false NOT NULL,
    source_first_entry text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    phone text,
    email_verified boolean DEFAULT false,
    phone_verified boolean DEFAULT false,
    email_consent_at timestamp with time zone,
    phone_consent_at timestamp with time zone,
    email_source text,
    phone_source text
);


--
-- Name: instagram_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    content_type text NOT NULL,
    caption text,
    media_urls text[] DEFAULT '{}'::text[],
    cover_url text,
    status text DEFAULT 'draft'::text,
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    ig_media_id text,
    ig_permalink text,
    error_message text,
    linked_flow_id uuid,
    linked_trigger_type text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT instagram_content_content_type_check CHECK ((content_type = ANY (ARRAY['image'::text, 'video'::text, 'reel'::text, 'carousel'::text]))),
    CONSTRAINT instagram_content_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'publishing'::text, 'published'::text, 'failed'::text])))
);


--
-- Name: instagram_cta_link_clicks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_cta_link_clicks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    cta_link_id uuid NOT NULL,
    contact_id uuid,
    thread_id uuid,
    message_id uuid,
    clicked_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_cta_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_cta_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    label text NOT NULL,
    url text NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    ref_key text,
    flow_id uuid,
    version_id uuid,
    node_id text,
    click_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_data_collection_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_data_collection_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    field_name text NOT NULL,
    field_value text NOT NULL,
    source text DEFAULT 'flow'::text NOT NULL,
    flow_id uuid,
    flow_run_id uuid,
    node_id text,
    consent_given boolean DEFAULT false,
    consent_text text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_deep_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_deep_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    slug text NOT NULL,
    ref_key text NOT NULL,
    flow_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    click_count integer DEFAULT 0 NOT NULL,
    conversation_count integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_event_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid,
    contact_id uuid,
    thread_id uuid,
    event_type text NOT NULL,
    event_source text,
    provider_object_id text,
    event_time timestamp with time zone DEFAULT now() NOT NULL,
    normalized_payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_experimental_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_experimental_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    execution_type text NOT NULL,
    config_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    feature_key text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    enabled_at timestamp with time zone,
    enabled_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_flow_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_flow_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    version_id uuid NOT NULL,
    source_node_id uuid NOT NULL,
    target_node_id uuid NOT NULL,
    source_handle text,
    label text,
    condition jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_flow_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_flow_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    version_id uuid NOT NULL,
    node_type text NOT NULL,
    label text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    position_x double precision DEFAULT 0 NOT NULL,
    position_y double precision DEFAULT 0 NOT NULL,
    is_entry boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_flow_run_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_flow_run_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    run_id uuid NOT NULL,
    node_id uuid NOT NULL,
    node_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    input jsonb,
    output jsonb,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_flow_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_flow_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    version_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    trigger_rule_id uuid,
    status text DEFAULT 'running'::text NOT NULL,
    current_node_id uuid,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    paused_by_contact_rule boolean DEFAULT false NOT NULL,
    idempotency_key text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_flow_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_flow_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    snapshot jsonb,
    published_at timestamp with time zone,
    published_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    live_version_id uuid,
    allow_parallel_runs boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_follow_dm_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_follow_dm_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    welcome_text text,
    delay_seconds integer DEFAULT 5 NOT NULL,
    flow_id uuid,
    once_per_user boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_ice_breakers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_ice_breakers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    text text NOT NULL,
    flow_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_media_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_media_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    ig_media_id text NOT NULL,
    media_type text,
    permalink text,
    caption text,
    "timestamp" timestamp with time zone,
    impressions integer DEFAULT 0,
    reach integer DEFAULT 0,
    likes integer DEFAULT 0,
    comments integer DEFAULT 0,
    saves integer DEFAULT 0,
    shares integer DEFAULT 0,
    plays integer DEFAULT 0,
    dm_threads_generated integer DEFAULT 0,
    dm_leads_captured integer DEFAULT 0,
    insights_raw jsonb DEFAULT '{}'::jsonb,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_media_watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_media_watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    media_id text,
    media_type text DEFAULT 'post'::text NOT NULL,
    watch_mode text DEFAULT 'specific'::text NOT NULL,
    keywords_include text[] DEFAULT '{}'::text[],
    keywords_exclude text[] DEFAULT '{}'::text[],
    reply_public_enabled boolean DEFAULT false NOT NULL,
    reply_public_variants text[] DEFAULT '{}'::text[],
    private_reply_enabled boolean DEFAULT false NOT NULL,
    private_reply_flow_id uuid,
    first_comment_only boolean DEFAULT false NOT NULL,
    delay_seconds integer DEFAULT 0,
    round_robin_index integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dm_message text,
    keyword_responses jsonb DEFAULT '[]'::jsonb,
    rule_name text
);


--
-- Name: instagram_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    provider_message_id text,
    direction public.instagram_message_direction NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    text_body text,
    media_url text,
    payload jsonb,
    sent_by_user_id uuid,
    delivery_status public.instagram_delivery_status DEFAULT 'pending'::public.instagram_delivery_status NOT NULL,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cta_link_id uuid,
    cta_click_tracked boolean DEFAULT false
);


--
-- Name: instagram_metrics_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_metrics_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    metric_date date NOT NULL,
    inbound_messages integer DEFAULT 0,
    outbound_messages integer DEFAULT 0,
    new_threads integer DEFAULT 0,
    private_replies_sent integer DEFAULT 0,
    flows_started integer DEFAULT 0,
    flows_completed integer DEFAULT 0,
    handoffs_to_human integer DEFAULT 0,
    comment_triggers integer DEFAULT 0,
    story_reply_triggers integer DEFAULT 0,
    story_mention_triggers integer DEFAULT 0,
    live_comment_triggers integer DEFAULT 0,
    ad_entry_triggers integer DEFAULT 0,
    ref_url_entries integer DEFAULT 0,
    send_failures integer DEFAULT 0,
    avg_first_response_seconds numeric,
    avg_human_mode_seconds numeric,
    emails_captured integer DEFAULT 0,
    phones_captured integer DEFAULT 0,
    cta_clicks integer DEFAULT 0,
    pauses_count integer DEFAULT 0,
    flow_metrics jsonb DEFAULT '{}'::jsonb,
    trigger_metrics jsonb DEFAULT '{}'::jsonb,
    operator_metrics jsonb DEFAULT '{}'::jsonb,
    media_metrics jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    thread_id uuid,
    contact_id uuid,
    message_kind text DEFAULT 'text'::text NOT NULL,
    payload jsonb NOT NULL,
    send_after timestamp with time zone DEFAULT now() NOT NULL,
    status public.instagram_outbox_status DEFAULT 'pending'::public.instagram_outbox_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    provider_message_id text,
    idempotency_key text NOT NULL,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_persistent_menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_persistent_menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    label text NOT NULL,
    action_type text DEFAULT 'postback'::text NOT NULL,
    action_payload text,
    flow_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_quick_automation_installs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_quick_automation_installs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    template_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    installed_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_quick_automation_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_quick_automation_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'growth'::text NOT NULL,
    description text,
    required_capabilities text[] DEFAULT '{}'::text[],
    template_nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
    template_edges jsonb DEFAULT '[]'::jsonb NOT NULL,
    trigger_config jsonb,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_share_dm_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_share_dm_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    target_mode text DEFAULT 'all'::text NOT NULL,
    target_media_id text,
    flow_id uuid,
    once_per_user_per_automation boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: instagram_term_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_term_blacklist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid,
    term text NOT NULL,
    action text DEFAULT 'flag'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT instagram_term_blacklist_action_check CHECK ((action = ANY (ARRAY['flag'::text, 'hide'::text, 'spam'::text, 'block'::text])))
);


--
-- Name: instagram_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    provider_thread_id text,
    thread_status public.instagram_thread_status DEFAULT 'open'::public.instagram_thread_status NOT NULL,
    current_mode text DEFAULT 'bot'::text NOT NULL,
    assigned_user_id uuid,
    entrypoint_type text,
    entrypoint_ref text,
    last_message_preview text,
    last_message_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    automations_paused_until timestamp with time zone,
    automation_pause_reason text,
    automation_pause_source text,
    is_spam boolean DEFAULT false,
    spam_marked_at timestamp with time zone,
    spam_marked_by uuid
);


--
-- Name: instagram_trigger_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_trigger_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    flow_id uuid NOT NULL,
    trigger_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    environment text DEFAULT 'production'::text NOT NULL,
    throttle_mode text DEFAULT 'always'::text NOT NULL,
    keywords text[],
    keyword_match_mode text DEFAULT 'exact'::text,
    tag_filter_ids uuid[],
    time_filter jsonb,
    timeout_seconds integer,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    instagram_integration_id uuid
);


--
-- Name: instagram_webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    channel_id uuid,
    provider_delivery_key text,
    event_hash text,
    signature_valid boolean,
    payload jsonb NOT NULL,
    processed boolean DEFAULT false NOT NULL,
    processed_at timestamp with time zone,
    parse_status text DEFAULT 'pending'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    api_key text,
    status text DEFAULT 'pending'::text NOT NULL,
    last_sync_at timestamp with time zone,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid,
    last_orders_sync_at timestamp with time zone,
    last_customers_sync_at timestamp with time zone,
    last_products_sync_at timestamp with time zone,
    initial_sync_completed boolean DEFAULT false,
    bling_store_ids integer[],
    auto_sync_enabled boolean DEFAULT true,
    auto_sync_interval_minutes integer DEFAULT 5,
    auto_sync_orders boolean DEFAULT true,
    auto_sync_customers boolean DEFAULT true,
    auto_sync_products boolean DEFAULT true,
    auto_sync_coupons boolean DEFAULT true,
    auto_sync_shipments boolean DEFAULT true,
    last_auto_sync_at timestamp with time zone,
    auto_sync_orders_interval integer DEFAULT 5,
    auto_sync_customers_interval integer DEFAULT 5,
    auto_sync_products_interval integer DEFAULT 5,
    auto_sync_coupons_interval integer DEFAULT 5,
    auto_sync_shipments_interval integer DEFAULT 5,
    last_sync_orders_at timestamp with time zone,
    last_sync_customers_at timestamp with time zone,
    last_sync_products_at timestamp with time zone,
    last_sync_coupons_at timestamp with time zone,
    last_sync_shipments_at timestamp with time zone,
    store_integration_id uuid
);

ALTER TABLE ONLY public.integrations REPLICA IDENTITY FULL;


--
-- Name: kanban_columns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanban_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'bg-blue-500'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    is_default_for_new boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    contact_id uuid,
    conversation_id uuid,
    integration_id uuid,
    name text,
    phone text,
    email text,
    source text DEFAULT 'receptionist'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: li_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    loja_integrada_customer_id integer NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    doc text,
    address_json jsonb,
    raw_json jsonb,
    updated_at_remote timestamp with time zone,
    updated_at_local timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.li_customers REPLICA IDENTITY FULL;


--
-- Name: li_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    loja_integrada_product_id integer,
    sku text,
    name text NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    price numeric,
    raw_json jsonb
);


--
-- Name: li_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    loja_integrada_order_id integer NOT NULL,
    order_number text NOT NULL,
    status_id integer,
    status_name text,
    customer_id uuid,
    totals_json jsonb,
    shipping_json jsonb,
    payment_json jsonb,
    items_json jsonb,
    created_at_remote timestamp with time zone,
    updated_at_remote timestamp with time zone,
    raw_json jsonb,
    updated_at_local timestamp with time zone DEFAULT now() NOT NULL,
    last_status_check_at timestamp with time zone
);

ALTER TABLE ONLY public.li_orders REPLICA IDENTITY FULL;


--
-- Name: li_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    loja_integrada_product_id integer NOT NULL,
    sku text,
    name text NOT NULL,
    price numeric,
    promotional_price numeric,
    cost_price numeric,
    stock integer,
    stock_managed boolean DEFAULT false,
    active boolean DEFAULT true,
    variations_json jsonb,
    image_url text,
    raw_json jsonb,
    updated_at_remote timestamp with time zone,
    updated_at_local timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.li_products REPLICA IDENTITY FULL;


--
-- Name: li_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    entity_type text NOT NULL,
    last_cursor text,
    last_synced_at timestamp with time zone,
    records_synced integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_offset integer DEFAULT 0,
    total_count integer
);


--
-- Name: li_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.li_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid,
    tenant_id uuid,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    resource_type text NOT NULL,
    resource_id text,
    payload_json jsonb,
    processed_at timestamp with time zone,
    status text DEFAULT 'received'::text NOT NULL,
    error text,
    dedupe_key text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL
);


--
-- Name: loyalty_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    customer_external_id text NOT NULL,
    customer_name text,
    customer_phone text,
    points integer NOT NULL,
    type text NOT NULL,
    description text,
    order_id text,
    coupon_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT loyalty_points_type_check CHECK ((type = ANY (ARRAY['earn'::text, 'redeem'::text, 'bonus'::text, 'expire'::text])))
);


--
-- Name: loyalty_programs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loyalty_programs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    name text DEFAULT 'Programa de Pontos'::text NOT NULL,
    points_per_brl numeric(10,2) DEFAULT 1.00 NOT NULL,
    min_points_redeem integer DEFAULT 100 NOT NULL,
    points_to_brl numeric(10,4) DEFAULT 0.01 NOT NULL,
    champion_multiplier numeric(4,2) DEFAULT 2.00 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notify_via_whatsapp boolean DEFAULT false NOT NULL,
    whatsapp_integration_id uuid,
    notification_template_earn text DEFAULT 'Olá {{cliente_primeiro_nome}}! Você ganhou {{pontos}} pontos no programa de fidelidade. Total acumulado: {{total_pontos}} pontos. 🎉'::text NOT NULL,
    notification_template_redeem text DEFAULT 'Seu cupom {{cupom_codigo}} foi gerado com {{pontos}} pontos resgatados. Use até {{validade}}. 🎁'::text NOT NULL
);


--
-- Name: me_auto_sync_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.me_auto_sync_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    sync_type text DEFAULT 'shipments'::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    interval_minutes integer DEFAULT 30 NOT NULL,
    last_sync_at timestamp with time zone,
    next_sync_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: me_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.me_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    me_id text NOT NULL,
    order_id uuid,
    order_number text,
    protocol text,
    tracking_code text,
    service_name text,
    carrier text,
    status text DEFAULT 'pending'::text,
    price numeric(10,2),
    discount numeric(10,2),
    insurance_value numeric(10,2),
    format text,
    weight numeric(10,3),
    width integer,
    height integer,
    length integer,
    receipt boolean DEFAULT false,
    own_hand boolean DEFAULT false,
    collect boolean DEFAULT false,
    from_address jsonb,
    to_address jsonb,
    tracking_events jsonb DEFAULT '[]'::jsonb,
    last_tracking_at timestamp with time zone,
    posted_at timestamp with time zone,
    delivered_at timestamp with time zone,
    canceled_at timestamp with time zone,
    expired_at timestamp with time zone,
    raw_data jsonb,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    invoice jsonb,
    volumes jsonb,
    tags jsonb,
    authorization_code text,
    quote numeric,
    products jsonb,
    paid_at timestamp with time zone,
    generated_at timestamp with time zone,
    print_url text,
    preview_url text,
    delivery_min integer,
    delivery_max integer,
    estimated_delivery_at timestamp with time zone,
    sender_name text,
    receiver_name text,
    receiver_phone text,
    receiver_city text,
    receiver_state text,
    receiver_address jsonb,
    dimensions jsonb,
    last_sync_at timestamp with time zone DEFAULT now(),
    external_order_number text,
    li_order_id uuid,
    sender_document text,
    sender_email text,
    sender_phone text,
    receiver_email text,
    receiver_document text,
    receiver_note text,
    agency_name text,
    agency_address jsonb,
    cte_key text,
    contract text,
    billed_weight numeric,
    non_commercial boolean DEFAULT false,
    conciliation jsonb,
    additional_info jsonb,
    service_details jsonb,
    financial_details jsonb,
    integration_id uuid,
    bling_order_id uuid
);

ALTER TABLE ONLY public.me_shipments REPLICA IDENTITY FULL;


--
-- Name: me_sync_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.me_sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    current_page integer DEFAULT 1,
    total_pages integer,
    items_saved integer DEFAULT 0,
    items_total integer,
    items_linked integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cursor_data jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE ONLY public.me_sync_jobs REPLICA IDENTITY FULL;


--
-- Name: melhor_envio_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.melhor_envio_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    user_id text,
    user_name text,
    user_email text,
    environment text DEFAULT 'production'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    access_token_encrypted text,
    refresh_token_encrypted text
);


--
-- Name: member_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    permission public.module_permission NOT NULL,
    can_view boolean DEFAULT true NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: message_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    channel text NOT NULL,
    recipient text NOT NULL,
    message_content text NOT NULL,
    subject text,
    html_content text,
    whatsapp_integration_id uuid,
    email_integration_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 3 NOT NULL,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    reference_type text,
    reference_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT message_queue_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text]))),
    CONSTRAINT message_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    chatwoot_message_id integer,
    sender_type character varying(20) NOT NULL,
    sender_id uuid,
    content text NOT NULL,
    content_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    media_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    direction text DEFAULT 'inbound'::text NOT NULL,
    provider_message_id text,
    error_json jsonb,
    type text DEFAULT 'text'::text NOT NULL,
    CONSTRAINT messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal_note'::text, 'system'::text]))),
    CONSTRAINT messages_type_check CHECK ((type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'file'::text, 'interactive'::text])))
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: notification_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    sound_enabled boolean DEFAULT true NOT NULL,
    sound_volume numeric(3,2) DEFAULT 0.5,
    desktop_notifications boolean DEFAULT true NOT NULL,
    new_message_sound text DEFAULT 'default'::text,
    new_conversation_sound text DEFAULT 'default'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nuvemshop_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    created_by_user_id uuid,
    store_id bigint NOT NULL,
    store_name text,
    store_url text,
    store_country text,
    store_email text,
    scope text,
    access_token text DEFAULT ''::text,
    access_token_encrypted text,
    status text DEFAULT 'connected'::text NOT NULL,
    last_error text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nuvemshop_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    nuvemshop_customer_id bigint NOT NULL,
    name text,
    email text,
    phone text,
    doc text,
    address_json jsonb,
    total_spent numeric(14,2),
    total_orders integer,
    raw_json jsonb,
    updated_at_remote timestamp with time zone,
    updated_at_local timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.nuvemshop_customers REPLICA IDENTITY FULL;


--
-- Name: nuvemshop_lgpd_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_lgpd_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid,
    tenant_id uuid,
    event_type text NOT NULL,
    store_id bigint,
    customer_id bigint,
    orders_to_redact jsonb,
    payload_json jsonb NOT NULL,
    hmac_valid boolean,
    status text DEFAULT 'received'::text NOT NULL,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nuvemshop_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    nuvemshop_product_id bigint,
    nuvemshop_variant_id bigint,
    sku text,
    name text,
    qty integer,
    price numeric(14,2),
    raw_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nuvemshop_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    nuvemshop_order_id bigint NOT NULL,
    order_number text,
    status text,
    payment_status text,
    shipping_status text,
    customer_id uuid,
    totals_json jsonb,
    shipping_json jsonb,
    payment_json jsonb,
    items_json jsonb,
    raw_json jsonb,
    created_at_remote timestamp with time zone,
    updated_at_remote timestamp with time zone,
    updated_at_local timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.nuvemshop_orders REPLICA IDENTITY FULL;


--
-- Name: nuvemshop_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    nuvemshop_product_id bigint NOT NULL,
    sku text,
    name text,
    handle text,
    description text,
    price numeric(14,2),
    promotional_price numeric(14,2),
    cost_price numeric(14,2),
    stock integer,
    stock_managed boolean DEFAULT false,
    active boolean DEFAULT true,
    variations_json jsonb,
    image_url text,
    raw_json jsonb,
    updated_at_remote timestamp with time zone,
    updated_at_local timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.nuvemshop_products REPLICA IDENTITY FULL;


--
-- Name: nuvemshop_sync_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_sync_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    entity_type text NOT NULL,
    last_synced_at timestamp with time zone,
    last_page integer DEFAULT 0,
    records_synced integer DEFAULT 0,
    total_count integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.nuvemshop_sync_state REPLICA IDENTITY FULL;


--
-- Name: nuvemshop_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nuvemshop_webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid,
    tenant_id uuid,
    event text NOT NULL,
    store_id bigint,
    resource_id text,
    payload_json jsonb,
    status text DEFAULT 'received'::text NOT NULL,
    error text,
    retry_count integer DEFAULT 0,
    dedupe_key text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone
);


--
-- Name: oauth_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oauth_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state text NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'meta'::text NOT NULL,
    redirect_path text DEFAULT '/integrations'::text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    frontend_url text,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: order_notification_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_notification_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text DEFAULT 'Notificação de Pedido'::text NOT NULL,
    integration_id uuid,
    whatsapp_integration_id uuid,
    email_integration_id uuid,
    send_via_whatsapp boolean DEFAULT true,
    send_via_email boolean DEFAULT false,
    is_active boolean DEFAULT true,
    tokens_per_execution integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_notification_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_notification_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    config_id uuid,
    rule_id uuid,
    order_id text NOT NULL,
    order_number text,
    customer_phone text,
    customer_email text,
    status_name text,
    message_sent text,
    channel text DEFAULT 'whatsapp'::text,
    status text DEFAULT 'pending'::text,
    error_message text,
    tokens_used integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_notification_status_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_notification_status_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    status_name text NOT NULL,
    status_id integer,
    is_enabled boolean DEFAULT true,
    message_template text NOT NULL,
    email_subject text,
    email_body text,
    delay_minutes integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: outbound_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbound_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    message_id uuid,
    channel_id uuid NOT NULL,
    to_phone_e164 text NOT NULL,
    payload_json jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT outbound_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'dead'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_name text,
    notification_prefs jsonb DEFAULT '{"sound": true, "events": {"low_stock": true, "new_order": true, "rfm_alert": true, "sync_error": true, "new_message": true, "campaign_complete": true}, "enabled": true}'::jsonb,
    onboarding_completed boolean DEFAULT false,
    checklist_dismissed boolean DEFAULT false,
    active_tenant_id uuid
);


--
-- Name: quick_replies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text,
    shortcut text,
    usage_count integer DEFAULT 0,
    is_favorite boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: reactivation_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reactivation_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text DEFAULT 'Reativação de Clientes'::text NOT NULL,
    integration_id uuid,
    whatsapp_integration_id uuid,
    inactivity_days integer DEFAULT 30 NOT NULL,
    coupon_discount_percent numeric DEFAULT 10 NOT NULL,
    coupon_duration_days integer DEFAULT 7 NOT NULL,
    message_template text DEFAULT 'Olá {nome}! Sentimos sua falta 💜 Aqui está um cupom de {desconto}% para sua próxima compra: {cupom}. Válido por {dias} dias!'::text NOT NULL,
    is_active boolean DEFAULT false,
    activated_at timestamp with time zone,
    tokens_per_execution integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resend_interval_days integer DEFAULT 0,
    max_cycles integer DEFAULT 0 NOT NULL
);


--
-- Name: reactivation_cycle_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reactivation_cycle_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    step_number integer DEFAULT 1 NOT NULL,
    delay_days integer DEFAULT 7 NOT NULL,
    message_template text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    use_custom_coupon boolean DEFAULT false NOT NULL,
    coupon_discount_percent integer,
    coupon_duration_days integer
);


--
-- Name: reactivation_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reactivation_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    config_id uuid,
    customer_name text,
    customer_phone text,
    customer_email text,
    coupon_code text,
    last_order_date timestamp with time zone,
    days_inactive integer,
    status text DEFAULT 'pending'::text,
    error_message text,
    tokens_used integer,
    created_at timestamp with time zone DEFAULT now(),
    cycle_step integer DEFAULT 1
);


--
-- Name: receptionist_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receptionist_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text DEFAULT 'Recepcionista Virtual'::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    welcome_message text DEFAULT 'Olá! 👋 Bem-vindo(a)! Como posso ajudá-lo(a) hoje?'::text NOT NULL,
    menu_format text DEFAULT 'buttons'::text NOT NULL,
    list_title text DEFAULT 'Escolha uma opção'::text,
    list_button_text text DEFAULT 'Ver opções'::text,
    menu_options jsonb DEFAULT '[{"id": "1", "label": "Falar com atendente", "action_type": "transfer_to_human"}]'::jsonb NOT NULL,
    menu_trigger_keywords jsonb DEFAULT '["menu", "opções", "opcoes"]'::jsonb NOT NULL,
    human_handoff_message text DEFAULT 'Entendido! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor.'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_column_id uuid,
    lead_capture_enabled boolean DEFAULT false,
    lead_capture_name_message text DEFAULT 'Para um melhor atendimento, qual é o seu nome? 😊'::text,
    lead_capture_phone_message text DEFAULT 'Obrigado, {nome}! Agora me informe seu número de telefone com DDD:'::text,
    lead_capture_success_message text DEFAULT 'Perfeito, {nome}! Seus dados foram salvos. Agora vamos ao seu atendimento...'::text,
    CONSTRAINT receptionist_configs_menu_format_check CHECK ((menu_format = ANY (ARRAY['buttons'::text, 'list'::text])))
);


--
-- Name: rfm_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfm_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    alert_type text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    severity text DEFAULT 'warning'::text NOT NULL,
    reference_date text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rfm_audience_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfm_audience_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    audience_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rfm_audiences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfm_audiences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    rules jsonb DEFAULT '{}'::jsonb NOT NULL,
    member_count integer DEFAULT 0 NOT NULL,
    total_revenue numeric DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_calculated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: team_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb,
    invite_token text DEFAULT ''::text NOT NULL,
    invited_by uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    invite_token_hash text,
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])))
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.team_role DEFAULT 'member'::public.team_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_ai_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_ai_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text DEFAULT 'lovable'::text NOT NULL,
    api_key_encrypted text,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    CONSTRAINT tenant_ai_credentials_provider_check CHECK ((provider = ANY (ARRAY['lovable'::text, 'openai'::text, 'google'::text, 'groq'::text, 'mistral'::text])))
);


--
-- Name: tenant_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text DEFAULT 'Default'::text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    last_used_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    balance integer DEFAULT 0 NOT NULL,
    plan_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.tenant_tokens REPLICA IDENTITY FULL;


--
-- Name: tenant_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    secret text,
    is_active boolean DEFAULT true NOT NULL,
    last_triggered_at timestamp with time zone,
    success_count integer DEFAULT 0 NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenant_whitelabel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_whitelabel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    company_name text,
    logo_url text,
    favicon_url text,
    colors jsonb DEFAULT '{"accent": "#f59e0b", "primary": "#6d28d9", "secondary": "#a855f7", "background": "#0f0f23", "foreground": "#ffffff"}'::jsonb NOT NULL,
    custom_domain text,
    domain_verified boolean DEFAULT false NOT NULL,
    hide_branding boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: token_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    tokens integer NOT NULL,
    price numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: token_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.token_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    amount integer NOT NULL,
    type text NOT NULL,
    description text,
    reference_id text,
    balance_after integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.token_transactions REPLICA IDENTITY FULL;


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    provider text NOT NULL,
    channel_id uuid,
    event_type text NOT NULL,
    provider_message_id text,
    payload_json jsonb NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processing_status text DEFAULT 'pending'::text NOT NULL,
    error_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_events_processing_status_check CHECK ((processing_status = ANY (ARRAY['pending'::text, 'processed'::text, 'ignored'::text, 'failed'::text])))
);


--
-- Name: whatsapp_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    display_name text NOT NULL,
    phone_e164 text,
    provider_account_id text,
    waba_id text,
    status text DEFAULT 'disconnected'::text NOT NULL,
    webhook_secret text,
    access_token text,
    metadata_json jsonb DEFAULT '{}'::jsonb,
    integration_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT whatsapp_channels_provider_check CHECK ((provider = ANY (ARRAY['evolution'::text, 'meta'::text]))),
    CONSTRAINT whatsapp_channels_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text])))
);


--
-- Name: ai_agent_column_assignments ai_agent_column_assignments_column_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_column_assignments
    ADD CONSTRAINT ai_agent_column_assignments_column_id_tenant_id_key UNIQUE (column_id, tenant_id);


--
-- Name: ai_agent_column_assignments ai_agent_column_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_column_assignments
    ADD CONSTRAINT ai_agent_column_assignments_pkey PRIMARY KEY (id);


--
-- Name: ai_agents ai_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_pkey PRIMARY KEY (id);


--
-- Name: ai_assistant_configs ai_assistant_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_assistant_configs
    ADD CONSTRAINT ai_assistant_configs_pkey PRIMARY KEY (id);


--
-- Name: ai_assistant_configs ai_assistant_configs_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_assistant_configs
    ADD CONSTRAINT ai_assistant_configs_tenant_id_key UNIQUE (tenant_id);


--
-- Name: ai_provider_health ai_provider_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_health
    ADD CONSTRAINT ai_provider_health_pkey PRIMARY KEY (id);


--
-- Name: ai_provider_health ai_provider_health_tenant_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_health
    ADD CONSTRAINT ai_provider_health_tenant_id_provider_key UNIQUE (tenant_id, provider);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: auto_messages auto_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_messages
    ADD CONSTRAINT auto_messages_pkey PRIMARY KEY (id);


--
-- Name: auto_messages auto_messages_tenant_id_message_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_messages
    ADD CONSTRAINT auto_messages_tenant_id_message_type_key UNIQUE (tenant_id, message_type);


--
-- Name: birthday_configs birthday_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_configs
    ADD CONSTRAINT birthday_configs_pkey PRIMARY KEY (id);


--
-- Name: birthday_executions birthday_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_executions
    ADD CONSTRAINT birthday_executions_pkey PRIMARY KEY (id);


--
-- Name: bling_code_mappings bling_code_mappings_integration_id_mapping_type_original_co_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_code_mappings
    ADD CONSTRAINT bling_code_mappings_integration_id_mapping_type_original_co_key UNIQUE (integration_id, mapping_type, original_code);


--
-- Name: bling_code_mappings bling_code_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_code_mappings
    ADD CONSTRAINT bling_code_mappings_pkey PRIMARY KEY (id);


--
-- Name: bling_connections bling_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_connections
    ADD CONSTRAINT bling_connections_pkey PRIMARY KEY (id);


--
-- Name: bling_customers bling_customers_bling_id_integration_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_customers
    ADD CONSTRAINT bling_customers_bling_id_integration_id_key UNIQUE (bling_id, integration_id);


--
-- Name: bling_customers bling_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_customers
    ADD CONSTRAINT bling_customers_pkey PRIMARY KEY (id);


--
-- Name: bling_order_items bling_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_order_items
    ADD CONSTRAINT bling_order_items_pkey PRIMARY KEY (id);


--
-- Name: bling_orders bling_orders_bling_id_integration_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_orders
    ADD CONSTRAINT bling_orders_bling_id_integration_id_key UNIQUE (bling_id, integration_id);


--
-- Name: bling_orders bling_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_orders
    ADD CONSTRAINT bling_orders_pkey PRIMARY KEY (id);


--
-- Name: bling_products bling_products_bling_id_integration_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_products
    ADD CONSTRAINT bling_products_bling_id_integration_id_key UNIQUE (bling_id, integration_id);


--
-- Name: bling_products bling_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_products
    ADD CONSTRAINT bling_products_pkey PRIMARY KEY (id);


--
-- Name: bling_situacoes bling_situacoes_integration_id_situacao_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_situacoes
    ADD CONSTRAINT bling_situacoes_integration_id_situacao_id_key UNIQUE (integration_id, situacao_id);


--
-- Name: bling_situacoes bling_situacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_situacoes
    ADD CONSTRAINT bling_situacoes_pkey PRIMARY KEY (id);


--
-- Name: bling_sync_jobs bling_sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_sync_jobs
    ADD CONSTRAINT bling_sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: bling_sync_logs bling_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_sync_logs
    ADD CONSTRAINT bling_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: bling_webhook_events bling_webhook_events_event_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_webhook_events
    ADD CONSTRAINT bling_webhook_events_event_key_key UNIQUE (event_key);


--
-- Name: bling_webhook_events bling_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_webhook_events
    ADD CONSTRAINT bling_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: bulk_campaigns bulk_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_campaigns
    ADD CONSTRAINT bulk_campaigns_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_pkey PRIMARY KEY (id);


--
-- Name: business_hours business_hours_tenant_id_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_tenant_id_day_of_week_key UNIQUE (tenant_id, day_of_week);


--
-- Name: campaign_contacts campaign_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_pkey PRIMARY KEY (id);


--
-- Name: cashback_balances cashback_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_balances
    ADD CONSTRAINT cashback_balances_pkey PRIMARY KEY (id);


--
-- Name: cashback_configs cashback_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_configs
    ADD CONSTRAINT cashback_configs_pkey PRIMARY KEY (id);


--
-- Name: cashback_executions cashback_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_executions
    ADD CONSTRAINT cashback_executions_pkey PRIMARY KEY (id);


--
-- Name: cashback_reminders cashback_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_reminders
    ADD CONSTRAINT cashback_reminders_pkey PRIMARY KEY (id);


--
-- Name: chatbot_flow_edges chatbot_flow_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_edges
    ADD CONSTRAINT chatbot_flow_edges_pkey PRIMARY KEY (id);


--
-- Name: chatbot_flow_nodes chatbot_flow_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_nodes
    ADD CONSTRAINT chatbot_flow_nodes_pkey PRIMARY KEY (id);


--
-- Name: chatbot_flow_sessions chatbot_flow_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_sessions
    ADD CONSTRAINT chatbot_flow_sessions_pkey PRIMARY KEY (id);


--
-- Name: chatbot_flows chatbot_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flows
    ADD CONSTRAINT chatbot_flows_pkey PRIMARY KEY (id);


--
-- Name: churn_campaign_configs churn_campaign_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.churn_campaign_configs
    ADD CONSTRAINT churn_campaign_configs_pkey PRIMARY KEY (id);


--
-- Name: churn_campaign_triggers churn_campaign_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.churn_campaign_triggers
    ADD CONSTRAINT churn_campaign_triggers_pkey PRIMARY KEY (id);


--
-- Name: circuit_breaker_state circuit_breaker_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuit_breaker_state
    ADD CONSTRAINT circuit_breaker_state_pkey PRIMARY KEY (id);


--
-- Name: circuit_breaker_state circuit_breaker_state_provider_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuit_breaker_state
    ADD CONSTRAINT circuit_breaker_state_provider_tenant_id_key UNIQUE (provider, tenant_id);


--
-- Name: contact_blocks contact_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_blocks
    ADD CONSTRAINT contact_blocks_pkey PRIMARY KEY (id);


--
-- Name: contact_blocks contact_blocks_tenant_id_phone_e164_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_blocks
    ADD CONSTRAINT contact_blocks_tenant_id_phone_e164_key UNIQUE (tenant_id, phone_e164);


--
-- Name: contact_custom_field_values contact_custom_field_values_contact_id_field_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_field_values
    ADD CONSTRAINT contact_custom_field_values_contact_id_field_id_key UNIQUE (contact_id, field_id);


--
-- Name: contact_custom_field_values contact_custom_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_field_values
    ADD CONSTRAINT contact_custom_field_values_pkey PRIMARY KEY (id);


--
-- Name: contact_custom_fields contact_custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_pkey PRIMARY KEY (id);


--
-- Name: contact_custom_fields contact_custom_fields_tenant_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_tenant_id_name_key UNIQUE (tenant_id, name);


--
-- Name: contact_merges contact_merges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_merges
    ADD CONSTRAINT contact_merges_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_tenant_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_tenant_id_phone_key UNIQUE (tenant_id, phone);


--
-- Name: conversation_events conversation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_pkey PRIMARY KEY (id);


--
-- Name: conversation_tags conversation_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tags
    ADD CONSTRAINT conversation_tags_pkey PRIMARY KEY (conversation_id, tag_id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: crm_segments crm_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments
    ADD CONSTRAINT crm_segments_pkey PRIMARY KEY (id);


--
-- Name: customer_rfm_category_snapshots customer_rfm_category_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_rfm_category_snapshots
    ADD CONSTRAINT customer_rfm_category_snapshots_pkey PRIMARY KEY (id);


--
-- Name: customer_rfm_snapshots customer_rfm_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_rfm_snapshots
    ADD CONSTRAINT customer_rfm_snapshots_pkey PRIMARY KEY (id);


--
-- Name: customer_tags customer_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_pkey PRIMARY KEY (customer_id, tag_id);


--
-- Name: dead_letter_queue dead_letter_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dead_letter_queue
    ADD CONSTRAINT dead_letter_queue_pkey PRIMARY KEY (id);


--
-- Name: email_campaign_logs email_campaign_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_logs
    ADD CONSTRAINT email_campaign_logs_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: email_events email_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_pkey PRIMARY KEY (id);


--
-- Name: email_integration_senders email_integration_senders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_integration_senders
    ADD CONSTRAINT email_integration_senders_pkey PRIMARY KEY (id);


--
-- Name: email_integrations email_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_integrations
    ADD CONSTRAINT email_integrations_pkey PRIMARY KEY (id);


--
-- Name: email_suppression_list email_suppression_list_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_pkey PRIMARY KEY (id);


--
-- Name: email_suppression_list email_suppression_list_tenant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_tenant_id_email_key UNIQUE (tenant_id, email);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_campaign_id_recipient_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_campaign_id_recipient_email_key UNIQUE (campaign_id, recipient_email);


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);


--
-- Name: function_metrics function_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.function_metrics
    ADD CONSTRAINT function_metrics_pkey PRIMARY KEY (id);


--
-- Name: generated_coupons generated_coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_coupons
    ADD CONSTRAINT generated_coupons_pkey PRIMARY KEY (id);


--
-- Name: inbox_routing_rules inbox_routing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_routing_rules
    ADD CONSTRAINT inbox_routing_rules_pkey PRIMARY KEY (id);


--
-- Name: inboxes inboxes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inboxes
    ADD CONSTRAINT inboxes_pkey PRIMARY KEY (id);


--
-- Name: instagram_ad_welcome_flows instagram_ad_welcome_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_ad_welcome_flows
    ADD CONSTRAINT instagram_ad_welcome_flows_pkey PRIMARY KEY (id);


--
-- Name: instagram_ai_flow_drafts instagram_ai_flow_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_ai_flow_drafts
    ADD CONSTRAINT instagram_ai_flow_drafts_pkey PRIMARY KEY (id);


--
-- Name: instagram_blocked_users instagram_blocked_users_channel_id_contact_id_is_active_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_blocked_users
    ADD CONSTRAINT instagram_blocked_users_channel_id_contact_id_is_active_key UNIQUE (channel_id, contact_id, is_active);


--
-- Name: instagram_blocked_users instagram_blocked_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_blocked_users
    ADD CONSTRAINT instagram_blocked_users_pkey PRIMARY KEY (id);


--
-- Name: instagram_channel_capabilities instagram_channel_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channel_capabilities
    ADD CONSTRAINT instagram_channel_capabilities_pkey PRIMARY KEY (id);


--
-- Name: instagram_channel_insights instagram_channel_insights_channel_id_insight_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channel_insights
    ADD CONSTRAINT instagram_channel_insights_channel_id_insight_date_key UNIQUE (channel_id, insight_date);


--
-- Name: instagram_channel_insights instagram_channel_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channel_insights
    ADD CONSTRAINT instagram_channel_insights_pkey PRIMARY KEY (id);


--
-- Name: instagram_channels instagram_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channels
    ADD CONSTRAINT instagram_channels_pkey PRIMARY KEY (id);


--
-- Name: instagram_comment_queue instagram_comment_queue_ig_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comment_queue
    ADD CONSTRAINT instagram_comment_queue_ig_comment_id_key UNIQUE (ig_comment_id);


--
-- Name: instagram_comment_queue instagram_comment_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comment_queue
    ADD CONSTRAINT instagram_comment_queue_pkey PRIMARY KEY (id);


--
-- Name: instagram_comment_replies_log instagram_comment_replies_log_comment_id_reply_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comment_replies_log
    ADD CONSTRAINT instagram_comment_replies_log_comment_id_reply_type_key UNIQUE (comment_id, reply_type);


--
-- Name: instagram_comment_replies_log instagram_comment_replies_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comment_replies_log
    ADD CONSTRAINT instagram_comment_replies_log_pkey PRIMARY KEY (id);


--
-- Name: instagram_contact_pauses instagram_contact_pauses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_pauses
    ADD CONSTRAINT instagram_contact_pauses_pkey PRIMARY KEY (id);


--
-- Name: instagram_contact_tags instagram_contact_tags_contact_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_tags
    ADD CONSTRAINT instagram_contact_tags_contact_id_tag_id_key UNIQUE (contact_id, tag_id);


--
-- Name: instagram_contact_tags instagram_contact_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_tags
    ADD CONSTRAINT instagram_contact_tags_pkey PRIMARY KEY (id);


--
-- Name: instagram_contacts instagram_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contacts
    ADD CONSTRAINT instagram_contacts_pkey PRIMARY KEY (id);


--
-- Name: instagram_content instagram_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_content
    ADD CONSTRAINT instagram_content_pkey PRIMARY KEY (id);


--
-- Name: instagram_cta_link_clicks instagram_cta_link_clicks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_cta_link_clicks
    ADD CONSTRAINT instagram_cta_link_clicks_pkey PRIMARY KEY (id);


--
-- Name: instagram_cta_links instagram_cta_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_cta_links
    ADD CONSTRAINT instagram_cta_links_pkey PRIMARY KEY (id);


--
-- Name: instagram_data_collection_events instagram_data_collection_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_data_collection_events
    ADD CONSTRAINT instagram_data_collection_events_pkey PRIMARY KEY (id);


--
-- Name: instagram_deep_links instagram_deep_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_deep_links
    ADD CONSTRAINT instagram_deep_links_pkey PRIMARY KEY (id);


--
-- Name: instagram_deep_links instagram_deep_links_tenant_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_deep_links
    ADD CONSTRAINT instagram_deep_links_tenant_id_slug_key UNIQUE (tenant_id, slug);


--
-- Name: instagram_event_log instagram_event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_event_log
    ADD CONSTRAINT instagram_event_log_pkey PRIMARY KEY (id);


--
-- Name: instagram_experimental_executions instagram_experimental_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_experimental_executions
    ADD CONSTRAINT instagram_experimental_executions_pkey PRIMARY KEY (id);


--
-- Name: instagram_feature_flags instagram_feature_flags_channel_id_feature_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_feature_flags
    ADD CONSTRAINT instagram_feature_flags_channel_id_feature_key_key UNIQUE (channel_id, feature_key);


--
-- Name: instagram_feature_flags instagram_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_feature_flags
    ADD CONSTRAINT instagram_feature_flags_pkey PRIMARY KEY (id);


--
-- Name: instagram_flow_edges instagram_flow_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_edges
    ADD CONSTRAINT instagram_flow_edges_pkey PRIMARY KEY (id);


--
-- Name: instagram_flow_nodes instagram_flow_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_nodes
    ADD CONSTRAINT instagram_flow_nodes_pkey PRIMARY KEY (id);


--
-- Name: instagram_flow_run_steps instagram_flow_run_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_run_steps
    ADD CONSTRAINT instagram_flow_run_steps_pkey PRIMARY KEY (id);


--
-- Name: instagram_flow_runs instagram_flow_runs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_runs
    ADD CONSTRAINT instagram_flow_runs_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: instagram_flow_runs instagram_flow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_runs
    ADD CONSTRAINT instagram_flow_runs_pkey PRIMARY KEY (id);


--
-- Name: instagram_flow_versions instagram_flow_versions_flow_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_versions
    ADD CONSTRAINT instagram_flow_versions_flow_id_version_number_key UNIQUE (flow_id, version_number);


--
-- Name: instagram_flow_versions instagram_flow_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_versions
    ADD CONSTRAINT instagram_flow_versions_pkey PRIMARY KEY (id);


--
-- Name: instagram_flows instagram_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flows
    ADD CONSTRAINT instagram_flows_pkey PRIMARY KEY (id);


--
-- Name: instagram_follow_dm_configs instagram_follow_dm_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_follow_dm_configs
    ADD CONSTRAINT instagram_follow_dm_configs_pkey PRIMARY KEY (id);


--
-- Name: instagram_ice_breakers instagram_ice_breakers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_ice_breakers
    ADD CONSTRAINT instagram_ice_breakers_pkey PRIMARY KEY (id);


--
-- Name: instagram_media_insights instagram_media_insights_channel_id_ig_media_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_media_insights
    ADD CONSTRAINT instagram_media_insights_channel_id_ig_media_id_key UNIQUE (channel_id, ig_media_id);


--
-- Name: instagram_media_insights instagram_media_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_media_insights
    ADD CONSTRAINT instagram_media_insights_pkey PRIMARY KEY (id);


--
-- Name: instagram_media_watchlist instagram_media_watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_media_watchlist
    ADD CONSTRAINT instagram_media_watchlist_pkey PRIMARY KEY (id);


--
-- Name: instagram_messages instagram_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_messages
    ADD CONSTRAINT instagram_messages_pkey PRIMARY KEY (id);


--
-- Name: instagram_metrics_daily instagram_metrics_daily_channel_id_metric_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_metrics_daily
    ADD CONSTRAINT instagram_metrics_daily_channel_id_metric_date_key UNIQUE (channel_id, metric_date);


--
-- Name: instagram_metrics_daily instagram_metrics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_metrics_daily
    ADD CONSTRAINT instagram_metrics_daily_pkey PRIMARY KEY (id);


--
-- Name: instagram_outbox instagram_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_outbox
    ADD CONSTRAINT instagram_outbox_pkey PRIMARY KEY (id);


--
-- Name: instagram_persistent_menu_items instagram_persistent_menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_persistent_menu_items
    ADD CONSTRAINT instagram_persistent_menu_items_pkey PRIMARY KEY (id);


--
-- Name: instagram_quick_automation_installs instagram_quick_automation_installs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_quick_automation_installs
    ADD CONSTRAINT instagram_quick_automation_installs_pkey PRIMARY KEY (id);


--
-- Name: instagram_quick_automation_templates instagram_quick_automation_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_quick_automation_templates
    ADD CONSTRAINT instagram_quick_automation_templates_pkey PRIMARY KEY (id);


--
-- Name: instagram_quick_automation_templates instagram_quick_automation_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_quick_automation_templates
    ADD CONSTRAINT instagram_quick_automation_templates_slug_key UNIQUE (slug);


--
-- Name: instagram_share_dm_configs instagram_share_dm_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_share_dm_configs
    ADD CONSTRAINT instagram_share_dm_configs_pkey PRIMARY KEY (id);


--
-- Name: instagram_tags instagram_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_tags
    ADD CONSTRAINT instagram_tags_pkey PRIMARY KEY (id);


--
-- Name: instagram_tags instagram_tags_tenant_id_channel_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_tags
    ADD CONSTRAINT instagram_tags_tenant_id_channel_id_name_key UNIQUE (tenant_id, channel_id, name);


--
-- Name: instagram_term_blacklist instagram_term_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_term_blacklist
    ADD CONSTRAINT instagram_term_blacklist_pkey PRIMARY KEY (id);


--
-- Name: instagram_threads instagram_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_threads
    ADD CONSTRAINT instagram_threads_pkey PRIMARY KEY (id);


--
-- Name: instagram_trigger_rules instagram_trigger_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_trigger_rules
    ADD CONSTRAINT instagram_trigger_rules_pkey PRIMARY KEY (id);


--
-- Name: instagram_webhook_deliveries instagram_webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_webhook_deliveries
    ADD CONSTRAINT instagram_webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: kanban_columns kanban_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_columns
    ADD CONSTRAINT kanban_columns_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: li_customers li_customers_integration_id_loja_integrada_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_customers
    ADD CONSTRAINT li_customers_integration_id_loja_integrada_customer_id_key UNIQUE (integration_id, loja_integrada_customer_id);


--
-- Name: li_customers li_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_customers
    ADD CONSTRAINT li_customers_pkey PRIMARY KEY (id);


--
-- Name: li_order_items li_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_order_items
    ADD CONSTRAINT li_order_items_pkey PRIMARY KEY (id);


--
-- Name: li_orders li_orders_integration_id_loja_integrada_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_orders
    ADD CONSTRAINT li_orders_integration_id_loja_integrada_order_id_key UNIQUE (integration_id, loja_integrada_order_id);


--
-- Name: li_orders li_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_orders
    ADD CONSTRAINT li_orders_pkey PRIMARY KEY (id);


--
-- Name: li_products li_products_integration_id_loja_integrada_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_products
    ADD CONSTRAINT li_products_integration_id_loja_integrada_product_id_key UNIQUE (integration_id, loja_integrada_product_id);


--
-- Name: li_products li_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_products
    ADD CONSTRAINT li_products_pkey PRIMARY KEY (id);


--
-- Name: li_sync_state li_sync_state_integration_id_entity_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_sync_state
    ADD CONSTRAINT li_sync_state_integration_id_entity_type_key UNIQUE (integration_id, entity_type);


--
-- Name: li_sync_state li_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_sync_state
    ADD CONSTRAINT li_sync_state_pkey PRIMARY KEY (id);


--
-- Name: li_webhook_events li_webhook_events_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_webhook_events
    ADD CONSTRAINT li_webhook_events_dedupe_key_key UNIQUE (dedupe_key);


--
-- Name: li_webhook_events li_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_webhook_events
    ADD CONSTRAINT li_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: loyalty_points loyalty_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_pkey PRIMARY KEY (id);


--
-- Name: loyalty_programs loyalty_programs_integration_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_programs
    ADD CONSTRAINT loyalty_programs_integration_id_key UNIQUE (integration_id);


--
-- Name: loyalty_programs loyalty_programs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_programs
    ADD CONSTRAINT loyalty_programs_pkey PRIMARY KEY (id);


--
-- Name: me_auto_sync_configs me_auto_sync_configs_integration_id_sync_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_auto_sync_configs
    ADD CONSTRAINT me_auto_sync_configs_integration_id_sync_type_key UNIQUE (integration_id, sync_type);


--
-- Name: me_auto_sync_configs me_auto_sync_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_auto_sync_configs
    ADD CONSTRAINT me_auto_sync_configs_pkey PRIMARY KEY (id);


--
-- Name: me_shipments me_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_shipments
    ADD CONSTRAINT me_shipments_pkey PRIMARY KEY (id);


--
-- Name: me_shipments me_shipments_tenant_id_me_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_shipments
    ADD CONSTRAINT me_shipments_tenant_id_me_id_key UNIQUE (tenant_id, me_id);


--
-- Name: me_sync_jobs me_sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_sync_jobs
    ADD CONSTRAINT me_sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: melhor_envio_tokens melhor_envio_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.melhor_envio_tokens
    ADD CONSTRAINT melhor_envio_tokens_pkey PRIMARY KEY (id);


--
-- Name: melhor_envio_tokens melhor_envio_tokens_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.melhor_envio_tokens
    ADD CONSTRAINT melhor_envio_tokens_tenant_id_key UNIQUE (tenant_id);


--
-- Name: member_permissions member_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_permissions
    ADD CONSTRAINT member_permissions_pkey PRIMARY KEY (id);


--
-- Name: member_permissions member_permissions_team_member_id_permission_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_permissions
    ADD CONSTRAINT member_permissions_team_member_id_permission_key UNIQUE (team_member_id, permission);


--
-- Name: message_queue message_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_queue
    ADD CONSTRAINT message_queue_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_pkey PRIMARY KEY (id);


--
-- Name: notification_settings notification_settings_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_tenant_id_key UNIQUE (tenant_id);


--
-- Name: nuvemshop_connections nuvemshop_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_connections
    ADD CONSTRAINT nuvemshop_connections_pkey PRIMARY KEY (id);


--
-- Name: nuvemshop_connections nuvemshop_connections_tenant_id_store_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_connections
    ADD CONSTRAINT nuvemshop_connections_tenant_id_store_id_key UNIQUE (tenant_id, store_id);


--
-- Name: nuvemshop_customers nuvemshop_customers_integration_id_nuvemshop_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_customers
    ADD CONSTRAINT nuvemshop_customers_integration_id_nuvemshop_customer_id_key UNIQUE (integration_id, nuvemshop_customer_id);


--
-- Name: nuvemshop_customers nuvemshop_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_customers
    ADD CONSTRAINT nuvemshop_customers_pkey PRIMARY KEY (id);


--
-- Name: nuvemshop_lgpd_events nuvemshop_lgpd_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_lgpd_events
    ADD CONSTRAINT nuvemshop_lgpd_events_pkey PRIMARY KEY (id);


--
-- Name: nuvemshop_order_items nuvemshop_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_order_items
    ADD CONSTRAINT nuvemshop_order_items_pkey PRIMARY KEY (id);


--
-- Name: nuvemshop_orders nuvemshop_orders_integration_id_nuvemshop_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_orders
    ADD CONSTRAINT nuvemshop_orders_integration_id_nuvemshop_order_id_key UNIQUE (integration_id, nuvemshop_order_id);


--
-- Name: nuvemshop_orders nuvemshop_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_orders
    ADD CONSTRAINT nuvemshop_orders_pkey PRIMARY KEY (id);


--
-- Name: nuvemshop_products nuvemshop_products_integration_id_nuvemshop_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_products
    ADD CONSTRAINT nuvemshop_products_integration_id_nuvemshop_product_id_key UNIQUE (integration_id, nuvemshop_product_id);


--
-- Name: nuvemshop_products nuvemshop_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_products
    ADD CONSTRAINT nuvemshop_products_pkey PRIMARY KEY (id);


--
-- Name: nuvemshop_sync_state nuvemshop_sync_state_integration_id_entity_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_sync_state
    ADD CONSTRAINT nuvemshop_sync_state_integration_id_entity_type_key UNIQUE (integration_id, entity_type);


--
-- Name: nuvemshop_sync_state nuvemshop_sync_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_sync_state
    ADD CONSTRAINT nuvemshop_sync_state_pkey PRIMARY KEY (id);


--
-- Name: nuvemshop_webhook_events nuvemshop_webhook_events_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_webhook_events
    ADD CONSTRAINT nuvemshop_webhook_events_dedupe_key_key UNIQUE (dedupe_key);


--
-- Name: nuvemshop_webhook_events nuvemshop_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_webhook_events
    ADD CONSTRAINT nuvemshop_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: oauth_states oauth_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_states oauth_states_state_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_states
    ADD CONSTRAINT oauth_states_state_key UNIQUE (state);


--
-- Name: order_notification_configs order_notification_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_configs
    ADD CONSTRAINT order_notification_configs_pkey PRIMARY KEY (id);


--
-- Name: order_notification_executions order_notification_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_executions
    ADD CONSTRAINT order_notification_executions_pkey PRIMARY KEY (id);


--
-- Name: order_notification_status_rules order_notification_status_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_status_rules
    ADD CONSTRAINT order_notification_status_rules_pkey PRIMARY KEY (id);


--
-- Name: outbound_queue outbound_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_queue
    ADD CONSTRAINT outbound_queue_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: quick_replies quick_replies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_pkey PRIMARY KEY (id);


--
-- Name: reactivation_configs reactivation_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_configs
    ADD CONSTRAINT reactivation_configs_pkey PRIMARY KEY (id);


--
-- Name: reactivation_cycle_steps reactivation_cycle_steps_config_id_step_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_cycle_steps
    ADD CONSTRAINT reactivation_cycle_steps_config_id_step_number_key UNIQUE (config_id, step_number);


--
-- Name: reactivation_cycle_steps reactivation_cycle_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_cycle_steps
    ADD CONSTRAINT reactivation_cycle_steps_pkey PRIMARY KEY (id);


--
-- Name: reactivation_executions reactivation_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_executions
    ADD CONSTRAINT reactivation_executions_pkey PRIMARY KEY (id);


--
-- Name: receptionist_configs receptionist_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptionist_configs
    ADD CONSTRAINT receptionist_configs_pkey PRIMARY KEY (id);


--
-- Name: receptionist_configs receptionist_configs_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptionist_configs
    ADD CONSTRAINT receptionist_configs_tenant_id_key UNIQUE (tenant_id);


--
-- Name: rfm_alerts rfm_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_alerts
    ADD CONSTRAINT rfm_alerts_pkey PRIMARY KEY (id);


--
-- Name: rfm_audience_members rfm_audience_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_audience_members
    ADD CONSTRAINT rfm_audience_members_pkey PRIMARY KEY (id);


--
-- Name: rfm_audiences rfm_audiences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_audiences
    ADD CONSTRAINT rfm_audiences_pkey PRIMARY KEY (id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: team_invites team_invites_invite_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_invite_token_hash_unique UNIQUE (invite_token_hash);


--
-- Name: team_invites team_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_tenant_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_tenant_id_user_id_key UNIQUE (tenant_id, user_id);


--
-- Name: tenant_ai_credentials tenant_ai_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_ai_credentials
    ADD CONSTRAINT tenant_ai_credentials_pkey PRIMARY KEY (id);


--
-- Name: tenant_ai_credentials tenant_ai_credentials_tenant_provider_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_ai_credentials
    ADD CONSTRAINT tenant_ai_credentials_tenant_provider_unique UNIQUE (tenant_id, provider);


--
-- Name: tenant_api_keys tenant_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_api_keys
    ADD CONSTRAINT tenant_api_keys_pkey PRIMARY KEY (id);


--
-- Name: tenant_tokens tenant_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_tokens
    ADD CONSTRAINT tenant_tokens_pkey PRIMARY KEY (id);


--
-- Name: tenant_tokens tenant_tokens_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_tokens
    ADD CONSTRAINT tenant_tokens_tenant_id_key UNIQUE (tenant_id);


--
-- Name: tenant_webhooks tenant_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_webhooks
    ADD CONSTRAINT tenant_webhooks_pkey PRIMARY KEY (id);


--
-- Name: tenant_whitelabel tenant_whitelabel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_whitelabel
    ADD CONSTRAINT tenant_whitelabel_pkey PRIMARY KEY (id);


--
-- Name: tenant_whitelabel tenant_whitelabel_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_whitelabel
    ADD CONSTRAINT tenant_whitelabel_tenant_id_key UNIQUE (tenant_id);


--
-- Name: tenants tenants_owner_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_owner_id_key UNIQUE (owner_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: token_plans token_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_plans
    ADD CONSTRAINT token_plans_pkey PRIMARY KEY (id);


--
-- Name: token_transactions token_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_transactions
    ADD CONSTRAINT token_transactions_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_channels whatsapp_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_channels
    ADD CONSTRAINT whatsapp_channels_pkey PRIMARY KEY (id);


--
-- Name: bling_connections_tenant_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bling_connections_tenant_id_idx ON public.bling_connections USING btree (tenant_id);


--
-- Name: conversations_csat_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX conversations_csat_token_idx ON public.conversations USING btree (csat_token);


--
-- Name: idx_ai_agents_agent_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agents_agent_type ON public.ai_agents USING btree (tenant_id, agent_type);


--
-- Name: idx_ai_provider_health_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_health_tenant ON public.ai_provider_health USING btree (tenant_id);


--
-- Name: idx_ai_usage_logs_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_provider ON public.ai_usage_logs USING btree (tenant_id, provider);


--
-- Name: idx_ai_usage_logs_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_tenant_created ON public.ai_usage_logs USING btree (tenant_id, created_at DESC);


--
-- Name: idx_birthday_configs_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_birthday_configs_integration_id ON public.birthday_configs USING btree (integration_id);


--
-- Name: idx_birthday_configs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_birthday_configs_tenant_id ON public.birthday_configs USING btree (tenant_id);


--
-- Name: idx_birthday_executions_config_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_birthday_executions_config_id ON public.birthday_executions USING btree (config_id);


--
-- Name: idx_birthday_executions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_birthday_executions_created_at ON public.birthday_executions USING btree (created_at DESC);


--
-- Name: idx_birthday_executions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_birthday_executions_tenant_id ON public.birthday_executions USING btree (tenant_id);


--
-- Name: idx_bling_code_mappings_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_code_mappings_lookup ON public.bling_code_mappings USING btree (integration_id, mapping_type);


--
-- Name: idx_bling_connections_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_connections_company_id ON public.bling_connections USING btree (bling_company_id);


--
-- Name: idx_bling_customers_bling_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_customers_bling_id ON public.bling_customers USING btree (bling_id);


--
-- Name: idx_bling_customers_cpf_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_customers_cpf_cnpj ON public.bling_customers USING btree (cpf_cnpj);


--
-- Name: idx_bling_customers_data_nascimento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_customers_data_nascimento ON public.bling_customers USING btree (data_nascimento);


--
-- Name: idx_bling_customers_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_customers_integration_id ON public.bling_customers USING btree (integration_id);


--
-- Name: idx_bling_customers_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_customers_nome ON public.bling_customers USING btree (nome);


--
-- Name: idx_bling_customers_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_customers_tenant_id ON public.bling_customers USING btree (tenant_id);


--
-- Name: idx_bling_order_items_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_order_items_order_id ON public.bling_order_items USING btree (order_id);


--
-- Name: idx_bling_order_items_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_order_items_tenant_id ON public.bling_order_items USING btree (tenant_id);


--
-- Name: idx_bling_orders_bling_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_orders_bling_id ON public.bling_orders USING btree (bling_id);


--
-- Name: idx_bling_orders_data_criacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_orders_data_criacao ON public.bling_orders USING btree (data_criacao DESC);


--
-- Name: idx_bling_orders_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_orders_integration_id ON public.bling_orders USING btree (integration_id);


--
-- Name: idx_bling_orders_loja_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_orders_loja_id ON public.bling_orders USING btree (loja_id);


--
-- Name: idx_bling_orders_situacao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_orders_situacao ON public.bling_orders USING btree (situacao_nome);


--
-- Name: idx_bling_orders_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_orders_tenant_id ON public.bling_orders USING btree (tenant_id);


--
-- Name: idx_bling_products_bling_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_bling_id ON public.bling_products USING btree (bling_id);


--
-- Name: idx_bling_products_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_codigo ON public.bling_products USING btree (codigo);


--
-- Name: idx_bling_products_fornecedor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_fornecedor ON public.bling_products USING btree (fornecedor_id) WHERE (fornecedor_id IS NOT NULL);


--
-- Name: idx_bling_products_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_integration_id ON public.bling_products USING btree (integration_id);


--
-- Name: idx_bling_products_marca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_marca ON public.bling_products USING btree (marca) WHERE (marca IS NOT NULL);


--
-- Name: idx_bling_products_ncm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_ncm ON public.bling_products USING btree (ncm) WHERE (ncm IS NOT NULL);


--
-- Name: idx_bling_products_nome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_nome ON public.bling_products USING btree (nome);


--
-- Name: idx_bling_products_produto_pai; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_produto_pai ON public.bling_products USING btree (produto_pai_id) WHERE (produto_pai_id IS NOT NULL);


--
-- Name: idx_bling_products_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_products_tenant_id ON public.bling_products USING btree (tenant_id);


--
-- Name: idx_bling_situacoes_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_situacoes_integration_id ON public.bling_situacoes USING btree (integration_id);


--
-- Name: idx_bling_situacoes_situacao_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_situacoes_situacao_id ON public.bling_situacoes USING btree (situacao_id);


--
-- Name: idx_bling_situacoes_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_situacoes_tenant_id ON public.bling_situacoes USING btree (tenant_id);


--
-- Name: idx_bling_sync_jobs_heartbeat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_jobs_heartbeat ON public.bling_sync_jobs USING btree (last_heartbeat_at) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- Name: idx_bling_sync_jobs_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_jobs_integration_id ON public.bling_sync_jobs USING btree (integration_id);


--
-- Name: idx_bling_sync_jobs_processor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_jobs_processor ON public.bling_sync_jobs USING btree (job_type, status, integration_id) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- Name: idx_bling_sync_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_jobs_status ON public.bling_sync_jobs USING btree (status);


--
-- Name: idx_bling_sync_jobs_sync_log_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_jobs_sync_log_id ON public.bling_sync_jobs USING btree (sync_log_id);


--
-- Name: idx_bling_sync_jobs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_jobs_tenant_id ON public.bling_sync_jobs USING btree (tenant_id);


--
-- Name: idx_bling_sync_logs_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_logs_integration_id ON public.bling_sync_logs USING btree (integration_id);


--
-- Name: idx_bling_sync_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_logs_status ON public.bling_sync_logs USING btree (status);


--
-- Name: idx_bling_sync_logs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_sync_logs_tenant_id ON public.bling_sync_logs USING btree (tenant_id);


--
-- Name: idx_bling_webhook_events_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_webhook_events_received ON public.bling_webhook_events USING btree (received_at DESC);


--
-- Name: idx_bling_webhook_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_webhook_events_status ON public.bling_webhook_events USING btree (status);


--
-- Name: idx_bling_webhook_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bling_webhook_events_tenant ON public.bling_webhook_events USING btree (tenant_id);


--
-- Name: idx_bulk_campaigns_ab_test_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_campaigns_ab_test_id ON public.bulk_campaigns USING btree (ab_test_id) WHERE (ab_test_id IS NOT NULL);


--
-- Name: idx_bulk_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_campaigns_status ON public.bulk_campaigns USING btree (status);


--
-- Name: idx_bulk_campaigns_status_next_send; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_campaigns_status_next_send ON public.bulk_campaigns USING btree (status, next_send_at) WHERE (status = 'processing'::text);


--
-- Name: idx_bulk_campaigns_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bulk_campaigns_tenant_id ON public.bulk_campaigns USING btree (tenant_id);


--
-- Name: idx_campaign_contacts_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts USING btree (campaign_id);


--
-- Name: idx_campaign_contacts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts USING btree (status);


--
-- Name: idx_campaign_contacts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_contacts_tenant_id ON public.campaign_contacts USING btree (tenant_id);


--
-- Name: idx_cashback_configs_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_configs_integration_id ON public.cashback_configs USING btree (integration_id);


--
-- Name: idx_cashback_configs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_configs_tenant ON public.cashback_configs USING btree (tenant_id);


--
-- Name: idx_cashback_executions_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_executions_action ON public.cashback_executions USING btree (action_type);


--
-- Name: idx_cashback_executions_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_executions_config ON public.cashback_executions USING btree (config_id);


--
-- Name: idx_cashback_executions_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_executions_coupon ON public.cashback_executions USING btree (coupon_id);


--
-- Name: idx_cashback_executions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_executions_date ON public.cashback_executions USING btree (executed_at DESC);


--
-- Name: idx_cashback_reminders_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_reminders_coupon ON public.cashback_reminders USING btree (coupon_id);


--
-- Name: idx_cashback_reminders_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashback_reminders_pending ON public.cashback_reminders USING btree (scheduled_date, status) WHERE (status = 'pending'::text);


--
-- Name: idx_chatbot_flow_edges_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_flow_edges_flow ON public.chatbot_flow_edges USING btree (flow_id);


--
-- Name: idx_chatbot_flow_edges_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_flow_edges_source ON public.chatbot_flow_edges USING btree (source_node_id);


--
-- Name: idx_chatbot_flow_nodes_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_flow_nodes_flow ON public.chatbot_flow_nodes USING btree (flow_id);


--
-- Name: idx_chatbot_flow_sessions_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_flow_sessions_conv ON public.chatbot_flow_sessions USING btree (conversation_id);


--
-- Name: idx_churn_triggers_config_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_churn_triggers_config_customer ON public.churn_campaign_triggers USING btree (config_id, customer_id, triggered_at);


--
-- Name: idx_circuit_breaker_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_circuit_breaker_state ON public.circuit_breaker_state USING btree (state);


--
-- Name: idx_circuit_breaker_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_circuit_breaker_tenant ON public.circuit_breaker_state USING btree (tenant_id);


--
-- Name: idx_contact_blocks_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_blocks_tenant ON public.contact_blocks USING btree (tenant_id);


--
-- Name: idx_contacts_tenant_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_tenant_phone ON public.contacts USING btree (tenant_id, phone);


--
-- Name: idx_conv_events_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_events_conversation ON public.conversation_events USING btree (conversation_id);


--
-- Name: idx_conv_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conv_events_tenant ON public.conversation_events USING btree (tenant_id);


--
-- Name: idx_conversations_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_channel ON public.conversations USING btree (channel_id);


--
-- Name: idx_conversations_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_contact ON public.conversations USING btree (contact_id);


--
-- Name: idx_conversations_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_inbox ON public.conversations USING btree (inbox_id);


--
-- Name: idx_conversations_kanban_column; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_kanban_column ON public.conversations USING btree (kanban_column_id);


--
-- Name: idx_conversations_last_incoming_message; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_incoming_message ON public.conversations USING btree (last_incoming_message_id) WHERE (last_incoming_message_id IS NOT NULL);


--
-- Name: idx_conversations_last_message_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_last_message_at_desc ON public.conversations USING btree (tenant_id, last_message_at DESC NULLS LAST);


--
-- Name: idx_conversations_pending_ai_response; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_pending_ai_response ON public.conversations USING btree (pending_ai_response_at) WHERE (pending_ai_response_at IS NOT NULL);


--
-- Name: idx_conversations_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_priority ON public.conversations USING btree (priority);


--
-- Name: idx_conversations_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_source ON public.conversations USING btree (source);


--
-- Name: idx_conversations_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversations_tenant_status ON public.conversations USING btree (tenant_id, status);


--
-- Name: idx_crfm_cat_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crfm_cat_category ON public.customer_rfm_category_snapshots USING btree (category_name);


--
-- Name: idx_crfm_cat_integration_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crfm_cat_integration_date ON public.customer_rfm_category_snapshots USING btree (integration_id, reference_date);


--
-- Name: idx_crfm_cat_segment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crfm_cat_segment ON public.customer_rfm_category_snapshots USING btree (segment_name);


--
-- Name: idx_crfm_cat_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crfm_cat_tenant ON public.customer_rfm_category_snapshots USING btree (tenant_id);


--
-- Name: idx_crm_segments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_segments_tenant ON public.crm_segments USING btree (tenant_id);


--
-- Name: idx_customer_tags_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_tags_customer_id ON public.customer_tags USING btree (customer_id);


--
-- Name: idx_customer_tags_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_tags_tag_id ON public.customer_tags USING btree (tag_id);


--
-- Name: idx_customer_tags_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_tags_tenant_id ON public.customer_tags USING btree (tenant_id);


--
-- Name: idx_dead_letter_queue_correlation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dead_letter_queue_correlation ON public.dead_letter_queue USING btree (correlation_id);


--
-- Name: idx_dead_letter_queue_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dead_letter_queue_source ON public.dead_letter_queue USING btree (source_queue);


--
-- Name: idx_dead_letter_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dead_letter_queue_status ON public.dead_letter_queue USING btree (status);


--
-- Name: idx_dead_letter_queue_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dead_letter_queue_tenant ON public.dead_letter_queue USING btree (tenant_id);


--
-- Name: idx_email_campaign_logs_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_campaign ON public.email_campaign_logs USING btree (campaign_id);


--
-- Name: idx_email_campaign_logs_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_campaign_id ON public.email_campaign_logs USING btree (campaign_id);


--
-- Name: idx_email_campaign_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_created ON public.email_campaign_logs USING btree (created_at DESC);


--
-- Name: idx_email_campaign_logs_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_event_type ON public.email_campaign_logs USING btree (tenant_id, event_type);


--
-- Name: idx_email_campaign_logs_recipient_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_recipient_email ON public.email_campaign_logs USING btree (tenant_id, recipient_email);


--
-- Name: idx_email_campaign_logs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_tenant ON public.email_campaign_logs USING btree (tenant_id);


--
-- Name: idx_email_campaign_logs_tenant_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_tenant_campaign ON public.email_campaign_logs USING btree (tenant_id, campaign_id);


--
-- Name: idx_email_campaign_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_logs_type ON public.email_campaign_logs USING btree (event_type);


--
-- Name: idx_email_campaigns_ab_test_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_ab_test_id ON public.email_campaigns USING btree (ab_test_id) WHERE (ab_test_id IS NOT NULL);


--
-- Name: idx_email_campaigns_is_archived; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_is_archived ON public.email_campaigns USING btree (is_archived);


--
-- Name: idx_email_campaigns_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_scheduled ON public.email_campaigns USING btree (scheduled_at);


--
-- Name: idx_email_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_status ON public.email_campaigns USING btree (status);


--
-- Name: idx_email_campaigns_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_template ON public.email_campaigns USING btree (template_id);


--
-- Name: idx_email_campaigns_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_tenant ON public.email_campaigns USING btree (tenant_id);


--
-- Name: idx_email_campaigns_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_type ON public.email_campaigns USING btree (campaign_type);


--
-- Name: idx_email_events_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_campaign ON public.email_events USING btree (campaign_id);


--
-- Name: idx_email_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_created ON public.email_events USING btree (created_at DESC);


--
-- Name: idx_email_events_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_email ON public.email_events USING btree (recipient_email);


--
-- Name: idx_email_events_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_recipient ON public.email_events USING btree (tenant_id, recipient_email);


--
-- Name: idx_email_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_tenant ON public.email_events USING btree (tenant_id);


--
-- Name: idx_email_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_events_type ON public.email_events USING btree (event_type);


--
-- Name: idx_email_integration_senders_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_integration_senders_integration ON public.email_integration_senders USING btree (integration_id);


--
-- Name: idx_email_integration_senders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_integration_senders_tenant ON public.email_integration_senders USING btree (tenant_id);


--
-- Name: idx_email_suppression_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_suppression_email ON public.email_suppression_list USING btree (email);


--
-- Name: idx_email_suppression_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_suppression_reason ON public.email_suppression_list USING btree (reason);


--
-- Name: idx_email_suppression_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_suppression_tenant ON public.email_suppression_list USING btree (tenant_id);


--
-- Name: idx_email_templates_system; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_system ON public.email_templates USING btree (is_system);


--
-- Name: idx_email_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_tenant ON public.email_templates USING btree (tenant_id);


--
-- Name: idx_email_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_type ON public.email_templates USING btree (template_type);


--
-- Name: idx_email_unsubscribe_tokens_recipient_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_unsubscribe_tokens_recipient_email ON public.email_unsubscribe_tokens USING btree (tenant_id, recipient_email);


--
-- Name: idx_email_unsubscribe_tokens_tenant_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_unsubscribe_tokens_tenant_campaign ON public.email_unsubscribe_tokens USING btree (tenant_id, campaign_id);


--
-- Name: idx_function_metrics_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_function_metrics_created ON public.function_metrics USING btree (created_at);


--
-- Name: idx_function_metrics_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_function_metrics_name ON public.function_metrics USING btree (function_name);


--
-- Name: idx_function_metrics_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_function_metrics_status ON public.function_metrics USING btree (status);


--
-- Name: idx_function_metrics_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_function_metrics_tenant ON public.function_metrics USING btree (tenant_id);


--
-- Name: idx_generated_coupons_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_coupons_config ON public.generated_coupons USING btree (config_id);


--
-- Name: idx_generated_coupons_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_coupons_integration_id ON public.generated_coupons USING btree (integration_id);


--
-- Name: idx_generated_coupons_li_coupon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_coupons_li_coupon_id ON public.generated_coupons USING btree (li_coupon_id);


--
-- Name: idx_generated_coupons_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_coupons_source ON public.generated_coupons USING btree (source);


--
-- Name: idx_generated_coupons_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_coupons_tenant ON public.generated_coupons USING btree (tenant_id);


--
-- Name: idx_ig_capabilities_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ig_capabilities_channel ON public.instagram_channel_capabilities USING btree (channel_id);


--
-- Name: idx_ig_capabilities_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_capabilities_tenant ON public.instagram_channel_capabilities USING btree (tenant_id);


--
-- Name: idx_ig_channels_ig_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ig_channels_ig_user ON public.instagram_channels USING btree (ig_user_id);


--
-- Name: idx_ig_channels_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_channels_tenant ON public.instagram_channels USING btree (tenant_id);


--
-- Name: idx_ig_contact_pauses_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_contact_pauses_contact ON public.instagram_contact_pauses USING btree (contact_id, channel_id);


--
-- Name: idx_ig_contact_tags_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_contact_tags_contact ON public.instagram_contact_tags USING btree (contact_id);


--
-- Name: idx_ig_contact_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_contact_tags_tag ON public.instagram_contact_tags USING btree (tag_id);


--
-- Name: idx_ig_contacts_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_contacts_channel ON public.instagram_contacts USING btree (channel_id);


--
-- Name: idx_ig_contacts_channel_igsid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ig_contacts_channel_igsid ON public.instagram_contacts USING btree (channel_id, igsid);


--
-- Name: idx_ig_contacts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_contacts_tenant ON public.instagram_contacts USING btree (tenant_id);


--
-- Name: idx_ig_contacts_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_contacts_username ON public.instagram_contacts USING btree (instagram_username);


--
-- Name: idx_ig_events_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_events_channel ON public.instagram_event_log USING btree (channel_id);


--
-- Name: idx_ig_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_events_tenant ON public.instagram_event_log USING btree (tenant_id);


--
-- Name: idx_ig_events_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_events_time ON public.instagram_event_log USING btree (event_time DESC);


--
-- Name: idx_ig_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_events_type ON public.instagram_event_log USING btree (event_type);


--
-- Name: idx_ig_flow_edges_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_edges_version ON public.instagram_flow_edges USING btree (version_id);


--
-- Name: idx_ig_flow_nodes_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_nodes_version ON public.instagram_flow_nodes USING btree (version_id);


--
-- Name: idx_ig_flow_run_steps_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_run_steps_run ON public.instagram_flow_run_steps USING btree (run_id);


--
-- Name: idx_ig_flow_runs_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_runs_contact ON public.instagram_flow_runs USING btree (contact_id);


--
-- Name: idx_ig_flow_runs_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_runs_flow ON public.instagram_flow_runs USING btree (flow_id);


--
-- Name: idx_ig_flow_runs_idemp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_runs_idemp ON public.instagram_flow_runs USING btree (idempotency_key);


--
-- Name: idx_ig_flow_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_runs_status ON public.instagram_flow_runs USING btree (status);


--
-- Name: idx_ig_flow_runs_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_runs_thread ON public.instagram_flow_runs USING btree (thread_id);


--
-- Name: idx_ig_flow_versions_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flow_versions_flow ON public.instagram_flow_versions USING btree (flow_id);


--
-- Name: idx_ig_flows_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_flows_tenant ON public.instagram_flows USING btree (tenant_id, channel_id);


--
-- Name: idx_ig_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_messages_created ON public.instagram_messages USING btree (created_at DESC);


--
-- Name: idx_ig_messages_provider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_messages_provider_id ON public.instagram_messages USING btree (provider_message_id);


--
-- Name: idx_ig_messages_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_messages_tenant ON public.instagram_messages USING btree (tenant_id);


--
-- Name: idx_ig_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_messages_thread ON public.instagram_messages USING btree (thread_id);


--
-- Name: idx_ig_outbox_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_outbox_channel ON public.instagram_outbox USING btree (channel_id);


--
-- Name: idx_ig_outbox_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ig_outbox_idempotency ON public.instagram_outbox USING btree (idempotency_key);


--
-- Name: idx_ig_outbox_send_after; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_outbox_send_after ON public.instagram_outbox USING btree (send_after) WHERE (status = 'queued'::public.instagram_outbox_status);


--
-- Name: idx_ig_outbox_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_outbox_status ON public.instagram_outbox USING btree (status) WHERE (status = ANY (ARRAY['queued'::public.instagram_outbox_status, 'processing'::public.instagram_outbox_status]));


--
-- Name: idx_ig_outbox_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_outbox_tenant ON public.instagram_outbox USING btree (tenant_id);


--
-- Name: idx_ig_tags_tenant_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_tags_tenant_channel ON public.instagram_tags USING btree (tenant_id, channel_id);


--
-- Name: idx_ig_threads_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_threads_channel ON public.instagram_threads USING btree (channel_id);


--
-- Name: idx_ig_threads_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_threads_contact ON public.instagram_threads USING btree (contact_id);


--
-- Name: idx_ig_threads_last_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_threads_last_msg ON public.instagram_threads USING btree (last_message_at DESC);


--
-- Name: idx_ig_threads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_threads_status ON public.instagram_threads USING btree (thread_status);


--
-- Name: idx_ig_threads_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_threads_tenant ON public.instagram_threads USING btree (tenant_id);


--
-- Name: idx_ig_trigger_rules_flow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_trigger_rules_flow ON public.instagram_trigger_rules USING btree (flow_id);


--
-- Name: idx_ig_trigger_rules_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_trigger_rules_type ON public.instagram_trigger_rules USING btree (trigger_type, is_active);


--
-- Name: idx_ig_webhooks_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_webhooks_channel ON public.instagram_webhook_deliveries USING btree (channel_id);


--
-- Name: idx_ig_webhooks_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_webhooks_created ON public.instagram_webhook_deliveries USING btree (created_at DESC);


--
-- Name: idx_ig_webhooks_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_webhooks_hash ON public.instagram_webhook_deliveries USING btree (event_hash);


--
-- Name: idx_ig_webhooks_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_webhooks_processed ON public.instagram_webhook_deliveries USING btree (processed);


--
-- Name: idx_inboxes_ai_agent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inboxes_ai_agent_id ON public.inboxes USING btree (ai_agent_id);


--
-- Name: idx_inboxes_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inboxes_channel ON public.inboxes USING btree (channel_id);


--
-- Name: idx_inboxes_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inboxes_tenant ON public.inboxes USING btree (tenant_id);


--
-- Name: idx_instagram_trigger_rules_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instagram_trigger_rules_integration_id ON public.instagram_trigger_rules USING btree (instagram_integration_id);


--
-- Name: idx_integrations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_status ON public.integrations USING btree (status);


--
-- Name: idx_integrations_store_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_store_integration_id ON public.integrations USING btree (store_integration_id);


--
-- Name: idx_integrations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integrations_type ON public.integrations USING btree (type);


--
-- Name: idx_kanban_columns_tenant_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_columns_tenant_position ON public.kanban_columns USING btree (tenant_id, "position");


--
-- Name: idx_leads_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_created_at ON public.leads USING btree (created_at DESC);


--
-- Name: idx_leads_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_integration_id ON public.leads USING btree (integration_id);


--
-- Name: idx_leads_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_phone ON public.leads USING btree (phone);


--
-- Name: idx_leads_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_tenant_id ON public.leads USING btree (tenant_id);


--
-- Name: idx_li_customers_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_customers_doc ON public.li_customers USING btree (doc);


--
-- Name: idx_li_customers_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_customers_integration ON public.li_customers USING btree (integration_id);


--
-- Name: idx_li_customers_remote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_customers_remote_id ON public.li_customers USING btree (loja_integrada_customer_id);


--
-- Name: idx_li_customers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_customers_tenant ON public.li_customers USING btree (tenant_id);


--
-- Name: idx_li_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_order_items_order ON public.li_order_items USING btree (order_id);


--
-- Name: idx_li_order_items_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_order_items_tenant_id ON public.li_order_items USING btree (tenant_id);


--
-- Name: idx_li_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_orders_created ON public.li_orders USING btree (created_at_remote DESC);


--
-- Name: idx_li_orders_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_orders_customer_id ON public.li_orders USING btree (customer_id);


--
-- Name: idx_li_orders_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_orders_integration ON public.li_orders USING btree (integration_id);


--
-- Name: idx_li_orders_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_orders_number ON public.li_orders USING btree (order_number);


--
-- Name: idx_li_orders_remote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_orders_remote_id ON public.li_orders USING btree (loja_integrada_order_id);


--
-- Name: idx_li_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_orders_status ON public.li_orders USING btree (tenant_id, status_name);


--
-- Name: idx_li_orders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_orders_tenant ON public.li_orders USING btree (tenant_id);


--
-- Name: idx_li_products_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_products_integration ON public.li_products USING btree (integration_id);


--
-- Name: idx_li_products_remote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_products_remote_id ON public.li_products USING btree (loja_integrada_product_id);


--
-- Name: idx_li_products_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_products_sku ON public.li_products USING btree (sku);


--
-- Name: idx_li_products_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_products_tenant ON public.li_products USING btree (tenant_id);


--
-- Name: idx_li_webhook_events_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_webhook_events_integration ON public.li_webhook_events USING btree (integration_id);


--
-- Name: idx_li_webhook_events_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_webhook_events_received ON public.li_webhook_events USING btree (received_at DESC);


--
-- Name: idx_li_webhook_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_li_webhook_events_status ON public.li_webhook_events USING btree (status);


--
-- Name: idx_loyalty_points_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_points_customer ON public.loyalty_points USING btree (integration_id, customer_external_id);


--
-- Name: idx_loyalty_points_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_points_order ON public.loyalty_points USING btree (integration_id, order_id) WHERE (order_id IS NOT NULL);


--
-- Name: idx_loyalty_points_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_loyalty_points_tenant ON public.loyalty_points USING btree (tenant_id, integration_id);


--
-- Name: idx_me_auto_sync_next_sync; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_auto_sync_next_sync ON public.me_auto_sync_configs USING btree (next_sync_at) WHERE (is_active = true);


--
-- Name: idx_me_shipments_bling_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_bling_order_id ON public.me_shipments USING btree (bling_order_id);


--
-- Name: idx_me_shipments_external_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_external_order ON public.me_shipments USING btree (tenant_id, external_order_number);


--
-- Name: idx_me_shipments_external_order_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_external_order_number ON public.me_shipments USING btree (tenant_id, external_order_number);


--
-- Name: idx_me_shipments_integration_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_integration_id ON public.me_shipments USING btree (integration_id);


--
-- Name: idx_me_shipments_li_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_li_order_id ON public.me_shipments USING btree (li_order_id);


--
-- Name: idx_me_shipments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_order ON public.me_shipments USING btree (order_id);


--
-- Name: idx_me_shipments_order_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_order_number ON public.me_shipments USING btree (order_number);


--
-- Name: idx_me_shipments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_status ON public.me_shipments USING btree (status);


--
-- Name: idx_me_shipments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_tenant ON public.me_shipments USING btree (tenant_id);


--
-- Name: idx_me_shipments_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_me_shipments_tracking ON public.me_shipments USING btree (tracking_code);


--
-- Name: idx_message_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_queue_pending ON public.message_queue USING btree (status, next_retry_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_message_queue_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_message_queue_tenant ON public.message_queue USING btree (tenant_id, created_at DESC);


--
-- Name: idx_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation ON public.messages USING btree (conversation_id);


--
-- Name: idx_messages_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_direction ON public.messages USING btree (direction);


--
-- Name: idx_messages_provider_message_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_messages_provider_message_id_unique ON public.messages USING btree (provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: idx_messages_provider_msg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_provider_msg ON public.messages USING btree (provider_message_id);


--
-- Name: idx_messages_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_tenant_created ON public.messages USING btree (tenant_id, created_at DESC);


--
-- Name: idx_messages_whatsapp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_whatsapp_id ON public.messages USING btree (((metadata ->> 'whatsapp_id'::text))) WHERE ((metadata ->> 'whatsapp_id'::text) IS NOT NULL);


--
-- Name: idx_nuvemshop_connections_store; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_connections_store ON public.nuvemshop_connections USING btree (store_id);


--
-- Name: idx_nuvemshop_connections_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_connections_tenant ON public.nuvemshop_connections USING btree (tenant_id);


--
-- Name: idx_nuvemshop_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_customers_email ON public.nuvemshop_customers USING btree (email);


--
-- Name: idx_nuvemshop_customers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_customers_tenant ON public.nuvemshop_customers USING btree (tenant_id);


--
-- Name: idx_nuvemshop_lgpd_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_lgpd_events_created ON public.nuvemshop_lgpd_events USING btree (created_at);


--
-- Name: idx_nuvemshop_lgpd_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_lgpd_events_type ON public.nuvemshop_lgpd_events USING btree (event_type);


--
-- Name: idx_nuvemshop_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_order_items_order ON public.nuvemshop_order_items USING btree (order_id);


--
-- Name: idx_nuvemshop_order_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_order_items_tenant ON public.nuvemshop_order_items USING btree (tenant_id);


--
-- Name: idx_nuvemshop_orders_created_remote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_orders_created_remote ON public.nuvemshop_orders USING btree (created_at_remote);


--
-- Name: idx_nuvemshop_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_orders_customer ON public.nuvemshop_orders USING btree (customer_id);


--
-- Name: idx_nuvemshop_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_orders_status ON public.nuvemshop_orders USING btree (status);


--
-- Name: idx_nuvemshop_orders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_orders_tenant ON public.nuvemshop_orders USING btree (tenant_id);


--
-- Name: idx_nuvemshop_products_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_products_sku ON public.nuvemshop_products USING btree (sku);


--
-- Name: idx_nuvemshop_products_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_products_tenant ON public.nuvemshop_products USING btree (tenant_id);


--
-- Name: idx_nuvemshop_sync_state_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_sync_state_tenant ON public.nuvemshop_sync_state USING btree (tenant_id);


--
-- Name: idx_nuvemshop_sync_state_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_sync_state_updated ON public.nuvemshop_sync_state USING btree (updated_at);


--
-- Name: idx_nuvemshop_webhook_events_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_webhook_events_event ON public.nuvemshop_webhook_events USING btree (event);


--
-- Name: idx_nuvemshop_webhook_events_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_webhook_events_integration ON public.nuvemshop_webhook_events USING btree (integration_id);


--
-- Name: idx_nuvemshop_webhook_events_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nuvemshop_webhook_events_received ON public.nuvemshop_webhook_events USING btree (received_at);


--
-- Name: idx_oauth_states_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_oauth_states_expires_at ON public.oauth_states USING btree (expires_at);


--
-- Name: idx_order_notification_configs_integration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_notification_configs_integration ON public.order_notification_configs USING btree (integration_id);


--
-- Name: idx_order_notification_configs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_notification_configs_tenant ON public.order_notification_configs USING btree (tenant_id);


--
-- Name: idx_order_notification_executions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_notification_executions_created ON public.order_notification_executions USING btree (created_at DESC);


--
-- Name: idx_order_notification_executions_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_notification_executions_order ON public.order_notification_executions USING btree (order_id);


--
-- Name: idx_order_notification_executions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_notification_executions_tenant ON public.order_notification_executions USING btree (tenant_id);


--
-- Name: idx_order_notification_status_rules_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_notification_status_rules_config ON public.order_notification_status_rules USING btree (config_id);


--
-- Name: idx_order_notification_status_rules_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_notification_status_rules_status ON public.order_notification_status_rules USING btree (status_name);


--
-- Name: idx_outbound_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_queue_pending ON public.outbound_queue USING btree (status, next_retry_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: idx_outbound_queue_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_queue_tenant ON public.outbound_queue USING btree (tenant_id);


--
-- Name: idx_profiles_active_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_active_tenant ON public.profiles USING btree (active_tenant_id);


--
-- Name: idx_reactivation_configs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reactivation_configs_tenant_id ON public.reactivation_configs USING btree (tenant_id);


--
-- Name: idx_reactivation_cycle_steps_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reactivation_cycle_steps_config ON public.reactivation_cycle_steps USING btree (config_id, step_number);


--
-- Name: idx_reactivation_executions_config_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reactivation_executions_config_id ON public.reactivation_executions USING btree (config_id);


--
-- Name: idx_reactivation_executions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reactivation_executions_tenant_id ON public.reactivation_executions USING btree (tenant_id);


--
-- Name: idx_rfm_alerts_tenant_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_alerts_tenant_read ON public.rfm_alerts USING btree (tenant_id, is_read, created_at DESC);


--
-- Name: idx_rfm_audience_members_audience; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_audience_members_audience ON public.rfm_audience_members USING btree (audience_id);


--
-- Name: idx_rfm_audiences_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_audiences_tenant ON public.rfm_audiences USING btree (tenant_id, integration_id);


--
-- Name: idx_rfm_integration_customer_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_rfm_integration_customer_date ON public.customer_rfm_snapshots USING btree (integration_id, customer_id, reference_date);


--
-- Name: idx_rfm_predicted_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_predicted_date ON public.customer_rfm_snapshots USING btree (predicted_next_purchase_date) WHERE (predicted_next_purchase_date IS NOT NULL);


--
-- Name: idx_rfm_segment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_segment ON public.customer_rfm_snapshots USING btree (integration_id, segment_name);


--
-- Name: idx_rfm_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rfm_tenant ON public.customer_rfm_snapshots USING btree (tenant_id);


--
-- Name: idx_tags_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_tenant ON public.tags USING btree (tenant_id);


--
-- Name: idx_team_invites_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_invites_tenant ON public.team_invites USING btree (tenant_id);


--
-- Name: idx_team_invites_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_invites_token_hash ON public.team_invites USING btree (invite_token_hash) WHERE (invite_token_hash IS NOT NULL);


--
-- Name: idx_tenant_ai_credentials_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tenant_ai_credentials_one_default ON public.tenant_ai_credentials USING btree (tenant_id) WHERE (is_default = true);


--
-- Name: idx_webhook_events_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_webhook_events_idempotency ON public.webhook_events USING btree (provider, provider_message_id) WHERE (provider_message_id IS NOT NULL);


--
-- Name: idx_webhook_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_status ON public.webhook_events USING btree (processing_status);


--
-- Name: idx_webhook_events_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_tenant ON public.webhook_events USING btree (tenant_id);


--
-- Name: idx_whatsapp_channels_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_channels_tenant ON public.whatsapp_channels USING btree (tenant_id);


--
-- Name: uniq_chatbot_flow_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_chatbot_flow_sessions_active ON public.chatbot_flow_sessions USING btree (conversation_id) WHERE (is_active = true);


--
-- Name: tenants on_tenant_created_tokens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_tenant_created_tokens AFTER INSERT ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.handle_new_tenant_tokens();


--
-- Name: chatbot_flows trg_chatbot_flows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chatbot_flows_updated_at BEFORE UPDATE ON public.chatbot_flows FOR EACH ROW EXECUTE FUNCTION public.update_chatbot_flows_updated_at();


--
-- Name: email_events trg_email_event_campaign_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_email_event_campaign_stats AFTER INSERT ON public.email_events FOR EACH ROW EXECUTE FUNCTION public.update_campaign_stats_on_event();


--
-- Name: tenant_ai_credentials trg_encrypt_ai_credentials; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_encrypt_ai_credentials BEFORE INSERT OR UPDATE ON public.tenant_ai_credentials FOR EACH ROW EXECUTE FUNCTION public.encrypt_ai_credentials();


--
-- Name: bling_connections trg_encrypt_bling_tokens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_encrypt_bling_tokens BEFORE INSERT OR UPDATE ON public.bling_connections FOR EACH ROW EXECUTE FUNCTION public.encrypt_bling_tokens();


--
-- Name: email_integrations trg_encrypt_email_smtp_password; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_encrypt_email_smtp_password BEFORE INSERT OR UPDATE ON public.email_integrations FOR EACH ROW EXECUTE FUNCTION public.encrypt_email_smtp_password();


--
-- Name: melhor_envio_tokens trg_encrypt_melhor_envio_tokens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_encrypt_melhor_envio_tokens BEFORE INSERT OR UPDATE ON public.melhor_envio_tokens FOR EACH ROW EXECUTE FUNCTION public.encrypt_melhor_envio_tokens();


--
-- Name: nuvemshop_connections trg_encrypt_nuvemshop_tokens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_encrypt_nuvemshop_tokens BEFORE INSERT OR UPDATE ON public.nuvemshop_connections FOR EACH ROW EXECUTE FUNCTION public.encrypt_nuvemshop_tokens();


--
-- Name: messages trg_set_first_response_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_first_response_at AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.set_first_response_at();


--
-- Name: ai_agents update_ai_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_agents_updated_at BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_assistant_configs update_ai_assistant_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_assistant_configs_updated_at BEFORE UPDATE ON public.ai_assistant_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_provider_health update_ai_provider_health_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_provider_health_updated_at BEFORE UPDATE ON public.ai_provider_health FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: auto_messages update_auto_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_auto_messages_updated_at BEFORE UPDATE ON public.auto_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: birthday_configs update_birthday_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_birthday_configs_updated_at BEFORE UPDATE ON public.birthday_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bling_code_mappings update_bling_code_mappings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bling_code_mappings_updated_at BEFORE UPDATE ON public.bling_code_mappings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bling_connections update_bling_connections_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bling_connections_updated_at BEFORE UPDATE ON public.bling_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bling_customers update_bling_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bling_customers_updated_at BEFORE UPDATE ON public.bling_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bling_orders update_bling_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bling_orders_updated_at BEFORE UPDATE ON public.bling_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bling_products update_bling_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bling_products_updated_at BEFORE UPDATE ON public.bling_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bling_sync_jobs update_bling_sync_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bling_sync_jobs_updated_at BEFORE UPDATE ON public.bling_sync_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: bulk_campaigns update_bulk_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bulk_campaigns_updated_at BEFORE UPDATE ON public.bulk_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: business_hours update_business_hours_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON public.business_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cashback_reminders update_cashback_reminders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cashback_reminders_updated_at BEFORE UPDATE ON public.cashback_reminders FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();


--
-- Name: contacts update_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: conversations update_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_rfm_category_snapshots update_crfm_category_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_crfm_category_updated_at BEFORE UPDATE ON public.customer_rfm_category_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: crm_segments update_crm_segments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_crm_segments_updated_at BEFORE UPDATE ON public.crm_segments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_campaigns update_email_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON public.email_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_integrations update_email_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_integrations_updated_at BEFORE UPDATE ON public.email_integrations FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();


--
-- Name: email_suppression_list update_email_suppression_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_suppression_updated_at BEFORE UPDATE ON public.email_suppression_list FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: inboxes update_inboxes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_inboxes_updated_at BEFORE UPDATE ON public.inboxes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_channel_capabilities update_instagram_channel_capabilities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_channel_capabilities_updated_at BEFORE UPDATE ON public.instagram_channel_capabilities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_channels update_instagram_channels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_channels_updated_at BEFORE UPDATE ON public.instagram_channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_contacts update_instagram_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_contacts_updated_at BEFORE UPDATE ON public.instagram_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_flows update_instagram_flows_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_flows_updated_at BEFORE UPDATE ON public.instagram_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_messages update_instagram_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_messages_updated_at BEFORE UPDATE ON public.instagram_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_outbox update_instagram_outbox_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_outbox_updated_at BEFORE UPDATE ON public.instagram_outbox FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_threads update_instagram_threads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_threads_updated_at BEFORE UPDATE ON public.instagram_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_trigger_rules update_instagram_trigger_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_trigger_rules_updated_at BEFORE UPDATE ON public.instagram_trigger_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: integrations update_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_li_updated_at_column();


--
-- Name: kanban_columns update_kanban_columns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_kanban_columns_updated_at BEFORE UPDATE ON public.kanban_columns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: me_auto_sync_configs update_me_auto_sync_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_me_auto_sync_configs_updated_at BEFORE UPDATE ON public.me_auto_sync_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: me_shipments update_me_shipments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_me_shipments_updated_at BEFORE UPDATE ON public.me_shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: melhor_envio_tokens update_melhor_envio_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_melhor_envio_tokens_updated_at BEFORE UPDATE ON public.melhor_envio_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: message_queue update_message_queue_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_message_queue_updated_at BEFORE UPDATE ON public.message_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_settings update_notification_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notification_settings_updated_at BEFORE UPDATE ON public.notification_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: quick_replies update_quick_replies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_quick_replies_updated_at BEFORE UPDATE ON public.quick_replies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: receptionist_configs update_receptionist_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_receptionist_configs_updated_at BEFORE UPDATE ON public.receptionist_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: rfm_audiences update_rfm_audiences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rfm_audiences_updated_at BEFORE UPDATE ON public.rfm_audiences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_rfm_snapshots update_rfm_snapshots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_rfm_snapshots_updated_at BEFORE UPDATE ON public.customer_rfm_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: team_members update_team_members_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenant_ai_credentials update_tenant_ai_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenant_ai_credentials_updated_at BEFORE UPDATE ON public.tenant_ai_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenant_tokens update_tenant_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenant_tokens_updated_at BEFORE UPDATE ON public.tenant_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_channels update_whatsapp_channels_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_whatsapp_channels_updated_at BEFORE UPDATE ON public.whatsapp_channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_agent_column_assignments ai_agent_column_assignments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_column_assignments
    ADD CONSTRAINT ai_agent_column_assignments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE CASCADE;


--
-- Name: ai_agent_column_assignments ai_agent_column_assignments_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_column_assignments
    ADD CONSTRAINT ai_agent_column_assignments_column_id_fkey FOREIGN KEY (column_id) REFERENCES public.kanban_columns(id) ON DELETE CASCADE;


--
-- Name: ai_agent_column_assignments ai_agent_column_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_column_assignments
    ADD CONSTRAINT ai_agent_column_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: ai_agents ai_agents_after_verified_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_after_verified_column_id_fkey FOREIGN KEY (after_verified_column_id) REFERENCES public.kanban_columns(id);


--
-- Name: ai_agents ai_agents_cpf_max_attempts_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_cpf_max_attempts_column_id_fkey FOREIGN KEY (cpf_max_attempts_column_id) REFERENCES public.kanban_columns(id);


--
-- Name: ai_agents ai_agents_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_human_transfer_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_human_transfer_column_id_fkey FOREIGN KEY (human_transfer_column_id) REFERENCES public.kanban_columns(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_inactivity_target_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_inactivity_target_column_id_fkey FOREIGN KEY (inactivity_target_column_id) REFERENCES public.kanban_columns(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_order_not_found_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_order_not_found_column_id_fkey FOREIGN KEY (order_not_found_column_id) REFERENCES public.kanban_columns(id);


--
-- Name: ai_agents ai_agents_store_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_store_integration_id_fkey FOREIGN KEY (store_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: ai_assistant_configs ai_assistant_configs_default_ai_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_assistant_configs
    ADD CONSTRAINT ai_assistant_configs_default_ai_agent_id_fkey FOREIGN KEY (default_ai_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;


--
-- Name: ai_provider_health ai_provider_health_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_health
    ADD CONSTRAINT ai_provider_health_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: ai_usage_logs ai_usage_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;


--
-- Name: ai_usage_logs ai_usage_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: ai_usage_logs ai_usage_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: auto_messages auto_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auto_messages
    ADD CONSTRAINT auto_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: birthday_configs birthday_configs_email_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_configs
    ADD CONSTRAINT birthday_configs_email_integration_id_fkey FOREIGN KEY (email_integration_id) REFERENCES public.email_integrations(id) ON DELETE SET NULL;


--
-- Name: birthday_configs birthday_configs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_configs
    ADD CONSTRAINT birthday_configs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: birthday_configs birthday_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_configs
    ADD CONSTRAINT birthday_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: birthday_configs birthday_configs_whatsapp_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_configs
    ADD CONSTRAINT birthday_configs_whatsapp_integration_id_fkey FOREIGN KEY (whatsapp_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: birthday_executions birthday_executions_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_executions
    ADD CONSTRAINT birthday_executions_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.birthday_configs(id) ON DELETE SET NULL;


--
-- Name: birthday_executions birthday_executions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_executions
    ADD CONSTRAINT birthday_executions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_code_mappings bling_code_mappings_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_code_mappings
    ADD CONSTRAINT bling_code_mappings_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bling_code_mappings bling_code_mappings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_code_mappings
    ADD CONSTRAINT bling_code_mappings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_connections bling_connections_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_connections
    ADD CONSTRAINT bling_connections_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id);


--
-- Name: bling_connections bling_connections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_connections
    ADD CONSTRAINT bling_connections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_customers bling_customers_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_customers
    ADD CONSTRAINT bling_customers_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bling_customers bling_customers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_customers
    ADD CONSTRAINT bling_customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_order_items bling_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_order_items
    ADD CONSTRAINT bling_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.bling_orders(id) ON DELETE CASCADE;


--
-- Name: bling_order_items bling_order_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_order_items
    ADD CONSTRAINT bling_order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_orders bling_orders_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_orders
    ADD CONSTRAINT bling_orders_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bling_orders bling_orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_orders
    ADD CONSTRAINT bling_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_products bling_products_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_products
    ADD CONSTRAINT bling_products_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bling_products bling_products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_products
    ADD CONSTRAINT bling_products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_situacoes bling_situacoes_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_situacoes
    ADD CONSTRAINT bling_situacoes_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bling_situacoes bling_situacoes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_situacoes
    ADD CONSTRAINT bling_situacoes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_sync_jobs bling_sync_jobs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_sync_jobs
    ADD CONSTRAINT bling_sync_jobs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bling_sync_jobs bling_sync_jobs_sync_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_sync_jobs
    ADD CONSTRAINT bling_sync_jobs_sync_log_id_fkey FOREIGN KEY (sync_log_id) REFERENCES public.bling_sync_logs(id) ON DELETE CASCADE;


--
-- Name: bling_sync_jobs bling_sync_jobs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_sync_jobs
    ADD CONSTRAINT bling_sync_jobs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_sync_logs bling_sync_logs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_sync_logs
    ADD CONSTRAINT bling_sync_logs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: bling_sync_logs bling_sync_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_sync_logs
    ADD CONSTRAINT bling_sync_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bling_webhook_events bling_webhook_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bling_webhook_events
    ADD CONSTRAINT bling_webhook_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: bulk_campaigns bulk_campaigns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_campaigns
    ADD CONSTRAINT bulk_campaigns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: bulk_campaigns bulk_campaigns_whatsapp_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bulk_campaigns
    ADD CONSTRAINT bulk_campaigns_whatsapp_integration_id_fkey FOREIGN KEY (whatsapp_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: business_hours business_hours_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_hours
    ADD CONSTRAINT business_hours_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: campaign_contacts campaign_contacts_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.bulk_campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_contacts campaign_contacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_contacts
    ADD CONSTRAINT campaign_contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cashback_balances cashback_balances_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_balances
    ADD CONSTRAINT cashback_balances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cashback_configs cashback_configs_email_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_configs
    ADD CONSTRAINT cashback_configs_email_integration_id_fkey FOREIGN KEY (email_integration_id) REFERENCES public.email_integrations(id) ON DELETE SET NULL;


--
-- Name: cashback_configs cashback_configs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_configs
    ADD CONSTRAINT cashback_configs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: cashback_configs cashback_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_configs
    ADD CONSTRAINT cashback_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cashback_configs cashback_configs_whatsapp_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_configs
    ADD CONSTRAINT cashback_configs_whatsapp_integration_id_fkey FOREIGN KEY (whatsapp_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: cashback_executions cashback_executions_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_executions
    ADD CONSTRAINT cashback_executions_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.cashback_configs(id) ON DELETE SET NULL;


--
-- Name: cashback_executions cashback_executions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_executions
    ADD CONSTRAINT cashback_executions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.generated_coupons(id) ON DELETE SET NULL;


--
-- Name: cashback_executions cashback_executions_reminder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_executions
    ADD CONSTRAINT cashback_executions_reminder_id_fkey FOREIGN KEY (reminder_id) REFERENCES public.cashback_reminders(id) ON DELETE SET NULL;


--
-- Name: cashback_executions cashback_executions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_executions
    ADD CONSTRAINT cashback_executions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cashback_reminders cashback_reminders_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_reminders
    ADD CONSTRAINT cashback_reminders_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.cashback_configs(id) ON DELETE SET NULL;


--
-- Name: cashback_reminders cashback_reminders_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_reminders
    ADD CONSTRAINT cashback_reminders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.generated_coupons(id) ON DELETE CASCADE;


--
-- Name: cashback_reminders cashback_reminders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cashback_reminders
    ADD CONSTRAINT cashback_reminders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_edges chatbot_flow_edges_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_edges
    ADD CONSTRAINT chatbot_flow_edges_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_edges chatbot_flow_edges_source_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_edges
    ADD CONSTRAINT chatbot_flow_edges_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.chatbot_flow_nodes(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_edges chatbot_flow_edges_target_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_edges
    ADD CONSTRAINT chatbot_flow_edges_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.chatbot_flow_nodes(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_edges chatbot_flow_edges_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_edges
    ADD CONSTRAINT chatbot_flow_edges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_nodes chatbot_flow_nodes_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_nodes
    ADD CONSTRAINT chatbot_flow_nodes_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_nodes chatbot_flow_nodes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_nodes
    ADD CONSTRAINT chatbot_flow_nodes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_sessions chatbot_flow_sessions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_sessions
    ADD CONSTRAINT chatbot_flow_sessions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: chatbot_flow_sessions chatbot_flow_sessions_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flow_sessions
    ADD CONSTRAINT chatbot_flow_sessions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.chatbot_flows(id) ON DELETE CASCADE;


--
-- Name: chatbot_flows chatbot_flows_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_flows
    ADD CONSTRAINT chatbot_flows_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: churn_campaign_configs churn_campaign_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.churn_campaign_configs
    ADD CONSTRAINT churn_campaign_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: churn_campaign_configs churn_campaign_configs_whatsapp_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.churn_campaign_configs
    ADD CONSTRAINT churn_campaign_configs_whatsapp_integration_id_fkey FOREIGN KEY (whatsapp_integration_id) REFERENCES public.integrations(id);


--
-- Name: churn_campaign_triggers churn_campaign_triggers_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.churn_campaign_triggers
    ADD CONSTRAINT churn_campaign_triggers_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.churn_campaign_configs(id) ON DELETE CASCADE;


--
-- Name: circuit_breaker_state circuit_breaker_state_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.circuit_breaker_state
    ADD CONSTRAINT circuit_breaker_state_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_blocks contact_blocks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_blocks
    ADD CONSTRAINT contact_blocks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_custom_field_values contact_custom_field_values_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_field_values
    ADD CONSTRAINT contact_custom_field_values_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_custom_field_values contact_custom_field_values_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_field_values
    ADD CONSTRAINT contact_custom_field_values_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.contact_custom_fields(id) ON DELETE CASCADE;


--
-- Name: contact_custom_field_values contact_custom_field_values_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_field_values
    ADD CONSTRAINT contact_custom_field_values_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_custom_fields contact_custom_fields_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_custom_fields
    ADD CONSTRAINT contact_custom_fields_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_merges contact_merges_merged_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_merges
    ADD CONSTRAINT contact_merges_merged_contact_id_fkey FOREIGN KEY (merged_contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_merges contact_merges_primary_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_merges
    ADD CONSTRAINT contact_merges_primary_contact_id_fkey FOREIGN KEY (primary_contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_merges contact_merges_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_merges
    ADD CONSTRAINT contact_merges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_li_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_li_customer_id_fkey FOREIGN KEY (li_customer_id) REFERENCES public.li_customers(id) ON DELETE SET NULL;


--
-- Name: conversation_events conversation_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_events conversation_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_events
    ADD CONSTRAINT conversation_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: conversation_tags conversation_tags_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tags
    ADD CONSTRAINT conversation_tags_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_tags conversation_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_tags
    ADD CONSTRAINT conversation_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_current_ai_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_current_ai_agent_id_fkey FOREIGN KEY (current_ai_agent_id) REFERENCES public.ai_agents(id);


--
-- Name: conversations conversations_inbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_inbox_id_fkey FOREIGN KEY (inbox_id) REFERENCES public.inboxes(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_kanban_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_kanban_column_id_fkey FOREIGN KEY (kanban_column_id) REFERENCES public.kanban_columns(id) ON DELETE SET NULL;


--
-- Name: crm_segments crm_segments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_segments
    ADD CONSTRAINT crm_segments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: customer_rfm_category_snapshots customer_rfm_category_snapshots_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_rfm_category_snapshots
    ADD CONSTRAINT customer_rfm_category_snapshots_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: customer_rfm_category_snapshots customer_rfm_category_snapshots_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_rfm_category_snapshots
    ADD CONSTRAINT customer_rfm_category_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: customer_rfm_snapshots customer_rfm_snapshots_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_rfm_snapshots
    ADD CONSTRAINT customer_rfm_snapshots_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: customer_rfm_snapshots customer_rfm_snapshots_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_rfm_snapshots
    ADD CONSTRAINT customer_rfm_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: customer_tags customer_tags_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.li_customers(id) ON DELETE CASCADE;


--
-- Name: customer_tags customer_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: customer_tags customer_tags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: dead_letter_queue dead_letter_queue_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dead_letter_queue
    ADD CONSTRAINT dead_letter_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_campaign_logs email_campaign_logs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_logs
    ADD CONSTRAINT email_campaign_logs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_campaign_logs email_campaign_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_logs
    ADD CONSTRAINT email_campaign_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_campaigns email_campaigns_email_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_email_integration_id_fkey FOREIGN KEY (email_integration_id) REFERENCES public.email_integrations(id);


--
-- Name: email_campaigns email_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL;


--
-- Name: email_campaigns email_campaigns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_events email_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_events email_events_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_log_id_fkey FOREIGN KEY (log_id) REFERENCES public.email_campaign_logs(id) ON DELETE SET NULL;


--
-- Name: email_events email_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_integration_senders email_integration_senders_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_integration_senders
    ADD CONSTRAINT email_integration_senders_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.email_integrations(id) ON DELETE CASCADE;


--
-- Name: email_integration_senders email_integration_senders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_integration_senders
    ADD CONSTRAINT email_integration_senders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_integrations email_integrations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_integrations
    ADD CONSTRAINT email_integrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_suppression_list email_suppression_list_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE SET NULL;


--
-- Name: email_suppression_list email_suppression_list_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_suppression_list
    ADD CONSTRAINT email_suppression_list_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: function_metrics function_metrics_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.function_metrics
    ADD CONSTRAINT function_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: generated_coupons generated_coupons_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_coupons
    ADD CONSTRAINT generated_coupons_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.cashback_configs(id) ON DELETE CASCADE;


--
-- Name: generated_coupons generated_coupons_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_coupons
    ADD CONSTRAINT generated_coupons_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: generated_coupons generated_coupons_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_coupons
    ADD CONSTRAINT generated_coupons_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: inbox_routing_rules inbox_routing_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inbox_routing_rules
    ADD CONSTRAINT inbox_routing_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: inboxes inboxes_ai_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inboxes
    ADD CONSTRAINT inboxes_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;


--
-- Name: inboxes inboxes_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inboxes
    ADD CONSTRAINT inboxes_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE;


--
-- Name: inboxes inboxes_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inboxes
    ADD CONSTRAINT inboxes_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: inboxes inboxes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inboxes
    ADD CONSTRAINT inboxes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_ad_welcome_flows instagram_ad_welcome_flows_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_ad_welcome_flows
    ADD CONSTRAINT instagram_ad_welcome_flows_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_ai_flow_drafts instagram_ai_flow_drafts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_ai_flow_drafts
    ADD CONSTRAINT instagram_ai_flow_drafts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_blocked_users instagram_blocked_users_blocked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_blocked_users
    ADD CONSTRAINT instagram_blocked_users_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES auth.users(id);


--
-- Name: instagram_blocked_users instagram_blocked_users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_blocked_users
    ADD CONSTRAINT instagram_blocked_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_channel_capabilities instagram_channel_capabilities_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channel_capabilities
    ADD CONSTRAINT instagram_channel_capabilities_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_channel_capabilities instagram_channel_capabilities_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channel_capabilities
    ADD CONSTRAINT instagram_channel_capabilities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_channel_insights instagram_channel_insights_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channel_insights
    ADD CONSTRAINT instagram_channel_insights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_channels instagram_channels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_channels
    ADD CONSTRAINT instagram_channels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_comment_queue instagram_comment_queue_moderated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comment_queue
    ADD CONSTRAINT instagram_comment_queue_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id);


--
-- Name: instagram_comment_queue instagram_comment_queue_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comment_queue
    ADD CONSTRAINT instagram_comment_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_comment_replies_log instagram_comment_replies_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comment_replies_log
    ADD CONSTRAINT instagram_comment_replies_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_contact_pauses instagram_contact_pauses_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_pauses
    ADD CONSTRAINT instagram_contact_pauses_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_contact_pauses instagram_contact_pauses_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_pauses
    ADD CONSTRAINT instagram_contact_pauses_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.instagram_contacts(id) ON DELETE CASCADE;


--
-- Name: instagram_contact_pauses instagram_contact_pauses_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_pauses
    ADD CONSTRAINT instagram_contact_pauses_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_contact_tags instagram_contact_tags_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_tags
    ADD CONSTRAINT instagram_contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.instagram_contacts(id) ON DELETE CASCADE;


--
-- Name: instagram_contact_tags instagram_contact_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_tags
    ADD CONSTRAINT instagram_contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.instagram_tags(id) ON DELETE CASCADE;


--
-- Name: instagram_contact_tags instagram_contact_tags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contact_tags
    ADD CONSTRAINT instagram_contact_tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_contacts instagram_contacts_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contacts
    ADD CONSTRAINT instagram_contacts_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_contacts instagram_contacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_contacts
    ADD CONSTRAINT instagram_contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_content instagram_content_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_content
    ADD CONSTRAINT instagram_content_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_content instagram_content_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_content
    ADD CONSTRAINT instagram_content_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: instagram_content instagram_content_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_content
    ADD CONSTRAINT instagram_content_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_cta_link_clicks instagram_cta_link_clicks_cta_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_cta_link_clicks
    ADD CONSTRAINT instagram_cta_link_clicks_cta_link_id_fkey FOREIGN KEY (cta_link_id) REFERENCES public.instagram_cta_links(id) ON DELETE CASCADE;


--
-- Name: instagram_cta_link_clicks instagram_cta_link_clicks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_cta_link_clicks
    ADD CONSTRAINT instagram_cta_link_clicks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_cta_links instagram_cta_links_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_cta_links
    ADD CONSTRAINT instagram_cta_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_data_collection_events instagram_data_collection_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_data_collection_events
    ADD CONSTRAINT instagram_data_collection_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_deep_links instagram_deep_links_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_deep_links
    ADD CONSTRAINT instagram_deep_links_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_event_log instagram_event_log_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_event_log
    ADD CONSTRAINT instagram_event_log_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE SET NULL;


--
-- Name: instagram_event_log instagram_event_log_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_event_log
    ADD CONSTRAINT instagram_event_log_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.instagram_contacts(id) ON DELETE SET NULL;


--
-- Name: instagram_event_log instagram_event_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_event_log
    ADD CONSTRAINT instagram_event_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_event_log instagram_event_log_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_event_log
    ADD CONSTRAINT instagram_event_log_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.instagram_threads(id) ON DELETE SET NULL;


--
-- Name: instagram_experimental_executions instagram_experimental_executions_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_experimental_executions
    ADD CONSTRAINT instagram_experimental_executions_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_experimental_executions instagram_experimental_executions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_experimental_executions
    ADD CONSTRAINT instagram_experimental_executions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_feature_flags instagram_feature_flags_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_feature_flags
    ADD CONSTRAINT instagram_feature_flags_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_feature_flags instagram_feature_flags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_feature_flags
    ADD CONSTRAINT instagram_feature_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_edges instagram_flow_edges_source_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_edges
    ADD CONSTRAINT instagram_flow_edges_source_node_id_fkey FOREIGN KEY (source_node_id) REFERENCES public.instagram_flow_nodes(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_edges instagram_flow_edges_target_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_edges
    ADD CONSTRAINT instagram_flow_edges_target_node_id_fkey FOREIGN KEY (target_node_id) REFERENCES public.instagram_flow_nodes(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_edges instagram_flow_edges_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_edges
    ADD CONSTRAINT instagram_flow_edges_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_edges instagram_flow_edges_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_edges
    ADD CONSTRAINT instagram_flow_edges_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_nodes instagram_flow_nodes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_nodes
    ADD CONSTRAINT instagram_flow_nodes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_nodes instagram_flow_nodes_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_nodes
    ADD CONSTRAINT instagram_flow_nodes_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.instagram_flow_versions(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_run_steps instagram_flow_run_steps_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_run_steps
    ADD CONSTRAINT instagram_flow_run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.instagram_flow_runs(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_run_steps instagram_flow_run_steps_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_run_steps
    ADD CONSTRAINT instagram_flow_run_steps_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_runs instagram_flow_runs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_runs
    ADD CONSTRAINT instagram_flow_runs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.instagram_contacts(id);


--
-- Name: instagram_flow_runs instagram_flow_runs_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_runs
    ADD CONSTRAINT instagram_flow_runs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.instagram_flows(id);


--
-- Name: instagram_flow_runs instagram_flow_runs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_runs
    ADD CONSTRAINT instagram_flow_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_runs instagram_flow_runs_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_runs
    ADD CONSTRAINT instagram_flow_runs_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.instagram_threads(id);


--
-- Name: instagram_flow_runs instagram_flow_runs_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_runs
    ADD CONSTRAINT instagram_flow_runs_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.instagram_flow_versions(id);


--
-- Name: instagram_flow_versions instagram_flow_versions_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_versions
    ADD CONSTRAINT instagram_flow_versions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.instagram_flows(id) ON DELETE CASCADE;


--
-- Name: instagram_flow_versions instagram_flow_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flow_versions
    ADD CONSTRAINT instagram_flow_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_flows instagram_flows_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flows
    ADD CONSTRAINT instagram_flows_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_flows instagram_flows_live_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flows
    ADD CONSTRAINT instagram_flows_live_version_id_fkey FOREIGN KEY (live_version_id) REFERENCES public.instagram_flow_versions(id);


--
-- Name: instagram_flows instagram_flows_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_flows
    ADD CONSTRAINT instagram_flows_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_follow_dm_configs instagram_follow_dm_configs_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_follow_dm_configs
    ADD CONSTRAINT instagram_follow_dm_configs_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_follow_dm_configs instagram_follow_dm_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_follow_dm_configs
    ADD CONSTRAINT instagram_follow_dm_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_ice_breakers instagram_ice_breakers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_ice_breakers
    ADD CONSTRAINT instagram_ice_breakers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_media_insights instagram_media_insights_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_media_insights
    ADD CONSTRAINT instagram_media_insights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_media_watchlist instagram_media_watchlist_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_media_watchlist
    ADD CONSTRAINT instagram_media_watchlist_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_messages instagram_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_messages
    ADD CONSTRAINT instagram_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_messages instagram_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_messages
    ADD CONSTRAINT instagram_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.instagram_threads(id) ON DELETE CASCADE;


--
-- Name: instagram_metrics_daily instagram_metrics_daily_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_metrics_daily
    ADD CONSTRAINT instagram_metrics_daily_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_outbox instagram_outbox_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_outbox
    ADD CONSTRAINT instagram_outbox_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_outbox instagram_outbox_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_outbox
    ADD CONSTRAINT instagram_outbox_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.instagram_contacts(id) ON DELETE SET NULL;


--
-- Name: instagram_outbox instagram_outbox_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_outbox
    ADD CONSTRAINT instagram_outbox_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_outbox instagram_outbox_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_outbox
    ADD CONSTRAINT instagram_outbox_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.instagram_threads(id) ON DELETE SET NULL;


--
-- Name: instagram_persistent_menu_items instagram_persistent_menu_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_persistent_menu_items
    ADD CONSTRAINT instagram_persistent_menu_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_quick_automation_installs instagram_quick_automation_installs_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_quick_automation_installs
    ADD CONSTRAINT instagram_quick_automation_installs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.instagram_quick_automation_templates(id);


--
-- Name: instagram_quick_automation_installs instagram_quick_automation_installs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_quick_automation_installs
    ADD CONSTRAINT instagram_quick_automation_installs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_share_dm_configs instagram_share_dm_configs_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_share_dm_configs
    ADD CONSTRAINT instagram_share_dm_configs_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_share_dm_configs instagram_share_dm_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_share_dm_configs
    ADD CONSTRAINT instagram_share_dm_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_tags instagram_tags_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_tags
    ADD CONSTRAINT instagram_tags_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_tags instagram_tags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_tags
    ADD CONSTRAINT instagram_tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_term_blacklist instagram_term_blacklist_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_term_blacklist
    ADD CONSTRAINT instagram_term_blacklist_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_threads instagram_threads_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_threads
    ADD CONSTRAINT instagram_threads_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE CASCADE;


--
-- Name: instagram_threads instagram_threads_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_threads
    ADD CONSTRAINT instagram_threads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.instagram_contacts(id) ON DELETE CASCADE;


--
-- Name: instagram_threads instagram_threads_spam_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_threads
    ADD CONSTRAINT instagram_threads_spam_marked_by_fkey FOREIGN KEY (spam_marked_by) REFERENCES auth.users(id);


--
-- Name: instagram_threads instagram_threads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_threads
    ADD CONSTRAINT instagram_threads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_trigger_rules instagram_trigger_rules_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_trigger_rules
    ADD CONSTRAINT instagram_trigger_rules_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.instagram_flows(id) ON DELETE CASCADE;


--
-- Name: instagram_trigger_rules instagram_trigger_rules_instagram_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_trigger_rules
    ADD CONSTRAINT instagram_trigger_rules_instagram_integration_id_fkey FOREIGN KEY (instagram_integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: instagram_trigger_rules instagram_trigger_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_trigger_rules
    ADD CONSTRAINT instagram_trigger_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: instagram_webhook_deliveries instagram_webhook_deliveries_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_webhook_deliveries
    ADD CONSTRAINT instagram_webhook_deliveries_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.instagram_channels(id) ON DELETE SET NULL;


--
-- Name: integrations integrations_store_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_store_integration_id_fkey FOREIGN KEY (store_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: integrations integrations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: leads leads_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: leads leads_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: leads leads_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: leads leads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: li_customers li_customers_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_customers
    ADD CONSTRAINT li_customers_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: li_customers li_customers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_customers
    ADD CONSTRAINT li_customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: li_order_items li_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_order_items
    ADD CONSTRAINT li_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.li_orders(id) ON DELETE CASCADE;


--
-- Name: li_order_items li_order_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_order_items
    ADD CONSTRAINT li_order_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: li_orders li_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_orders
    ADD CONSTRAINT li_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.li_customers(id) ON DELETE SET NULL;


--
-- Name: li_orders li_orders_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_orders
    ADD CONSTRAINT li_orders_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: li_orders li_orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_orders
    ADD CONSTRAINT li_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: li_products li_products_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_products
    ADD CONSTRAINT li_products_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: li_products li_products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_products
    ADD CONSTRAINT li_products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: li_sync_state li_sync_state_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_sync_state
    ADD CONSTRAINT li_sync_state_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: li_sync_state li_sync_state_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_sync_state
    ADD CONSTRAINT li_sync_state_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: li_webhook_events li_webhook_events_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_webhook_events
    ADD CONSTRAINT li_webhook_events_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: li_webhook_events li_webhook_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.li_webhook_events
    ADD CONSTRAINT li_webhook_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: loyalty_points loyalty_points_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_points
    ADD CONSTRAINT loyalty_points_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: loyalty_programs loyalty_programs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_programs
    ADD CONSTRAINT loyalty_programs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: loyalty_programs loyalty_programs_whatsapp_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loyalty_programs
    ADD CONSTRAINT loyalty_programs_whatsapp_integration_id_fkey FOREIGN KEY (whatsapp_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: me_auto_sync_configs me_auto_sync_configs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_auto_sync_configs
    ADD CONSTRAINT me_auto_sync_configs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: me_auto_sync_configs me_auto_sync_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_auto_sync_configs
    ADD CONSTRAINT me_auto_sync_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: me_shipments me_shipments_bling_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_shipments
    ADD CONSTRAINT me_shipments_bling_order_id_fkey FOREIGN KEY (bling_order_id) REFERENCES public.bling_orders(id) ON DELETE SET NULL;


--
-- Name: me_shipments me_shipments_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_shipments
    ADD CONSTRAINT me_shipments_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: me_shipments me_shipments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_shipments
    ADD CONSTRAINT me_shipments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: me_sync_jobs me_sync_jobs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.me_sync_jobs
    ADD CONSTRAINT me_sync_jobs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id);


--
-- Name: melhor_envio_tokens melhor_envio_tokens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.melhor_envio_tokens
    ADD CONSTRAINT melhor_envio_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: member_permissions member_permissions_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_permissions
    ADD CONSTRAINT member_permissions_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: notification_settings notification_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_settings
    ADD CONSTRAINT notification_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: nuvemshop_customers nuvemshop_customers_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_customers
    ADD CONSTRAINT nuvemshop_customers_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: nuvemshop_lgpd_events nuvemshop_lgpd_events_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_lgpd_events
    ADD CONSTRAINT nuvemshop_lgpd_events_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: nuvemshop_order_items nuvemshop_order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_order_items
    ADD CONSTRAINT nuvemshop_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.nuvemshop_orders(id) ON DELETE CASCADE;


--
-- Name: nuvemshop_orders nuvemshop_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_orders
    ADD CONSTRAINT nuvemshop_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.nuvemshop_customers(id) ON DELETE SET NULL;


--
-- Name: nuvemshop_orders nuvemshop_orders_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_orders
    ADD CONSTRAINT nuvemshop_orders_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: nuvemshop_products nuvemshop_products_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_products
    ADD CONSTRAINT nuvemshop_products_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: nuvemshop_sync_state nuvemshop_sync_state_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_sync_state
    ADD CONSTRAINT nuvemshop_sync_state_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: nuvemshop_webhook_events nuvemshop_webhook_events_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nuvemshop_webhook_events
    ADD CONSTRAINT nuvemshop_webhook_events_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: order_notification_configs order_notification_configs_email_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_configs
    ADD CONSTRAINT order_notification_configs_email_integration_id_fkey FOREIGN KEY (email_integration_id) REFERENCES public.email_integrations(id) ON DELETE SET NULL;


--
-- Name: order_notification_configs order_notification_configs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_configs
    ADD CONSTRAINT order_notification_configs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: order_notification_configs order_notification_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_configs
    ADD CONSTRAINT order_notification_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: order_notification_configs order_notification_configs_whatsapp_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_configs
    ADD CONSTRAINT order_notification_configs_whatsapp_integration_id_fkey FOREIGN KEY (whatsapp_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: order_notification_executions order_notification_executions_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_executions
    ADD CONSTRAINT order_notification_executions_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.order_notification_configs(id) ON DELETE SET NULL;


--
-- Name: order_notification_executions order_notification_executions_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_executions
    ADD CONSTRAINT order_notification_executions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.order_notification_status_rules(id) ON DELETE SET NULL;


--
-- Name: order_notification_executions order_notification_executions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_executions
    ADD CONSTRAINT order_notification_executions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: order_notification_status_rules order_notification_status_rules_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_status_rules
    ADD CONSTRAINT order_notification_status_rules_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.order_notification_configs(id) ON DELETE CASCADE;


--
-- Name: order_notification_status_rules order_notification_status_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_notification_status_rules
    ADD CONSTRAINT order_notification_status_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: outbound_queue outbound_queue_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_queue
    ADD CONSTRAINT outbound_queue_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.whatsapp_channels(id) ON DELETE CASCADE;


--
-- Name: outbound_queue outbound_queue_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_queue
    ADD CONSTRAINT outbound_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: outbound_queue outbound_queue_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbound_queue
    ADD CONSTRAINT outbound_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_active_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_active_tenant_id_fkey FOREIGN KEY (active_tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quick_replies quick_replies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_replies
    ADD CONSTRAINT quick_replies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reactivation_configs reactivation_configs_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_configs
    ADD CONSTRAINT reactivation_configs_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: reactivation_configs reactivation_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_configs
    ADD CONSTRAINT reactivation_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reactivation_configs reactivation_configs_whatsapp_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_configs
    ADD CONSTRAINT reactivation_configs_whatsapp_integration_id_fkey FOREIGN KEY (whatsapp_integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: reactivation_cycle_steps reactivation_cycle_steps_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_cycle_steps
    ADD CONSTRAINT reactivation_cycle_steps_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.reactivation_configs(id) ON DELETE CASCADE;


--
-- Name: reactivation_cycle_steps reactivation_cycle_steps_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_cycle_steps
    ADD CONSTRAINT reactivation_cycle_steps_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: reactivation_executions reactivation_executions_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_executions
    ADD CONSTRAINT reactivation_executions_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.reactivation_configs(id) ON DELETE SET NULL;


--
-- Name: reactivation_executions reactivation_executions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reactivation_executions
    ADD CONSTRAINT reactivation_executions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: receptionist_configs receptionist_configs_target_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptionist_configs
    ADD CONSTRAINT receptionist_configs_target_column_id_fkey FOREIGN KEY (target_column_id) REFERENCES public.kanban_columns(id) ON DELETE SET NULL;


--
-- Name: receptionist_configs receptionist_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receptionist_configs
    ADD CONSTRAINT receptionist_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: rfm_alerts rfm_alerts_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_alerts
    ADD CONSTRAINT rfm_alerts_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: rfm_alerts rfm_alerts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_alerts
    ADD CONSTRAINT rfm_alerts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: rfm_audience_members rfm_audience_members_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_audience_members
    ADD CONSTRAINT rfm_audience_members_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.rfm_audiences(id) ON DELETE CASCADE;


--
-- Name: rfm_audience_members rfm_audience_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_audience_members
    ADD CONSTRAINT rfm_audience_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: rfm_audiences rfm_audiences_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_audiences
    ADD CONSTRAINT rfm_audiences_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: rfm_audiences rfm_audiences_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfm_audiences
    ADD CONSTRAINT rfm_audiences_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tags tags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: team_invites team_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);


--
-- Name: team_invites team_invites_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invites
    ADD CONSTRAINT team_invites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tenant_ai_credentials tenant_ai_credentials_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_ai_credentials
    ADD CONSTRAINT tenant_ai_credentials_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_api_keys tenant_api_keys_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_api_keys
    ADD CONSTRAINT tenant_api_keys_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_tokens tenant_tokens_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_tokens
    ADD CONSTRAINT tenant_tokens_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.token_plans(id);


--
-- Name: tenant_tokens tenant_tokens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_tokens
    ADD CONSTRAINT tenant_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_webhooks tenant_webhooks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_webhooks
    ADD CONSTRAINT tenant_webhooks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_whitelabel tenant_whitelabel_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_whitelabel
    ADD CONSTRAINT tenant_whitelabel_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenants tenants_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: token_transactions token_transactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.token_transactions
    ADD CONSTRAINT token_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: webhook_events webhook_events_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.whatsapp_channels(id) ON DELETE SET NULL;


--
-- Name: webhook_events webhook_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: whatsapp_channels whatsapp_channels_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_channels
    ADD CONSTRAINT whatsapp_channels_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: whatsapp_channels whatsapp_channels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_channels
    ADD CONSTRAINT whatsapp_channels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: team_invites Admins can create invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create invites" ON public.team_invites FOR INSERT TO authenticated WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: team_invites Admins can delete invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete invites" ON public.team_invites FOR DELETE TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: team_members Admins can delete team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete team members" ON public.team_members FOR DELETE USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: member_permissions Admins can manage permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage permissions" ON public.member_permissions USING ((EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.id = member_permissions.team_member_id) AND public.is_tenant_admin(auth.uid(), tm.tenant_id)))));


--
-- Name: team_members Admins can manage team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage team members" ON public.team_members FOR INSERT WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: team_invites Admins can update invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update invites" ON public.team_invites FOR UPDATE TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: team_members Admins can update team members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update team members" ON public.team_members FOR UPDATE USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: team_invites Admins can view tenant invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view tenant invites" ON public.team_invites FOR SELECT TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: token_plans Anyone can view active token plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active token plans" ON public.token_plans FOR SELECT USING ((is_active = true));


--
-- Name: email_events Authenticated can insert email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can insert email events" ON public.email_events FOR INSERT TO authenticated WITH CHECK ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: tenants Owners can update their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can update their tenant" ON public.tenants FOR UPDATE USING ((owner_id = auth.uid()));


--
-- Name: order_notification_executions Service role can insert order_notification_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert order_notification_executions" ON public.order_notification_executions FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_event_log Service role full access on event log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on event log" ON public.instagram_event_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: instagram_webhook_deliveries Service role full access on webhook deliveries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access on webhook deliveries" ON public.instagram_webhook_deliveries TO service_role USING (true) WITH CHECK (true);


--
-- Name: me_auto_sync_configs Service role full access to ME auto-sync configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to ME auto-sync configs" ON public.me_auto_sync_configs USING ((auth.role() = 'service_role'::text));


--
-- Name: bling_situacoes Service role full access to bling_situacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access to bling_situacoes" ON public.bling_situacoes TO service_role USING (true) WITH CHECK (true);


--
-- Name: email_campaign_logs System can create logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can create logs" ON public.email_campaign_logs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: ai_assistant_configs Tenant admins can manage ai_assistant_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage ai_assistant_configs" ON public.ai_assistant_configs USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: bling_connections Tenant admins can manage bling_connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage bling_connections" ON public.bling_connections TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id)) WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: business_hours Tenant admins can manage business hours; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage business hours" ON public.business_hours USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: cashback_configs Tenant admins can manage cashback_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage cashback_configs" ON public.cashback_configs USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission, true)));


--
-- Name: cashback_executions Tenant admins can manage cashback_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage cashback_executions" ON public.cashback_executions USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission, true)));


--
-- Name: cashback_reminders Tenant admins can manage cashback_reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage cashback_reminders" ON public.cashback_reminders USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission, true)));


--
-- Name: whatsapp_channels Tenant admins can manage channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage channels" ON public.whatsapp_channels USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: contacts Tenant admins can manage contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage contacts" ON public.contacts TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id))) WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: email_integrations Tenant admins can manage email_integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage email_integrations" ON public.email_integrations TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'integrations'::public.module_permission, true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'integrations'::public.module_permission, true)));


--
-- Name: generated_coupons Tenant admins can manage generated_coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage generated_coupons" ON public.generated_coupons TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'coupons'::public.module_permission, true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'coupons'::public.module_permission, true)));


--
-- Name: inboxes Tenant admins can manage inboxes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage inboxes" ON public.inboxes USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: instagram_channel_capabilities Tenant admins can manage instagram capabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage instagram capabilities" ON public.instagram_channel_capabilities USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id))) WITH CHECK (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: instagram_channels Tenant admins can manage instagram channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage instagram channels" ON public.instagram_channels USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id))) WITH CHECK (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: integrations Tenant admins can manage integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage integrations" ON public.integrations TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'integrations'::public.module_permission, true))) WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'integrations'::public.module_permission, true)));


--
-- Name: kanban_columns Tenant admins can manage kanban_columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage kanban_columns" ON public.kanban_columns USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: me_shipments Tenant admins can manage me_shipments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage me_shipments" ON public.me_shipments USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'sales'::public.module_permission, true)));


--
-- Name: melhor_envio_tokens Tenant admins can manage melhor_envio_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage melhor_envio_tokens" ON public.melhor_envio_tokens USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: message_queue Tenant admins can manage message queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage message queue" ON public.message_queue TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id))) WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: order_notification_configs Tenant admins can manage order_notification_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage order_notification_configs" ON public.order_notification_configs USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission, true)));


--
-- Name: order_notification_executions Tenant admins can manage order_notification_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage order_notification_executions" ON public.order_notification_executions USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission, true)));


--
-- Name: order_notification_status_rules Tenant admins can manage order_notification_status_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage order_notification_status_rules" ON public.order_notification_status_rules USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission, true)));


--
-- Name: tenant_tokens Tenant admins can manage token balance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage token balance" ON public.tenant_tokens USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: token_transactions Tenant admins can manage token transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can manage token transactions" ON public.token_transactions USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: whatsapp_channels Tenant admins can view channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can view channels" ON public.whatsapp_channels FOR SELECT TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: circuit_breaker_state Tenant admins can view circuit breaker state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can view circuit breaker state" ON public.circuit_breaker_state FOR SELECT TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: dead_letter_queue Tenant admins can view dead letters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can view dead letters" ON public.dead_letter_queue FOR SELECT TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: function_metrics Tenant admins can view function metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant admins can view function metrics" ON public.function_metrics FOR SELECT TO authenticated USING (((tenant_id IS NULL) OR public.is_tenant_admin(auth.uid(), tenant_id)));


--
-- Name: cashback_configs Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.cashback_configs TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: contact_custom_field_values Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.contact_custom_field_values TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: contact_custom_fields Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.contact_custom_fields TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: contact_merges Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.contact_merges TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: crm_segments Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.crm_segments TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_campaign_logs Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.email_campaign_logs TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_campaigns Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.email_campaigns TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_events Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.email_events TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_suppression_list Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.email_suppression_list TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_templates Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.email_templates TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: generated_coupons Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.generated_coupons TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: inbox_routing_rules Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.inbox_routing_rules TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: tenant_api_keys Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.tenant_api_keys TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: tenant_webhooks Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.tenant_webhooks TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: tenant_whitelabel Tenant isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation" ON public.tenant_whitelabel TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_integration_senders Tenant isolation for email_integration_senders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation for email_integration_senders" ON public.email_integration_senders TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: reactivation_configs Tenant isolation for reactivation_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation for reactivation_configs" ON public.reactivation_configs TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: reactivation_executions Tenant isolation for reactivation_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation for reactivation_executions" ON public.reactivation_executions TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_blocked_users Tenant isolation on instagram_blocked_users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation on instagram_blocked_users" ON public.instagram_blocked_users USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_channel_insights Tenant isolation on instagram_channel_insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation on instagram_channel_insights" ON public.instagram_channel_insights USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_comment_queue Tenant isolation on instagram_comment_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation on instagram_comment_queue" ON public.instagram_comment_queue USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_content Tenant isolation on instagram_content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation on instagram_content" ON public.instagram_content USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_media_insights Tenant isolation on instagram_media_insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation on instagram_media_insights" ON public.instagram_media_insights USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_metrics_daily Tenant isolation on instagram_metrics_daily; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation on instagram_metrics_daily" ON public.instagram_metrics_daily USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_term_blacklist Tenant isolation on instagram_term_blacklist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant isolation on instagram_term_blacklist" ON public.instagram_term_blacklist USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: notification_settings Tenant members can create notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can create notification settings" ON public.notification_settings FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: customer_rfm_category_snapshots Tenant members can delete category RFM snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can delete category RFM snapshots" ON public.customer_rfm_category_snapshots FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: reactivation_cycle_steps Tenant members can delete cycle steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can delete cycle steps" ON public.reactivation_cycle_steps FOR DELETE TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: customer_rfm_category_snapshots Tenant members can insert category RFM snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can insert category RFM snapshots" ON public.customer_rfm_category_snapshots FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: reactivation_cycle_steps Tenant members can insert cycle steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can insert cycle steps" ON public.reactivation_cycle_steps FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_outbox Tenant members can insert into instagram outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can insert into instagram outbox" ON public.instagram_outbox FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: contact_blocks Tenant members can manage blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage blocks" ON public.contact_blocks USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: conversation_events Tenant members can manage conversation events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage conversation events" ON public.conversation_events USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: conversation_tags Tenant members can manage conversation tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage conversation tags" ON public.conversation_tags USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = conversation_tags.conversation_id) AND (c.tenant_id = public.get_user_tenant_id(auth.uid()))))));


--
-- Name: conversations Tenant members can manage conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage conversations" ON public.conversations USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_contacts Tenant members can manage instagram contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage instagram contacts" ON public.instagram_contacts USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_messages Tenant members can manage instagram messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage instagram messages" ON public.instagram_messages USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_threads Tenant members can manage instagram threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage instagram threads" ON public.instagram_threads USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: messages Tenant members can manage messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage messages" ON public.messages USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())))) WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: tags Tenant members can manage tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage tags" ON public.tags USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: leads Tenant members can manage their leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can manage their leads" ON public.leads TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())))) WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: reactivation_cycle_steps Tenant members can update cycle steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can update cycle steps" ON public.reactivation_cycle_steps FOR UPDATE TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: notification_settings Tenant members can update notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can update notification settings" ON public.notification_settings FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: ai_assistant_configs Tenant members can view ai_assistant_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view ai_assistant_configs" ON public.ai_assistant_configs FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: contact_blocks Tenant members can view blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view blocks" ON public.contact_blocks FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: cashback_configs Tenant members can view cashback_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view cashback_configs" ON public.cashback_configs FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission)));


--
-- Name: cashback_executions Tenant members can view cashback_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view cashback_executions" ON public.cashback_executions FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission)));


--
-- Name: cashback_reminders Tenant members can view cashback_reminders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view cashback_reminders" ON public.cashback_reminders FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission)));


--
-- Name: customer_rfm_category_snapshots Tenant members can view category RFM snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view category RFM snapshots" ON public.customer_rfm_category_snapshots FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: contacts Tenant members can view contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view contacts" ON public.contacts FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: conversation_tags Tenant members can view conversation tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view conversation tags" ON public.conversation_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = conversation_tags.conversation_id) AND (c.tenant_id = public.get_user_tenant_id(auth.uid()))))));


--
-- Name: conversations Tenant members can view conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view conversations" ON public.conversations FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: reactivation_cycle_steps Tenant members can view cycle steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view cycle steps" ON public.reactivation_cycle_steps FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: generated_coupons Tenant members can view generated_coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view generated_coupons" ON public.generated_coupons FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'coupons'::public.module_permission)));


--
-- Name: instagram_channel_capabilities Tenant members can view instagram capabilities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view instagram capabilities" ON public.instagram_channel_capabilities FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_channels Tenant members can view instagram channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view instagram channels" ON public.instagram_channels FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_contacts Tenant members can view instagram contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view instagram contacts" ON public.instagram_contacts FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_messages Tenant members can view instagram messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view instagram messages" ON public.instagram_messages FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_outbox Tenant members can view instagram outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view instagram outbox" ON public.instagram_outbox FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_threads Tenant members can view instagram threads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view instagram threads" ON public.instagram_threads FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: integrations Tenant members can view integrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view integrations" ON public.integrations FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'integrations'::public.module_permission)));


--
-- Name: kanban_columns Tenant members can view kanban_columns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view kanban_columns" ON public.kanban_columns FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: me_shipments Tenant members can view me_shipments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view me_shipments" ON public.me_shipments FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'sales'::public.module_permission)));


--
-- Name: messages Tenant members can view messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view messages" ON public.messages FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: notification_settings Tenant members can view notification settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view notification settings" ON public.notification_settings FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: order_notification_configs Tenant members can view order_notification_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view order_notification_configs" ON public.order_notification_configs FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission)));


--
-- Name: order_notification_executions Tenant members can view order_notification_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view order_notification_executions" ON public.order_notification_executions FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission)));


--
-- Name: order_notification_status_rules Tenant members can view order_notification_status_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view order_notification_status_rules" ON public.order_notification_status_rules FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND public.has_module_permission(auth.uid(), 'automations'::public.module_permission)));


--
-- Name: outbound_queue Tenant members can view outbound queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view outbound queue" ON public.outbound_queue FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: member_permissions Tenant members can view permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view permissions" ON public.member_permissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.team_members tm
  WHERE ((tm.id = member_permissions.team_member_id) AND (tm.tenant_id = public.get_user_tenant_id(auth.uid()))))));


--
-- Name: tags Tenant members can view tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view tags" ON public.tags FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: team_members Tenant members can view team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view team" ON public.team_members FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: inboxes Tenant members can view their inboxes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view their inboxes" ON public.inboxes FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: message_queue Tenant members can view their message queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view their message queue" ON public.message_queue FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: tenant_tokens Tenant members can view their token balance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view their token balance" ON public.tenant_tokens FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: token_transactions Tenant members can view their token transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view their token transactions" ON public.token_transactions FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: webhook_events Tenant members can view webhook events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant members can view webhook events" ON public.webhook_events FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: ai_agent_column_assignments Tenant users can create agent assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant users can create agent assignments" ON public.ai_agent_column_assignments FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: ai_agent_column_assignments Tenant users can delete agent assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant users can delete agent assignments" ON public.ai_agent_column_assignments FOR DELETE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: instagram_event_log Tenant users can read own event logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant users can read own event logs" ON public.instagram_event_log FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: ai_agent_column_assignments Tenant users can update agent assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant users can update agent assignments" ON public.ai_agent_column_assignments FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: ai_agent_column_assignments Tenant users can view agent assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant users can view agent assignments" ON public.ai_agent_column_assignments FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: tenant_ai_credentials Tenants can delete their own AI credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenants can delete their own AI credentials" ON public.tenant_ai_credentials FOR DELETE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: tenant_ai_credentials Tenants can insert their own AI credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenants can insert their own AI credentials" ON public.tenant_ai_credentials FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: ai_usage_logs Tenants can insert their own AI usage logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenants can insert their own AI usage logs" ON public.ai_usage_logs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: tenant_ai_credentials Tenants can update their own AI credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenants can update their own AI credentials" ON public.tenant_ai_credentials FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: cashback_balances Tenants can view their cashback balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenants can view their cashback balances" ON public.cashback_balances FOR SELECT USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: ai_usage_logs Tenants can view their own AI usage logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenants can view their own AI usage logs" ON public.ai_usage_logs FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: ai_provider_health Tenants can view their own provider health; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenants can view their own provider health" ON public.ai_provider_health FOR SELECT USING (((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))) OR (tenant_id IN ( SELECT tenants.id
   FROM public.tenants
  WHERE (tenants.owner_id = auth.uid())))));


--
-- Name: ai_agents Users can create AI agents for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create AI agents for their tenant" ON public.ai_agents FOR INSERT WITH CHECK ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: ai_agents Users can create ai_agents for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create ai_agents for their tenant" ON public.ai_agents FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: campaign_contacts Users can create campaign contacts for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create campaign contacts for their tenant" ON public.campaign_contacts FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bulk_campaigns Users can create campaigns for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create campaigns for their tenant" ON public.bulk_campaigns FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_campaigns Users can create campaigns in their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create campaigns in their tenant" ON public.email_campaigns FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_templates Users can create templates in their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create templates in their tenant" ON public.email_templates FOR INSERT WITH CHECK (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (is_system = false)));


--
-- Name: tenants Users can create their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their tenant" ON public.tenants FOR INSERT WITH CHECK ((owner_id = auth.uid()));


--
-- Name: email_campaigns Users can delete campaigns in their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete campaigns in their tenant" ON public.email_campaigns FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: me_auto_sync_configs Users can delete own ME auto-sync configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own ME auto-sync configs" ON public.me_auto_sync_configs FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: customer_rfm_snapshots Users can delete own tenant RFM data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tenant RFM data" ON public.customer_rfm_snapshots FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: crm_segments Users can delete own tenant segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tenant segments" ON public.crm_segments FOR DELETE USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: email_suppression_list Users can delete own tenant suppression; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tenant suppression" ON public.email_suppression_list FOR DELETE USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: ai_agents Users can delete their tenant ai_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant ai_agents" ON public.ai_agents FOR DELETE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: auto_messages Users can delete their tenant auto messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant auto messages" ON public.auto_messages FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: birthday_configs Users can delete their tenant birthday configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant birthday configs" ON public.birthday_configs FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_customers Users can delete their tenant bling_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant bling_customers" ON public.bling_customers FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_order_items Users can delete their tenant bling_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant bling_order_items" ON public.bling_order_items FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_orders Users can delete their tenant bling_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant bling_orders" ON public.bling_orders FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_products Users can delete their tenant bling_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant bling_products" ON public.bling_products FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: campaign_contacts Users can delete their tenant campaign contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant campaign contacts" ON public.campaign_contacts FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bulk_campaigns Users can delete their tenant campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant campaigns" ON public.bulk_campaigns FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: quick_replies Users can delete their tenant quick replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant quick replies" ON public.quick_replies FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: receptionist_configs Users can delete their tenant receptionist config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant receptionist config" ON public.receptionist_configs FOR DELETE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: rfm_audiences Users can delete their tenant rfm_audiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant rfm_audiences" ON public.rfm_audiences FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_templates Users can delete their tenant templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant templates" ON public.email_templates FOR DELETE USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (is_system = false)));


--
-- Name: ai_agents Users can delete their tenant's AI agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant's AI agents" ON public.ai_agents FOR DELETE USING ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: bling_connections Users can delete their tenant's bling connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their tenant's bling connections" ON public.bling_connections FOR DELETE USING ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: auto_messages Users can insert auto messages for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert auto messages for their tenant" ON public.auto_messages FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: birthday_executions Users can insert birthday executions for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert birthday executions for their tenant" ON public.birthday_executions FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: me_sync_jobs Users can insert me_sync_jobs for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert me_sync_jobs for their tenant" ON public.me_sync_jobs FOR INSERT WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: me_auto_sync_configs Users can insert own ME auto-sync configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own ME auto-sync configs" ON public.me_auto_sync_configs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: customer_rfm_snapshots Users can insert own tenant RFM data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tenant RFM data" ON public.customer_rfm_snapshots FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_events Users can insert own tenant events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tenant events" ON public.email_events FOR INSERT WITH CHECK ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: crm_segments Users can insert own tenant segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tenant segments" ON public.crm_segments FOR INSERT WITH CHECK ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: bling_situacoes Users can insert own tenant situacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tenant situacoes" ON public.bling_situacoes FOR INSERT WITH CHECK ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: email_suppression_list Users can insert own tenant suppression; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tenant suppression" ON public.email_suppression_list FOR INSERT WITH CHECK ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: quick_replies Users can insert quick replies for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert quick replies for their tenant" ON public.quick_replies FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: birthday_configs Users can insert their tenant birthday configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant birthday configs" ON public.birthday_configs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_customers Users can insert their tenant bling_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant bling_customers" ON public.bling_customers FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_order_items Users can insert their tenant bling_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant bling_order_items" ON public.bling_order_items FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_orders Users can insert their tenant bling_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant bling_orders" ON public.bling_orders FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_products Users can insert their tenant bling_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant bling_products" ON public.bling_products FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_sync_jobs Users can insert their tenant bling_sync_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant bling_sync_jobs" ON public.bling_sync_jobs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_sync_logs Users can insert their tenant bling_sync_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant bling_sync_logs" ON public.bling_sync_logs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: receptionist_configs Users can insert their tenant receptionist config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant receptionist config" ON public.receptionist_configs FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: rfm_audiences Users can insert their tenant rfm_audiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant rfm_audiences" ON public.rfm_audiences FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_connections Users can insert their tenant's bling connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their tenant's bling connections" ON public.bling_connections FOR INSERT WITH CHECK ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: oauth_states Users can manage their own oauth_states; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own oauth_states" ON public.oauth_states TO authenticated USING ((user_id = auth.uid()));


--
-- Name: me_sync_jobs Users can manage their tenant me_sync_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their tenant me_sync_jobs" ON public.me_sync_jobs TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: order_notification_configs Users can manage their tenant order_notification_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their tenant order_notification_configs" ON public.order_notification_configs TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: order_notification_status_rules Users can manage their tenant order_notification_status_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their tenant order_notification_status_rules" ON public.order_notification_status_rules TO authenticated USING ((config_id IN ( SELECT order_notification_configs.id
   FROM public.order_notification_configs
  WHERE (order_notification_configs.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: rfm_audience_members Users can manage their tenant rfm_audience_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their tenant rfm_audience_members" ON public.rfm_audience_members USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: crm_segments Users can manage their tenant segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their tenant segments" ON public.crm_segments USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: birthday_executions Users can update birthday executions for their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update birthday executions for their tenant" ON public.birthday_executions FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_campaigns Users can update campaigns in their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update campaigns in their tenant" ON public.email_campaigns FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: me_auto_sync_configs Users can update own ME auto-sync configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own ME auto-sync configs" ON public.me_auto_sync_configs FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: customer_rfm_snapshots Users can update own tenant RFM data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tenant RFM data" ON public.customer_rfm_snapshots FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: crm_segments Users can update own tenant segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tenant segments" ON public.crm_segments FOR UPDATE USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: bling_situacoes Users can update own tenant situacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tenant situacoes" ON public.bling_situacoes FOR UPDATE USING ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: email_suppression_list Users can update own tenant suppression; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tenant suppression" ON public.email_suppression_list FOR UPDATE USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: ai_agents Users can update their tenant ai_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant ai_agents" ON public.ai_agents FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: auto_messages Users can update their tenant auto messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant auto messages" ON public.auto_messages FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: birthday_configs Users can update their tenant birthday configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant birthday configs" ON public.birthday_configs FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_customers Users can update their tenant bling_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant bling_customers" ON public.bling_customers FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_order_items Users can update their tenant bling_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant bling_order_items" ON public.bling_order_items FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_orders Users can update their tenant bling_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant bling_orders" ON public.bling_orders FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_products Users can update their tenant bling_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant bling_products" ON public.bling_products FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_sync_jobs Users can update their tenant bling_sync_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant bling_sync_jobs" ON public.bling_sync_jobs FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_sync_logs Users can update their tenant bling_sync_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant bling_sync_logs" ON public.bling_sync_logs FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: campaign_contacts Users can update their tenant campaign contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant campaign contacts" ON public.campaign_contacts FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bulk_campaigns Users can update their tenant campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant campaigns" ON public.bulk_campaigns FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: me_sync_jobs Users can update their tenant me_sync_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant me_sync_jobs" ON public.me_sync_jobs FOR UPDATE USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: quick_replies Users can update their tenant quick replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant quick replies" ON public.quick_replies FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: receptionist_configs Users can update their tenant receptionist config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant receptionist config" ON public.receptionist_configs FOR UPDATE TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: rfm_alerts Users can update their tenant rfm_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant rfm_alerts" ON public.rfm_alerts FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: rfm_audiences Users can update their tenant rfm_audiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant rfm_audiences" ON public.rfm_audiences FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_templates Users can update their tenant templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant templates" ON public.email_templates FOR UPDATE USING (((tenant_id = public.get_user_tenant_id(auth.uid())) AND (is_system = false)));


--
-- Name: ai_agents Users can update their tenant's AI agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant's AI agents" ON public.ai_agents FOR UPDATE USING ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: bling_connections Users can update their tenant's bling connections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenant's bling connections" ON public.bling_connections FOR UPDATE USING ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: email_campaigns Users can view campaigns in their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view campaigns in their tenant" ON public.email_campaigns FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_campaign_logs Users can view logs in their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view logs in their tenant" ON public.email_campaign_logs FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: me_auto_sync_configs Users can view own ME auto-sync configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own ME auto-sync configs" ON public.me_auto_sync_configs FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: customer_rfm_snapshots Users can view own tenant RFM data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tenant RFM data" ON public.customer_rfm_snapshots FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_events Users can view own tenant events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tenant events" ON public.email_events FOR SELECT USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: crm_segments Users can view own tenant segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tenant segments" ON public.crm_segments FOR SELECT USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: bling_situacoes Users can view own tenant situacoes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tenant situacoes" ON public.bling_situacoes FOR SELECT USING ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: email_suppression_list Users can view own tenant suppression list; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tenant suppression list" ON public.email_suppression_list FOR SELECT USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: email_templates Users can view templates in their tenant or system templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view templates in their tenant or system templates" ON public.email_templates FOR SELECT USING (((tenant_id = public.get_user_tenant_id(auth.uid())) OR (is_system = true)));


--
-- Name: profiles Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tenants Users can view their tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant" ON public.tenants FOR SELECT USING (((owner_id = auth.uid()) OR (id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: ai_agents Users can view their tenant ai_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant ai_agents" ON public.ai_agents FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: auto_messages Users can view their tenant auto messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant auto messages" ON public.auto_messages FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: birthday_configs Users can view their tenant birthday configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant birthday configs" ON public.birthday_configs FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: birthday_executions Users can view their tenant birthday executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant birthday executions" ON public.birthday_executions FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_customers Users can view their tenant bling_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant bling_customers" ON public.bling_customers FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_order_items Users can view their tenant bling_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant bling_order_items" ON public.bling_order_items FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_orders Users can view their tenant bling_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant bling_orders" ON public.bling_orders FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_products Users can view their tenant bling_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant bling_products" ON public.bling_products FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_sync_jobs Users can view their tenant bling_sync_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant bling_sync_jobs" ON public.bling_sync_jobs FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_sync_logs Users can view their tenant bling_sync_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant bling_sync_logs" ON public.bling_sync_logs FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_webhook_events Users can view their tenant bling_webhook_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant bling_webhook_events" ON public.bling_webhook_events FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: campaign_contacts Users can view their tenant campaign contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant campaign contacts" ON public.campaign_contacts FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bulk_campaigns Users can view their tenant campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant campaigns" ON public.bulk_campaigns FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_events Users can view their tenant email events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant email events" ON public.email_events FOR SELECT USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: me_sync_jobs Users can view their tenant me_sync_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant me_sync_jobs" ON public.me_sync_jobs FOR SELECT USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: order_notification_configs Users can view their tenant order_notification_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant order_notification_configs" ON public.order_notification_configs FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: order_notification_executions Users can view their tenant order_notification_executions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant order_notification_executions" ON public.order_notification_executions FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: order_notification_status_rules Users can view their tenant order_notification_status_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant order_notification_status_rules" ON public.order_notification_status_rules FOR SELECT TO authenticated USING ((config_id IN ( SELECT order_notification_configs.id
   FROM public.order_notification_configs
  WHERE (order_notification_configs.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: quick_replies Users can view their tenant quick replies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant quick replies" ON public.quick_replies FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: receptionist_configs Users can view their tenant receptionist config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant receptionist config" ON public.receptionist_configs FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND (tenant_id = public.get_user_tenant_id(auth.uid()))));


--
-- Name: rfm_alerts Users can view their tenant rfm_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant rfm_alerts" ON public.rfm_alerts FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: rfm_audience_members Users can view their tenant rfm_audience_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant rfm_audience_members" ON public.rfm_audience_members FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: rfm_audiences Users can view their tenant rfm_audiences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant rfm_audiences" ON public.rfm_audiences FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: crm_segments Users can view their tenant segments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant segments" ON public.crm_segments FOR SELECT USING ((tenant_id IN ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: ai_agents Users can view their tenant's AI agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant's AI agents" ON public.ai_agents FOR SELECT USING ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: business_hours Users can view their tenant's business hours; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant's business hours" ON public.business_hours FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: tenant_ai_credentials admin_only_ai_credentials_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only_ai_credentials_select ON public.tenant_ai_credentials FOR SELECT TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: bling_connections admin_only_bling_connections_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only_bling_connections_select ON public.bling_connections FOR SELECT TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: email_integrations admin_only_email_integrations_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only_email_integrations_select ON public.email_integrations FOR SELECT TO authenticated USING (public.is_tenant_admin(auth.uid(), tenant_id));


--
-- Name: ai_agent_column_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_column_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_assistant_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_assistant_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_provider_health; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_quick_automation_templates anyone_can_read_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anyone_can_read_templates ON public.instagram_quick_automation_templates FOR SELECT USING (true);


--
-- Name: auto_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auto_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: birthday_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.birthday_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: birthday_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.birthday_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_code_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_code_mappings ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_code_mappings bling_code_mappings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bling_code_mappings_delete ON public.bling_code_mappings FOR DELETE TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_code_mappings bling_code_mappings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bling_code_mappings_insert ON public.bling_code_mappings FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_code_mappings bling_code_mappings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bling_code_mappings_select ON public.bling_code_mappings FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_code_mappings bling_code_mappings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bling_code_mappings_update ON public.bling_code_mappings FOR UPDATE TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: bling_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_products ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_situacoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_situacoes ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_sync_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_sync_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_sync_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_sync_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: bling_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bling_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: bulk_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bulk_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: business_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: cashback_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashback_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: cashback_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashback_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: cashback_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashback_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: cashback_reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cashback_reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_flow_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_flow_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_flow_edges chatbot_flow_edges_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_edges_all ON public.chatbot_flow_edges USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_edges chatbot_flow_edges_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_edges_del ON public.chatbot_flow_edges FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_edges chatbot_flow_edges_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_edges_ins ON public.chatbot_flow_edges FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_edges chatbot_flow_edges_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_edges_upd ON public.chatbot_flow_edges FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_flow_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_flow_nodes chatbot_flow_nodes_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_nodes_all ON public.chatbot_flow_nodes USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_nodes chatbot_flow_nodes_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_nodes_del ON public.chatbot_flow_nodes FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_nodes chatbot_flow_nodes_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_nodes_ins ON public.chatbot_flow_nodes FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_nodes chatbot_flow_nodes_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flow_nodes_upd ON public.chatbot_flow_nodes FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_flow_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: chatbot_flows chatbot_flows_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flows_all ON public.chatbot_flows USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flows chatbot_flows_del; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flows_del ON public.chatbot_flows FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flows chatbot_flows_ins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flows_ins ON public.chatbot_flows FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flows chatbot_flows_upd; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chatbot_flows_upd ON public.chatbot_flows FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: churn_campaign_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.churn_campaign_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: churn_campaign_triggers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.churn_campaign_triggers ENABLE ROW LEVEL SECURITY;

--
-- Name: churn_campaign_configs churn_configs_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY churn_configs_tenant ON public.churn_campaign_configs USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: churn_campaign_configs churn_configs_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY churn_configs_tenant_insert ON public.churn_campaign_configs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: churn_campaign_configs churn_configs_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY churn_configs_tenant_update ON public.churn_campaign_configs FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: churn_campaign_triggers churn_triggers_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY churn_triggers_tenant ON public.churn_campaign_triggers USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: circuit_breaker_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_custom_field_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_custom_field_values ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_custom_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_merges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_merges ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.crm_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_rfm_category_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_rfm_category_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_rfm_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_rfm_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_tags customer_tags_tenant_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_tags_tenant_all ON public.customer_tags TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: dead_letter_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaign_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

--
-- Name: email_integration_senders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_integration_senders ENABLE ROW LEVEL SECURITY;

--
-- Name: email_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: email_suppression_list; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_suppression_list ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribe_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_unsubscribe_tokens_tenant_insert ON public.email_unsubscribe_tokens FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_unsubscribe_tokens_tenant_select ON public.email_unsubscribe_tokens FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: email_unsubscribe_tokens email_unsubscribe_tokens_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_unsubscribe_tokens_tenant_update ON public.email_unsubscribe_tokens FOR UPDATE TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: function_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.function_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.generated_coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_routing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inbox_routing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: inboxes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_ad_welcome_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_ad_welcome_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_ai_flow_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_ai_flow_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_blocked_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_blocked_users ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_channel_capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_channel_capabilities ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_channel_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_channel_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_comment_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_comment_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_comment_replies_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_comment_replies_log ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_contact_pauses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_contact_pauses ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_contact_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_contact_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_content ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_cta_link_clicks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_cta_link_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_cta_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_cta_links ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_data_collection_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_data_collection_events ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_deep_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_deep_links ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_event_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_event_log ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_experimental_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_experimental_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_feature_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_flow_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_flow_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_flow_nodes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_flow_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_flow_run_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_flow_run_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_flow_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_flow_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_flow_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_flow_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_follow_dm_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_follow_dm_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_ice_breakers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_ice_breakers ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_media_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_media_insights ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_media_watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_media_watchlist ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_metrics_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_metrics_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_persistent_menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_persistent_menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_quick_automation_installs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_quick_automation_installs ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_quick_automation_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_quick_automation_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_share_dm_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_share_dm_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_term_blacklist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_term_blacklist ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_trigger_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_trigger_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_webhook_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_webhook_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: kanban_columns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: li_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.li_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: li_customers li_customers_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_customers_delete ON public.li_customers FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_customers li_customers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_customers_select ON public.li_customers FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.li_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: li_order_items li_order_items_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_order_items_delete ON public.li_order_items FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_order_items li_order_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_order_items_select ON public.li_order_items FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.li_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: li_orders li_orders_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_orders_delete ON public.li_orders FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_orders li_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_orders_select ON public.li_orders FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.li_products ENABLE ROW LEVEL SECURITY;

--
-- Name: li_products li_products_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_products_delete ON public.li_products FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_products li_products_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_products_select ON public.li_products FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.li_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: li_sync_state li_sync_state_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_sync_state_all ON public.li_sync_state USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_sync_state li_sync_state_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_sync_state_select ON public.li_sync_state FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: li_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.li_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: li_webhook_events li_webhook_events_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY li_webhook_events_select ON public.li_webhook_events FOR SELECT USING ((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.user_id = auth.uid()))));


--
-- Name: loyalty_points; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_points loyalty_points_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loyalty_points_tenant ON public.loyalty_points USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: loyalty_points loyalty_points_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loyalty_points_tenant_insert ON public.loyalty_points FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: loyalty_programs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;

--
-- Name: loyalty_programs loyalty_programs_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loyalty_programs_tenant ON public.loyalty_programs USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: loyalty_programs loyalty_programs_tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loyalty_programs_tenant_insert ON public.loyalty_programs FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: loyalty_programs loyalty_programs_tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY loyalty_programs_tenant_update ON public.loyalty_programs FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: me_auto_sync_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.me_auto_sync_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: me_shipments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.me_shipments ENABLE ROW LEVEL SECURITY;

--
-- Name: me_sync_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.me_sync_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: melhor_envio_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.melhor_envio_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: member_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: message_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_connections nuvemshop_connections_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_connections_tenant_isolation ON public.nuvemshop_connections TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: nuvemshop_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_customers nuvemshop_customers_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_customers_tenant_isolation ON public.nuvemshop_customers TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: nuvemshop_lgpd_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_lgpd_events ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_lgpd_events nuvemshop_lgpd_events_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_lgpd_events_tenant_isolation ON public.nuvemshop_lgpd_events TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: nuvemshop_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_order_items nuvemshop_order_items_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_order_items_tenant_isolation ON public.nuvemshop_order_items TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: nuvemshop_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_orders nuvemshop_orders_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_orders_tenant_isolation ON public.nuvemshop_orders TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: nuvemshop_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_products ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_products nuvemshop_products_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_products_tenant_isolation ON public.nuvemshop_products TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: nuvemshop_sync_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_sync_state ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_sync_state nuvemshop_sync_state_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_sync_state_tenant_isolation ON public.nuvemshop_sync_state TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: nuvemshop_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nuvemshop_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: nuvemshop_webhook_events nuvemshop_webhook_events_tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nuvemshop_webhook_events_tenant_isolation ON public.nuvemshop_webhook_events TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: oauth_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

--
-- Name: order_notification_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_notification_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: order_notification_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_notification_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: order_notification_status_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_notification_status_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: outbound_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbound_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: quick_replies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: reactivation_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reactivation_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: reactivation_cycle_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reactivation_cycle_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: reactivation_executions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reactivation_executions ENABLE ROW LEVEL SECURITY;

--
-- Name: receptionist_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receptionist_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: rfm_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfm_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: rfm_audience_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfm_audience_members ENABLE ROW LEVEL SECURITY;

--
-- Name: rfm_audiences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rfm_audiences ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_rfm_snapshots service_rfm_snapshots_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_rfm_snapshots_all ON public.customer_rfm_snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: instagram_contact_pauses service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_contact_pauses TO service_role USING (true);


--
-- Name: instagram_contact_tags service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_contact_tags TO service_role USING (true);


--
-- Name: instagram_flow_edges service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_flow_edges TO service_role USING (true);


--
-- Name: instagram_flow_nodes service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_flow_nodes TO service_role USING (true);


--
-- Name: instagram_flow_run_steps service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_flow_run_steps TO service_role USING (true);


--
-- Name: instagram_flow_runs service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_flow_runs TO service_role USING (true);


--
-- Name: instagram_flow_versions service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_flow_versions TO service_role USING (true);


--
-- Name: instagram_flows service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_flows TO service_role USING (true);


--
-- Name: instagram_tags service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_tags TO service_role USING (true);


--
-- Name: instagram_trigger_rules service_role_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all ON public.instagram_trigger_rules TO service_role USING (true);


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: team_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_ai_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_ai_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_ad_welcome_flows tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.instagram_ad_welcome_flows FOR DELETE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_deep_links tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.instagram_deep_links FOR DELETE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_media_watchlist tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.instagram_media_watchlist FOR DELETE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_share_dm_configs tenant_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete ON public.instagram_share_dm_configs FOR DELETE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_ad_welcome_flows tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.instagram_ad_welcome_flows FOR INSERT TO authenticated WITH CHECK ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_content tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.instagram_content FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_feature_flags tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.instagram_feature_flags FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_follow_dm_configs tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.instagram_follow_dm_configs FOR INSERT TO authenticated WITH CHECK ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_media_watchlist tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.instagram_media_watchlist FOR INSERT TO authenticated WITH CHECK ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_share_dm_configs tenant_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert ON public.instagram_share_dm_configs FOR INSERT TO authenticated WITH CHECK ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_ad_welcome_flows tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_ad_welcome_flows USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_comment_replies_log tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_comment_replies_log USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_contact_pauses tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_contact_pauses USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_contact_tags tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_contact_tags USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_deep_links tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_deep_links USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flow_edges tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_flow_edges USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flow_nodes tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_flow_nodes USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flow_run_steps tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_flow_run_steps USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flow_runs tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_flow_runs USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flow_versions tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_flow_versions USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flows tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_flows USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_ice_breakers tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_ice_breakers USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_media_watchlist tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_media_watchlist USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_persistent_menu_items tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_persistent_menu_items USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_tags tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_tags USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_trigger_rules tenant_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation ON public.instagram_trigger_rules USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_ai_flow_drafts tenant_isolation_ai_drafts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_ai_drafts ON public.instagram_ai_flow_drafts USING ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: instagram_cta_link_clicks tenant_isolation_cta_clicks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_cta_clicks ON public.instagram_cta_link_clicks USING ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: instagram_cta_links tenant_isolation_cta_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_cta_links ON public.instagram_cta_links USING ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: instagram_data_collection_events tenant_isolation_data_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_data_events ON public.instagram_data_collection_events USING ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: chatbot_flow_sessions tenant_isolation_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_delete ON public.chatbot_flow_sessions FOR DELETE USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_sessions tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.chatbot_flow_sessions FOR INSERT WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_quick_automation_installs tenant_isolation_installs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_installs ON public.instagram_quick_automation_installs USING ((tenant_id = ( SELECT public.get_user_tenant_id(auth.uid()) AS get_user_tenant_id)));


--
-- Name: chatbot_flow_sessions tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.chatbot_flow_sessions FOR SELECT USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: chatbot_flow_sessions tenant_isolation_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_update ON public.chatbot_flow_sessions FOR UPDATE USING ((tenant_id = public.get_user_tenant_id(auth.uid()))) WITH CHECK ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: customer_rfm_snapshots tenant_rfm_snapshots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_rfm_snapshots_select ON public.customer_rfm_snapshots FOR SELECT TO authenticated USING ((integration_id IN ( SELECT integrations.id
   FROM public.integrations
  WHERE (integrations.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_ad_welcome_flows tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_ad_welcome_flows FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_channel_capabilities tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_channel_capabilities FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_channels tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_channels FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_comment_queue tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_comment_queue FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_comment_replies_log tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_comment_replies_log FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_contacts tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_contacts FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_content tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_content FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_cta_link_clicks tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_cta_link_clicks FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_cta_links tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_cta_links FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_deep_links tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_deep_links FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_event_log tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_event_log FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_experimental_executions tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_experimental_executions FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_feature_flags tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_feature_flags FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flow_runs tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_flow_runs FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_flow_versions tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_flow_versions FOR SELECT TO authenticated USING ((flow_id IN ( SELECT instagram_flows.id
   FROM public.instagram_flows
  WHERE (instagram_flows.channel_id IN ( SELECT instagram_channels.id
           FROM public.instagram_channels
          WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))))));


--
-- Name: instagram_flows tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_flows FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_follow_dm_configs tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_follow_dm_configs FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_ice_breakers tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_ice_breakers FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_media_watchlist tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_media_watchlist FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_messages tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_messages FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_metrics_daily tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_metrics_daily FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_outbox tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_outbox FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_persistent_menu_items tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_persistent_menu_items FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_share_dm_configs tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_share_dm_configs FOR SELECT TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_threads tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.instagram_threads FOR SELECT TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: tenant_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_ad_welcome_flows tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.instagram_ad_welcome_flows FOR UPDATE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_content tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.instagram_content FOR UPDATE TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_feature_flags tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.instagram_feature_flags FOR UPDATE TO authenticated USING ((tenant_id = public.get_user_tenant_id(auth.uid())));


--
-- Name: instagram_follow_dm_configs tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.instagram_follow_dm_configs FOR UPDATE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_media_watchlist tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.instagram_media_watchlist FOR UPDATE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: instagram_share_dm_configs tenant_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update ON public.instagram_share_dm_configs FOR UPDATE TO authenticated USING ((channel_id IN ( SELECT instagram_channels.id
   FROM public.instagram_channels
  WHERE (instagram_channels.tenant_id = public.get_user_tenant_id(auth.uid())))));


--
-- Name: tenant_webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_whitelabel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_whitelabel ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: token_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: token_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.token_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Ct7uUxV05pnpvQtdkbxbp602a8CnyGOUb2lj6yZvNYyDFeq1NLhZI1gWx0ABRni

