-- Repara textos padrao e funcoes gravados com dupla codificacao (UTF-8 lido como cp1252),
-- provavelmente por aplicar migrations via psql no Windows sem PGCLIENTENCODING=UTF8.
-- Gerado a partir das definicoes reais do banco; so os trechos corrompidos mudam.
-- Aplicar com PGCLIENTENCODING=UTF8.

ALTER TABLE public.ai_agents ALTER COLUMN inactivity_message SET DEFAULT 'Por inatividade estamos finalizando a conversa. Fique à vontade para mandar uma nova mensagem quando precisar!'::text;
ALTER TABLE public.ai_agents ALTER COLUMN order_details_template SET DEFAULT '📦 *Pedido #{numero}*
📅 Data: {data_criacao}
👤 Cliente: {cliente_nome}
📊 Status: {situacao_nome}
💰 Total: R$ {valor_total}
🚚 Rastreio: {codigo_rastreio}

🛒 *Itens:*
{order_items}'::text;
ALTER TABLE public.ai_agents ALTER COLUMN order_verification_messages SET DEFAULT '{"ask_cpf": "Agora preciso dos *3 primeiros dígitos do CPF* cadastrado no pedido para confirmar sua identidade.", "ask_both": "Para consultar seu pedido, por favor informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado", "cpf_wrong": "❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_", "after_verified": "Posso ajudar com mais alguma coisa sobre este pedido?", "order_verified": "✅ *Pedido encontrado!*\n\n{order_details}", "order_not_found": "❌ Não encontrei o pedido *#{order_number}* em nosso sistema.\n\nPor favor, verifique o número e tente novamente.", "ask_order_number": "Por favor, informe o *número do pedido* para que eu possa consultar.", "cpf_max_attempts": "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um de nossos atendentes que poderá ajudá-lo."}'::jsonb;
ALTER TABLE public.ai_assistant_configs ALTER COLUMN auto_close_message SET DEFAULT 'Como não tivemos mais contato, estamos encerrando o seu atendimento. Caso precise de alguma ajuda, fique à vontade para entrar em contato novamente!'::text;
ALTER TABLE public.ai_assistant_configs ALTER COLUMN automation_auto_close_message SET DEFAULT 'Como não tivemos mais contato estamos encerrando o seu atendimento, caso precise de alguma ajuda fique a vontade para entrar em contato novamente.'::text;
ALTER TABLE public.ai_assistant_configs ALTER COLUMN inactivity_message SET DEFAULT 'Encerrando o atendimento por inatividade. Quando precisar, é só chamar novamente!'::text;
ALTER TABLE public.ai_assistant_configs ALTER COLUMN out_of_hours_message SET DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!'::text;
ALTER TABLE public.ai_assistant_configs ALTER COLUMN transfer_keywords SET DEFAULT ARRAY['atendente'::text, 'humano'::text, 'pessoa'::text, 'falar com alguém'::text];
ALTER TABLE public.ai_assistant_configs ALTER COLUMN welcome_message SET DEFAULT 'Olá! Sou o assistente virtual. Como posso ajudá-lo?'::text;
ALTER TABLE public.birthday_configs ALTER COLUMN email_subject SET DEFAULT 'Feliz Aniversário! 🎂'::text;
ALTER TABLE public.birthday_configs ALTER COLUMN message_template SET DEFAULT 'Olá {nome}! 🎂🎉 Feliz aniversário! Para comemorar, preparamos um cupom especial de {desconto}% de desconto para você! Use o código *{cupom}* e aproveite. Válido por {validade} dias!'::text;
ALTER TABLE public.cashback_configs ALTER COLUMN message_template SET DEFAULT 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.'::text;
ALTER TABLE public.cashback_configs ALTER COLUMN reminder_1_message SET DEFAULT 'Olá {{cliente_nome}}! ⏰ Seu cupom {{cupom}} de {{valor_cupom}} de desconto expira em {{dias_restantes}} dias! Não perca essa oportunidade. Válido até {{validade}}.'::text;
ALTER TABLE public.cashback_configs ALTER COLUMN reminder_2_message SET DEFAULT 'Olá {{cliente_nome}}! 🚨 Última chance! Seu cupom {{cupom}} expira em {{dias_restantes}} dias. Use agora e garanta {{valor_cupom}} de desconto!'::text;
ALTER TABLE public.order_notification_configs ALTER COLUMN name SET DEFAULT 'Notificação de Pedido'::text;
ALTER TABLE public.reactivation_configs ALTER COLUMN message_template SET DEFAULT 'Olá {nome}! Sentimos sua falta 💜 Aqui está um cupom de {desconto}% para sua próxima compra: {cupom}. Válido por {dias} dias!'::text;
ALTER TABLE public.reactivation_configs ALTER COLUMN name SET DEFAULT 'Reativação de Clientes'::text;
ALTER TABLE public.receptionist_configs ALTER COLUMN human_handoff_message SET DEFAULT 'Entendido! Vou transferir você para um de nossos atendentes. Aguarde um momento, por favor.'::text;
ALTER TABLE public.receptionist_configs ALTER COLUMN lead_capture_name_message SET DEFAULT 'Para um melhor atendimento, qual é o seu nome? 😊'::text;
ALTER TABLE public.receptionist_configs ALTER COLUMN lead_capture_phone_message SET DEFAULT 'Obrigado, {nome}! Agora me informe seu número de telefone com DDD:'::text;
ALTER TABLE public.receptionist_configs ALTER COLUMN list_button_text SET DEFAULT 'Ver opções'::text;
ALTER TABLE public.receptionist_configs ALTER COLUMN list_title SET DEFAULT 'Escolha uma opção'::text;
ALTER TABLE public.receptionist_configs ALTER COLUMN menu_trigger_keywords SET DEFAULT '["menu", "opções", "opcoes"]'::jsonb;
ALTER TABLE public.receptionist_configs ALTER COLUMN welcome_message SET DEFAULT 'Olá! 👋 Bem-vindo(a)! Como posso ajudá-lo(a) hoje?'::text;

CREATE OR REPLACE FUNCTION public.delete_account_data(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_ai_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.leave_team_memberships(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.mask_secret(_plaintext text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _plaintext IS NULL OR length(_plaintext) < 5 THEN '••••••••'
    ELSE '••••••••' || right(_plaintext, 4)
  END;
$function$;

