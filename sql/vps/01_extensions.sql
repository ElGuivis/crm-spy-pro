-- =============================================================================
-- SPY PRO CRM - VPS DEPLOY: EXTENSÕES
-- =============================================================================
-- Executar com privilégios de superuser

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
