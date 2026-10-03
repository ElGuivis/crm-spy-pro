# CRM Spy Pro

CRM/ERP multi-tenant em produção (https://spypro.com.br) com integrações de e-commerce, mensageria e marketing. Originado no Lovable Cloud, migrado em 2026-05-08 para um Supabase próprio no cloud e, em **2026-10-03, para um Supabase auto-hospedado numa VPS própria** (Fase M). O projeto cloud (`fsrgtnasverkkqkbnmzf`) segue ligado só até ser pausado após a validação. Frontend self-hosted via EasyPanel.

> **Secrets** (DB password, service_role JWT, CRON_SECRET, edge function secret values, PATs) **não estão neste arquivo**. Estão na auto memory local em `~/.claude/projects/.../memory/reference_secrets.md` (gitignored). Se precisar deles e não tiver acesso à memory: pegar com o owner do projeto.

## Stack

- **Frontend**: Vite 5 + React 18 + TypeScript + shadcn/ui (Radix) + Tailwind + React Router 7 + TanStack Query 5. Build: `vite build`. Dev: `npm run dev`.
- **Backend**: Supabase auto-hospedado (Postgres 17 + Auth + REST + Realtime + Storage + Edge Functions Deno). 96 edge functions, 152 tabelas com RLS, 387 policies, 30 cron jobs.
- **Deploy**: frontend via EasyPanel (Dockerfile + nginx, rebuild manual, Build Args `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`). Edge functions: `powershell scripts/deploy-functions-vps.ps1 [-Only <nome>]` (copia para a VPS e reinicia o runtime; `supabase functions deploy` NÃO se aplica ao servidor novo).
- **Owner / login dev**: `usechronic@gmail.com` (único usuário; cadastros bloqueados por trigger + `DISABLE_SIGNUP`).

## Supabase ativo (auto-hospedado na VPS)

| Campo | Valor |
|---|---|
| API / Auth / Storage / Functions | `https://api.spypro.com.br` |
| Studio (basic auth) | `https://studio.spypro.com.br` |
| Servidor | VPS `37.148.134.55` (Ubuntu, 4 vCPU / 8 GB), SSH como root com a chave `~/.ssh/spypro_vps` |
| Stack | `/opt/supabase` (docker compose oficial + `docker-compose.spypro.yml`); `sh run.sh status|logs|restart` |
| Segredos do stack | `/opt/supabase/.env` (cópia local em `Documents/segredos/vps-supabase.env`) |
| Secrets das edge functions | `/opt/supabase/functions.env` (`docker compose up -d functions` após editar) |
| Banco | só por túnel SSH: `ssh -L 6543:127.0.0.1:6543 root@37.148.134.55`, usuário `postgres`, senha em `.env` (`POSTGRES_PASSWORD`) |
| Backup | diário 03:30 em `/opt/backups` (3 versões) + cópia criptografada no Google Drive (rclone) |

> Detalhes operacionais, pendências e armadilhas da migração: memory `project_vps_migration.md`. Projetos antigos: Lovable `vmqyklqchwtwbrpowdgk` (desativado) e Supabase cloud `fsrgtnasverkkqkbnmzf` (a pausar).

### JWTs

- **Anon** (publicável, já vai pro bundle do cliente): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxMDU1ODc3LCJleHAiOjE5NDg3MzU4Nzd9.ki0jQ7AACUbRaqhgwSTC-EHOq1S0CsaEBdGnVIyWi3g`
- **Service Role**: _ver `/opt/supabase/.env` ou memory_

### Auth dos JWTs (importante)

O stack usa **chaves assimétricas ES256** (mais as legadas HS256). Por compatibilidade com o desenho original, todos os edge functions seguem com `verify_jwt = false` em `supabase/config.toml` e o runtime com `FUNCTIONS_VERIFY_JWT=false`. **Auth é feita em código** via `_shared/auth-guard.ts`:

- `requireUserAuth(req)` — exige JWT do usuário (resolve tenant via `get_user_tenant_id`).
- `requireInternalAuth(req)` — aceita `SUPABASE_SERVICE_ROLE_KEY` (Bearer) ou `CRON_SECRET` (Bearer ou header `x-cron-secret`).
- `requireUserOrInternalAuth(req)` — aceita ambos (usado em funções com modo "usuário" e modo "cron/watchdog").

**CORS:** o gateway Envoy foi restrito a `spypro.com.br`, `studio` e `api` (o padrão do compose oficial refletia qualquer origem). Reaplicar em `volumes/api/envoy/lds.template.yaml` se rodar `update.sh`.

**URL das funções em SQL:** nunca escrever o domínio em cron/função; usar `public.functions_base_url() || '/functions/v1/<fn>'` (setting `app.settings.functions_url` ou padrão do servidor).

Catch handler de função deve repassar `Response` thrown pelo guard:
```ts
} catch (err) {
  if (err instanceof Response) return err;
  // ...
}
```

## Vault & Edge Function Secrets

Vault (`vault.secrets`):
- `CRON_SECRET` — usado em headers de cron internos. Acesso recomendado:
  ```sql
  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1)
  ```
  Para crons, usar a função utilitária `public.get_internal_headers()` que monta `{Content-Type, x-cron-secret}` direto.
- `TENANT_DATA_ENCRYPTION_KEY` — gerada em 2026-05-08, usada pelos triggers `trg_encrypt_bling_tokens`, `trg_encrypt_melhor_envio_tokens`, `trg_encrypt_email_smtp_password`. A chave foi **copiada do cloud para o servidor novo**, então tokens cifrados continuam decifráveis (o reset de 2026-10-03 zerou as integrações; a Loja Integrada já foi reconectada com Personal Token).

Edge Function Secrets (hoje em `/opt/supabase/functions.env` no servidor; valores também em memory):
```
ALLOW_PREVIEW_ORIGINS, BLING_CLIENT_ID/SECRET, CHATWOOT_*, CRON_SECRET,
EVOLUTION_API_KEY/URL, FRONTEND_URL, INSTAGRAM_APP_ID/SECRET,
LI_WEBHOOK_SECRET, LOJA_INTEGRADA_API_KEY/APP_KEY,
MELHOR_ENVIO_CLIENT_ID/SECRET/ENVIRONMENT/WEBHOOK_SECRET,
META_APP_ID/SECRET/WEBHOOK_VERIFY_TOKEN, N8N_WEBHOOK_URL
```
`SUPABASE_URL` (aqui = URL pública `https://api.spypro.com.br`, porque as funções montam URLs de webhook/OAuth/e-mail a partir dela), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` são injetados pelo runtime.

## Estrutura

```
src/
  pages/                 # 25 rotas top-level (Sales, Products, Clients, Envios, Integrations, ...)
  components/            # por domínio: sales, products, clients, envios, integrations, atendimentos,
                         # automations, email-marketing, instagram, ui (shadcn), common, layout, ...
  components/common/SyncProgressBanner.tsx  # banner reutilizável de progresso de sync (LI + ME)
  hooks/                 # useSyncStatus, useMelhorEnvio, useBlingSync, useDashboardStats, useAtendimentos, ...
  integrations/supabase/ # client.ts (auto-gerado) + types.ts (tipos do DB, regenerar via gen types)
  contexts/              # AuthContext, etc.
supabase/
  functions/             # 96 edge functions Deno
    _shared/             # auth-guard.ts, li-sync-*.ts, melhor-envio-*.ts, ai-chat-*.ts, ...
    li-sync/             # sync de Loja Integrada (waitUntil + time budget 110s)
    li-job-processor/    # incremental sync recorrente (waitUntil)
    li-reconciliation-processor/  # reconciliação manual ou periódica
    melhor-envio/        # OAuth + sync + webhooks ME
    bling-*/             # OAuth + sync + jobs Bling
    instagram-*/         # ~25 funções Instagram
    whatsapp-webhook/    # webhook Evolution API
    ai-chat/             # bot principal (5.5x do limite — em decomposição)
    delete-account/      # exclusão de conta (cascade via DB direto)
  migrations/            # SQL versionado
  config.toml            # cada função tem `verify_jwt = false`
docs/, sql/, scripts/    # docs internos, snippets SQL ad-hoc, scripts utilitários
```

`src/integrations/supabase/types.ts` é **autogerado** — não editar manualmente. Regenerar com túnel SSH aberto: `supabase gen types typescript --db-url postgresql://postgres:<senha>@127.0.0.1:6543/postgres --schema public` (UTF-8/LF; ver `sql/SOURCE_OF_TRUTH.md`).

## Tenants e dados

- Tenant único: **Use Chronic** (o banco foi zerado em 2026-10-03; todos os demais usuários/tenants de teste foram apagados).
- Loja Integrada reconectada com Personal Token (expira em 03/01/2027); dados reimportados (≈15,8 mil clientes, 7,3 mil produtos, 9,8 mil pedidos).
- Melhor Envio, Instagram (3 canais), WhatsApp (instâncias Evolution), SMTP e credenciais de IA: **a reconectar** (Fase 5 do plano).
- Antes do reset (histórico): WhatsApp `useokok`/`outback` ok, `hazetabacria` a reconectar.

## Sync de Loja Integrada

Edge function `supabase/functions/li-sync/index.ts`. Body:
```json
{ "integrationId": "...", "syncType": "customers|products|orders|all", "action": "register-webhook" }
```

- Background via `EdgeRuntime.waitUntil(runFullSync(...))`, time budget ~110s por chamada.
- Loop interno até `last_offset = 0` ou deadline.
- Quando todos os entityTypes terminam (`last_offset = 0`), `runFullSync` chama `registerWebhooks()` registrando em `https://api.awsli.com.br/webhooks/v1/{cliente,produto,pedido}` apontando para `${SUPABASE_URL}/functions/v1/li-webhook`. Token salvo em `integrations.metadata.webhook_token`.

### Tabela `li_sync_state` — colunas REAIS

```
id, integration_id, tenant_id, entity_type ('customers'|'products'|'orders'),
last_synced_at, last_offset, last_cursor, records_synced, total_count, updated_at
```

⚠️ **Não inclua** `current_page`, `total_pages`, `sync_status`, `extra` em SELECTs — colunas não existem; o query inteiro falha em silêncio. Bug "stuck at 100" de 2026-05-09.

RLS de `li_sync_state` usa `tenant_id = public.get_user_tenant_id(auth.uid())` (igual a `li_orders`/`li_customers`). **Não usar** subquery em `team_members` — quebra para tenant owners que não estão lá.

### Watchdogs cron

| Job | id | Schedule | Threshold | O que faz |
|---|---|---|---|---|
| `li-sync-watchdog` | 21 | `* * * * *` | 90s sem update | Detecta `li_sync_state.last_offset > 0 AND updated_at < NOW() - 90s` e dispara `li-sync` via `pg_net.http_post` com `CRON_SECRET`. |
| `me-sync-watchdog` | 22 | `* * * * *` | 60s | Mesmo conceito para `me_sync_jobs`. ME function termina por design em ~50s. |

Migrações: `20260509000001_li_sync_watchdog.sql`, `20260509000002_me_sync_watchdog.sql`.

### `SyncProgressBanner`

`src/components/common/SyncProgressBanner.tsx` — polling 5s. Mostra progresso enquanto sincronizando (`offset > 0 && updated_at < 5min`) E também mostra contagem final após concluir (✓ X / Y sincronizados, com checkmark verde). Usado em `SalesContent`, `ProductsContent`, `ClientsContent`, `EnviosContent`. Para LI lê `li_sync_state.last_offset / total_count`. Para ME lê `me_sync_jobs.items_saved / items_total`.

## Cron jobs e auth

30 jobs ativos. Padrão correto: `headers := public.get_internal_headers()` no `net.http_post`. Para crons que demoram >5s, adicionar `timeout_milliseconds := 90000`.

Funções cron-driven que requerem `requireInternalAuth` aceitam o header `x-cron-secret` que `get_internal_headers()` envia.

Para listar/diagnosticar jobs e respostas HTTP: ver `reference_operations.md` na auto memory local.

## Realtime

Tabelas no `supabase_realtime` publication (tem que estar lá pra `postgres_changes` chegar no cliente): `conversations`, `messages`, `li_orders`, `bling_orders`, `me_shipments`, `integrations`, `li_customers`, `li_products`, `bling_customers`, `bling_products`, `me_sync_jobs`, `bling_sync_jobs`, `tenant_tokens`, `token_transactions`, `customer_rfm_snapshots`, `generated_coupons`. Migration `20260509000005`.

`REPLICA IDENTITY FULL` em todas — necessário pra UPDATE/DELETE com filter por coluna funcionarem.

Para subscriptions com múltiplos consumidores, **não** usar `Date.now()` em channel name (race condition entre instâncias). Padrão: extrair sub para hook próprio chamado uma única vez no topo da árvore. Frontend uses prefix-match invalidation do React Query pra propagar.

## Convenções e regras de tamanho

- **Limites**: pages ≤400L, components shared ≤250L, hooks ≤200L, edge `index.ts` ≤500L, `_shared/` ≤300L.
- **CI gate**: `scripts/check-file-sizes.ts` bloqueia PRs que excedem 150% do limite. Workflow em `.github/workflows/ci.yml`.
- **Tipagem**: `any` proibido em fluxos críticos (auth, pagamento, webhook). Use `unknown` + type guard.
- **Tier 1 violadores conhecidos** (decomposição prioritária): `ai-chat/index.ts` (5.5x), `whatsapp-webhook/index.ts` (3.7x), `BlingOrderDetailsDialog`, `BlingProductsContent`, `EnviosContent`, `EmailCampaignFormDialog`, `SalesContent`, `_shared/li-sync-orders.ts`, `melhor-envio/index.ts`, `IntegrationCard`, `useMelhorEnvio`, `OrderNotificationConfigDialog`, `AIAgentBuilder`, `ShipmentDetailsDialog`, `CouponsContent`. Lista completa em `src/FILE_SIZE_RULES.md`.

## Padrões para code que toca DB pesado

- Cascade deletes (`delete_account_data`, `delete_integration_cascade`) excedem o `statement_timeout` de 8s do PostgREST. **Usar conexão DB direta** com `SET LOCAL statement_timeout = 0` dentro de transação. Modelo: `manage-sync-jobs/index.ts` e `delete-account/index.ts`.
- Funções cron-driven que demoram muito: `EdgeRuntime.waitUntil(...)` para retornar 202 imediato e continuar em background. Edge runtime dá ~150s wall time. Modelos: `li-sync/index.ts`, `li-job-processor/index.ts`.

## Comandos úteis

```sh
# Frontend
npm run dev          # http://localhost:8080 (vite)
npm run build        # bundle prod em dist/
npm run lint

# Edge functions (servidor novo)
powershell -File scripts/deploy-functions-vps.ps1 -Only <nome>   # ou sem -Only para todas

# DB direto (psql) — túnel SSH + senha em /opt/supabase/.env (POSTGRES_PASSWORD)
ssh -i ~/.ssh/spypro_vps -L 6543:127.0.0.1:6543 root@37.148.134.55
$env:PGPASSWORD='<POSTGRES_PASSWORD>'; $env:PGCLIENTENCODING='UTF8'
psql -h 127.0.0.1 -p 6543 -U postgres -d postgres

# Servidor
ssh -i ~/.ssh/spypro_vps root@37.148.134.55 "cd /opt/supabase && sh run.sh status"
```

## Plataforma

- Sistema operacional do dev: **Windows 11 Pro** (PowerShell). Bash via Git Bash funciona, mas comandos com redirects POSIX podem falhar — preferir PowerShell ou ferramentas dedicadas (Glob/Grep/Read/Edit).
- Domínios: app em `spypro.com.br`, Chatwoot em `chatwoot.spypro.com.br`, Evolution em `evolution.spypro.com.br`, n8n em `webhook.spypro.com.br`.

## Histórico de migrações importantes

- `20260508000001-005`: cascade delete fixes + RLS DELETE policies
- `20260509000001-002`: sync watchdogs (li-sync e me-sync)
- `20260509000003-004`: `li_sync_state.total_count` + RLS realign
- `20260509000005`: realtime publication populada (16 tabelas + REPLICA IDENTITY FULL)
- `20260509000006`: cron auth pós-migração (anon JWT → `get_internal_headers()`)
- `20260509000007-008`: timeout extension em crons lentos
- `20260509000009`: bulk-li-status-update-cron auth fix
- `20260509000010-011`: aposentar feature de carrinho abandonado
- `20261003000001`: bloqueio de novos cadastros em `auth.users`
- `20261003000002`: repara textos padrão com dupla codificação (UTF-8 lido como cp1252)
- `20261003000003`: cron diário de limpeza do histórico dos crons
- `20261003000004`: `public.functions_base_url()` — URL das funções deixa de ficar fixa em crons/funções SQL
