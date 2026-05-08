# Checklist de Segurança — Rotação e Higiene de Segredos

## Status do .env

> 📋 A política completa de `.env` está em [`docs/ENV_POLICY.md`](docs/ENV_POLICY.md).

**Resumo:** O `.env` na raiz é **gerenciado automaticamente** pelo Lovable Cloud e contém
**apenas chaves públicas** (`VITE_*`). Segredos privados ficam no painel de Secrets do
Lovable Cloud, acessíveis apenas em Edge Functions.

## .gitignore

O `.gitignore` é gerenciado pelo sistema. A regra `*.local` cobre `.env.local` para
overrides locais. O `.env` contém apenas chaves públicas — sua presença no repositório
é intencional e segura.

## Checklist de Rotação — Chaves Críticas

Se houver suspeita de vazamento (ex: ZIP compartilhado externamente), rotacionar:

| Prioridade | Segredo | Onde rotacionar |
|------------|---------|----------------|
| P0 | `SUPABASE_SERVICE_ROLE_KEY` | Lovable Cloud > Settings (regenerar no dashboard) |
| P0 | `CRON_SECRET` | Lovable Cloud > Secrets (gerar novo UUID) |
| P0 | `META_APP_SECRET` | Meta Developers > App Settings |
| P0 | `INSTAGRAM_APP_SECRET` | Meta Developers > App Settings |
| P1 | `BLING_CLIENT_SECRET` | Painel Bling > Área Dev |
| P1 | `MELHOR_ENVIO_CLIENT_SECRET` | Painel Melhor Envio > Área Dev |
| P1 | `EVOLUTION_API_KEY` | Painel Evolution API |
| P2 | `CHATWOOT_PLATFORM_TOKEN` | Painel Chatwoot |

### Após rotação:

1. Atualizar o segredo em **Lovable Cloud > Secrets**
2. Re-deploy das Edge Functions que usam o segredo
3. Verificar que os fluxos (webhooks, sync, auth) continuam operacionais
4. Para `CRON_SECRET`: executar `SELECT public.store_cron_secret('novo-valor')` no banco

## Arquitetura de Segredos

- **Chaves públicas** (browser): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_META_APP_ID`
- **Segredos de aplicação** (Edge Functions): via `Deno.env.get()` — nunca no código
- **Credenciais de tenant** (por lojista): criptografadas via Vault (`encrypt_secret`/`decrypt_secret`)
  - `bling_connections.access_token_encrypted`
  - `melhor_envio_tokens.access_token_encrypted`
  - `email_integrations.smtp_password_encrypted`
  - `tenant_ai_credentials.api_key_encrypted`
