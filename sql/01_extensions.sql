-- =============================================================================
-- EXTENSÕES DO POSTGRESQL
-- =============================================================================
-- Extensões necessárias para o funcionamento completo do sistema
-- Executar com privilégios de superuser

-- Extensão para geração de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Extensão para agendamento de tarefas cron (requer pg_cron)
-- Nota: pg_cron precisa ser habilitado nas configurações do Supabase
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "extensions";

-- Extensão para chamadas HTTP (requer pg_net)
-- Nota: pg_net já vem habilitado no Supabase
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

-- Extensão para criptografia (opcional, para senhas/tokens)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
