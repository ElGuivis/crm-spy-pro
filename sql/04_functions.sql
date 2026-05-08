-- =============================================================================
-- FUNÇÕES DO BANCO DE DADOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GET_USER_TENANT_ID - Obtém o tenant_id de um usuário
-- Prioriza active_tenant_id explícito, com fallback para owner e team_member
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
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

COMMENT ON FUNCTION public.get_user_tenant_id IS 'Retorna o tenant_id associado a um usuário, priorizando active_tenant_id';

-- -----------------------------------------------------------------------------
-- IS_TENANT_ADMIN - Verifica se usuário é admin do tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id AND owner_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE tenant_id = _tenant_id AND user_id = _user_id AND role IN ('owner', 'admin')
  );
$$;

COMMENT ON FUNCTION public.is_tenant_admin IS 'Verifica se o usuário é admin/owner do tenant';

-- -----------------------------------------------------------------------------
-- HAS_MODULE_PERMISSION - Verifica permissão em módulo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_module_permission(
  _user_id UUID, 
  _module module_permission, 
  _require_edit BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    EXISTS (SELECT 1 FROM public.tenants WHERE owner_id = _user_id)
    OR
    EXISTS (
      SELECT 1 FROM public.team_members 
      WHERE user_id = _user_id AND role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.member_permissions mp
      JOIN public.team_members tm ON tm.id = mp.team_member_id
      WHERE tm.user_id = _user_id 
        AND mp.permission = _module
        AND mp.can_view = true
        AND (NOT _require_edit OR mp.can_edit = true)
    );
$$;

COMMENT ON FUNCTION public.has_module_permission IS 'Verifica se usuário tem permissão em um módulo';

-- -----------------------------------------------------------------------------
-- HANDLE_NEW_USER - Trigger para novos usuários
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, company_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'company_name');
  
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
    INSERT INTO public.tenants (owner_id, name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'company_name', 'Minha Empresa'));
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS 'Cria perfil e tenant quando novo usuário é criado';

-- -----------------------------------------------------------------------------
-- HANDLE_NEW_TENANT_TOKENS - Inicializa tokens do tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_tenant_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.tenant_tokens (tenant_id, balance)
  VALUES (NEW.id, 100);
  
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, balance_after)
  VALUES (NEW.id, 100, 'credit', 'Crédito inicial de boas-vindas', 100);
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_tenant_tokens IS 'Inicializa tokens quando novo tenant é criado';

-- -----------------------------------------------------------------------------
-- GET_TENANT_TOKEN_BALANCE - Obtém saldo de tokens
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_token_balance(_tenant_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(balance, 0) FROM public.tenant_tokens WHERE tenant_id = _tenant_id;
$$;

COMMENT ON FUNCTION public.get_tenant_token_balance IS 'Retorna o saldo de tokens do tenant';

-- -----------------------------------------------------------------------------
-- HAS_ENOUGH_TOKENS - Verifica se tem tokens suficientes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_enough_tokens(_tenant_id UUID, _amount INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(balance, 0) >= _amount FROM public.tenant_tokens WHERE tenant_id = _tenant_id;
$$;

COMMENT ON FUNCTION public.has_enough_tokens IS 'Verifica se o tenant tem tokens suficientes';

-- -----------------------------------------------------------------------------
-- DEDUCT_TOKENS - Deduz tokens do saldo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_tokens(
  _tenant_id UUID, 
  _amount INTEGER, 
  _type TEXT, 
  _description TEXT DEFAULT NULL, 
  _reference_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _current_balance INTEGER;
  _new_balance INTEGER;
BEGIN
  SELECT balance INTO _current_balance
  FROM public.tenant_tokens
  WHERE tenant_id = _tenant_id
  FOR UPDATE;
  
  IF _current_balance IS NULL THEN
    RETURN false;
  END IF;
  
  IF _current_balance < _amount THEN
    RETURN false;
  END IF;
  
  _new_balance := _current_balance - _amount;
  
  UPDATE public.tenant_tokens
  SET balance = _new_balance, updated_at = now()
  WHERE tenant_id = _tenant_id;
  
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, reference_id, balance_after)
  VALUES (_tenant_id, -_amount, _type, _description, _reference_id, _new_balance);
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.deduct_tokens IS 'Deduz tokens do saldo do tenant';

-- -----------------------------------------------------------------------------
-- ADD_TOKENS - Adiciona tokens ao saldo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_tokens(
  _tenant_id UUID, 
  _amount INTEGER, 
  _type TEXT, 
  _description TEXT DEFAULT NULL, 
  _reference_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _current_balance INTEGER;
  _new_balance INTEGER;
BEGIN
  SELECT balance INTO _current_balance
  FROM public.tenant_tokens
  WHERE tenant_id = _tenant_id
  FOR UPDATE;
  
  IF _current_balance IS NULL THEN
    INSERT INTO public.tenant_tokens (tenant_id, balance)
    VALUES (_tenant_id, _amount);
    _new_balance := _amount;
  ELSE
    _new_balance := _current_balance + _amount;
    UPDATE public.tenant_tokens
    SET balance = _new_balance, updated_at = now()
    WHERE tenant_id = _tenant_id;
  END IF;
  
  INSERT INTO public.token_transactions (tenant_id, amount, type, description, reference_id, balance_after)
  VALUES (_tenant_id, _amount, _type, _description, _reference_id, _new_balance);
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.add_tokens IS 'Adiciona tokens ao saldo do tenant';

-- -----------------------------------------------------------------------------
-- UPDATE_UPDATED_AT_COLUMN - Atualiza coluna updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column IS 'Atualiza timestamp updated_at automaticamente';

-- -----------------------------------------------------------------------------
-- UPDATE_LI_UPDATED_AT_COLUMN - Atualiza coluna updated_at (LI)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_li_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_li_updated_at_column IS 'Atualiza timestamp updated_at para tabelas LI';

-- -----------------------------------------------------------------------------
-- MAP_EVOLUTION_STATUS - Mapeia status do Evolution API
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.map_evolution_status(status TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
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

COMMENT ON FUNCTION public.map_evolution_status IS 'Mapeia status do Evolution API para formato interno';

-- -----------------------------------------------------------------------------
-- ADD_MESSAGE_TO_BUFFER - Adiciona mensagem ao buffer de IA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_message_to_buffer(
  _conversation_id UUID, 
  _message_id TEXT, 
  _delay_seconds INTEGER DEFAULT 3
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

COMMENT ON FUNCTION public.add_message_to_buffer IS 'Adiciona mensagem ao buffer de IA da conversa';

-- -----------------------------------------------------------------------------
-- CLEAR_MESSAGE_BUFFER - Limpa buffer de mensagens de IA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_message_buffer(_conversation_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

COMMENT ON FUNCTION public.clear_message_buffer IS 'Limpa buffer de mensagens de IA da conversa';

-- -----------------------------------------------------------------------------
-- GET_CRON_JOB_STATUS - Status do cron job LI Reconciliation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
RETURNS TABLE(jobid BIGINT, schedule TEXT, active BOOLEAN, jobname TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'cron'
AS $$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'invoke-li-reconciliation-processor-every-3-min'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_cron_job_status IS 'Retorna status do cron job de reconciliação LI';

-- -----------------------------------------------------------------------------
-- GET_CRON_LAST_RUN - Última execução do cron LI Reconciliation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cron_last_run()
RETURNS TABLE(
  runid BIGINT, 
  job_pid INTEGER, 
  status TEXT, 
  start_time TIMESTAMP WITH TIME ZONE, 
  end_time TIMESTAMP WITH TIME ZONE, 
  return_message TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'cron'
AS $$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'invoke-li-reconciliation-processor-every-3-min'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_cron_last_run IS 'Retorna última execução do cron LI Reconciliation';

-- -----------------------------------------------------------------------------
-- GET_ME_CRON_JOB_STATUS - Status do cron job Melhor Envio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_me_cron_job_status()
RETURNS TABLE(jobid BIGINT, schedule TEXT, active BOOLEAN, jobname TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'cron'
AS $$
  SELECT jobid, schedule, active, jobname
  FROM cron.job
  WHERE jobname = 'melhor-envio-sync-hourly'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_me_cron_job_status IS 'Retorna status do cron job Melhor Envio';

-- -----------------------------------------------------------------------------
-- GET_ME_CRON_LAST_RUN - Última execução do cron Melhor Envio
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_me_cron_last_run()
RETURNS TABLE(
  runid BIGINT, 
  job_pid INTEGER, 
  status TEXT, 
  start_time TIMESTAMP WITH TIME ZONE, 
  end_time TIMESTAMP WITH TIME ZONE, 
  return_message TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public', 'cron'
AS $$
  SELECT jrd.runid, jrd.job_pid, jrd.status, jrd.start_time, jrd.end_time, jrd.return_message
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE j.jobname = 'melhor-envio-sync-hourly'
  ORDER BY jrd.start_time DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_me_cron_last_run IS 'Retorna última execução do cron Melhor Envio';

-- -----------------------------------------------------------------------------
-- GET_DASHBOARD_STATS - Estatísticas do Dashboard (função pesada)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  result jsonb;
  _start_this_month timestamptz := date_trunc('month', now());
  _start_last_month timestamptz := date_trunc('month', now() - interval '1 month');
  _end_last_month timestamptz := date_trunc('month', now());
  _30d_ago timestamptz := now() - interval '30 days';
  
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
  _msgs_sent bigint := 0;
  _msgs_received bigint := 0;
  _rfm_summary jsonb := '[]'::jsonb;
  _sales_by_day jsonb := '[]'::jsonb;
  _effective_statuses text[] := ARRAY['Pedido Entregue', 'Pedido Enviado', 'Pedido Pago'];
BEGIN
  -- LI Revenue this month
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

  -- RFM Summary
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

  -- Sales by day (last 30 days)
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

  -- Top products
  DECLARE
    _top_products jsonb := '[]'::jsonb;
  BEGIN
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

    result := jsonb_build_object(
      'total_revenue_this_month', _total_revenue_this_month,
      'total_orders_this_month', _total_orders_this_month,
      'revenue_change', _revenue_change,
      'avg_ticket', ROUND(_avg_ticket, 2),
      'msgs_sent_30d', _msgs_sent,
      'msgs_received_30d', _msgs_received,
      'rfm_summary', _rfm_summary,
      'sales_by_day', _sales_by_day,
      'top_products', _top_products
    );
  END;

  RETURN result;
END;
$function$;

COMMENT ON FUNCTION public.get_dashboard_stats IS 'Retorna estatísticas consolidadas do dashboard';

-- -----------------------------------------------------------------------------
-- LINK_ME_SHIPMENTS_TO_ORDERS - Vincula envios Melhor Envio a pedidos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_me_shipments_to_orders(
  p_me_integration_id UUID, 
  p_store_integration_id UUID, 
  p_store_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
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
$function$;

COMMENT ON FUNCTION public.link_me_shipments_to_orders IS 'Vincula envios do Melhor Envio a pedidos LI ou Bling';

-- -----------------------------------------------------------------------------
-- DELETE_ACCOUNT_DATA - Exclusão transacional de conta (owner ou membro)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_account_data(_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _owned_tenant_id uuid;
  _is_owner boolean := false;
  _logs text[] := ARRAY[]::text[];
BEGIN
  SELECT id INTO _owned_tenant_id
  FROM public.tenants WHERE owner_id = _user_id;

  _is_owner := (_owned_tenant_id IS NOT NULL);
  _logs := array_append(_logs, 'Iniciando exclusão transacional...');

  IF _is_owner THEN
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (
      SELECT id FROM public.team_members WHERE user_id = _user_id AND tenant_id != _owned_tenant_id
    );
    DELETE FROM public.team_members WHERE user_id = _user_id AND tenant_id != _owned_tenant_id;
    _logs := array_append(_logs, 'Removido de equipes externas');

    DELETE FROM public.bling_webhook_events WHERE tenant_id = _owned_tenant_id;
    _logs := array_append(_logs, 'Webhook events limpos');

    DELETE FROM public.ai_assistant_configs
    WHERE default_ai_agent_id IN (SELECT id FROM public.ai_agents WHERE tenant_id = _owned_tenant_id);
    _logs := array_append(_logs, 'AI configs limpos');

    DELETE FROM public.tenants WHERE id = _owned_tenant_id;
    _logs := array_append(_logs, 'Tenant e dados cascateados excluídos');
  ELSE
    DELETE FROM public.member_permissions
    WHERE team_member_id IN (SELECT id FROM public.team_members WHERE user_id = _user_id);
    DELETE FROM public.team_members WHERE user_id = _user_id;
    _logs := array_append(_logs, 'Removido de todas as equipes');
  END IF;

  DELETE FROM public.profiles WHERE user_id = _user_id;
  _logs := array_append(_logs, 'Perfil excluído');
  DELETE FROM public.oauth_states WHERE user_id = _user_id;
  _logs := array_append(_logs, '✅ Dados excluídos com sucesso');

  RETURN jsonb_build_object('success', true, 'was_owner', _is_owner, 'tenant_id', _owned_tenant_id, 'logs', to_jsonb(_logs));
END;
$function$;

COMMENT ON FUNCTION public.delete_account_data IS 'Exclusão transacional — owner deleta tenant (CASCADE), membro sai das equipes';

-- -----------------------------------------------------------------------------
-- LEAVE_TEAM_MEMBERSHIPS - Sair de todas as equipes sem excluir conta
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_team_memberships(_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _removed_count integer := 0;
  _logs text[] := ARRAY[]::text[];
BEGIN
  _logs := array_append(_logs, 'Removendo participações em equipes...');

  DELETE FROM public.member_permissions
  WHERE team_member_id IN (SELECT id FROM public.team_members WHERE user_id = _user_id);

  WITH deleted AS (
    DELETE FROM public.team_members WHERE user_id = _user_id RETURNING id
  )
  SELECT count(*) INTO _removed_count FROM deleted;

  _logs := array_append(_logs, format('Removido de %s equipe(s)', _removed_count));
  _logs := array_append(_logs, '✅ Saiu de todas as equipes com sucesso');

  RETURN jsonb_build_object('success', true, 'removed_count', _removed_count, 'logs', to_jsonb(_logs));
END;
$function$;

COMMENT ON FUNCTION public.leave_team_memberships IS 'Remove usuário de todas as equipes, mantendo conta auth';