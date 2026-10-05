# CRM Spy Pro

CRM/ERP multi-tenant em produção (https://spypro.com.br) com integrações de e-commerce, mensageria e marketing. Originado no Lovable Cloud, migrado em 2026-05-08 para um Supabase próprio no cloud e, em **2026-10-03, para um Supabase auto-hospedado numa VPS própria** (Fase M). O projeto cloud (`fsrgtnasverkkqkbnmzf`) segue ligado só até ser pausado após a validação. Frontend self-hosted via EasyPanel.

> **Secrets** (DB password, service_role JWT, CRON_SECRET, edge function secret values, PATs) **não estão neste arquivo**. Estão na auto memory local em `~/.claude/projects/.../memory/reference_secrets.md` (gitignored). Se precisar deles e não tiver acesso à memory: pegar com o owner do projeto.

## Stack

- **Frontend**: Vite 5 + React 18 + TypeScript + shadcn/ui (Radix) + Tailwind + React Router 7 + TanStack Query 5. Build: `vite build`. Dev: `npm run dev`.
- **Backend**: Supabase auto-hospedado (Postgres 17 + Auth + REST + Realtime + Storage + Edge Functions Deno). 103 edge functions, 166 tabelas com RLS, 394 policies, 39 cron jobs.
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
  functions/             # 103 edge functions Deno
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

`src/integrations/supabase/types.ts` é **autogerado** — não editar manualmente. Regenerar SEM CLI/docker local, pelo postgres-meta do servidor: `ssh ... "curl -s 'http://<ip do container supabase-meta>:8080/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true'" > types.ts` (IP: `docker inspect supabase-meta`; salvar UTF-8 sem BOM e LF) e o snapshot com `docker exec supabase-db pg_dump -U postgres -d postgres -s -n public --no-owner --no-privileges --no-comments > sql/FULL_MIGRATION.sql`; conferir com `deno run --allow-read scripts/check-schema-drift.ts` (rodar na VPS com `docker run denoland/deno`). Última regeneração: 05/10/2026 (drift 0). Alternativa com túnel SSH aberto: `supabase gen types typescript --db-url postgresql://postgres:<senha>@127.0.0.1:6543/postgres --schema public` (UTF-8/LF; ver `sql/SOURCE_OF_TRUTH.md`).

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

32 jobs ativos. Padrão correto: `headers := public.get_internal_headers()` no `net.http_post`. Para crons que demoram >5s, adicionar `timeout_milliseconds := 90000`.

Funções cron-driven que requerem `requireInternalAuth` aceitam o header `x-cron-secret` que `get_internal_headers()` envia.

Para listar/diagnosticar jobs e respostas HTTP: ver `reference_operations.md` na auto memory local.

## Realtime

Tabelas no `supabase_realtime` publication (tem que estar lá pra `postgres_changes` chegar no cliente): `conversations`, `messages`, `li_orders`, `bling_orders`, `me_shipments`, `integrations`, `li_customers`, `li_products`, `bling_customers`, `bling_products`, `me_sync_jobs`, `bling_sync_jobs`, `tenant_tokens`, `token_transactions`, `customer_rfm_snapshots`, `generated_coupons`. Migration `20260509000005`.

`REPLICA IDENTITY FULL` em todas — necessário pra UPDATE/DELETE com filter por coluna funcionarem.

Para subscriptions com múltiplos consumidores, **não** usar `Date.now()` em channel name (race condition entre instâncias). Padrão: extrair sub para hook próprio chamado uma única vez no topo da árvore. Frontend uses prefix-match invalidation do React Query pra propagar.

## API da Loja Integrada (v2) e área de Marketing

Especificação oficial (OpenAPI, 740 KB): https://api-docs.lojaintegrada.com.br/openapi/API-Loja-Integrada.json (a página é Scalar, renderizada por JS; a spec está em `/openapi/API-Loja-Integrada.json`). Base `https://api.awsli.com.br`: `/v1/...` (loja) e `/v3/marketing/...`. Auth: `Authorization: Basic <Personal Token>` (`_shared/li-auth.ts`). **Limite: 100 chamadas/min por loja** (429 acima); `_shared/li-marketing.ts` repete com espera.

- **Webhooks não funcionam com Personal Token**: `PUT /webhooks/v1/{pedido,produto}` devolve 401 "Acesso negado" (exige credencial de integrador/parceiro; só existem webhook de pedido e produto, o de cliente acabou). O motivo fica em `integrations.metadata.webhooks_error`; pedidos/produtos entram pelo `li-job-processor` (5 min). O webhook antigo da loja pode apontar para o projeto cloud.
- **Marketing (`/v3/marketing`)**: automações nativas da loja ids 6 carrinho (`AbandonedCartAutomation`), 7 navegação (`AbandonedBrowsingAutomation`), 2 pedido (`AbandonedOrderAutomation`), regras de tempo em minutos (60/1440/2880); `GET campaign/{id}` lista os abandonos (`recipient` pode vir nulo e o e-mail só em `recipientIdentifier`; status `F` = encerrada, e o carrinho de `campaign/details/{id}` vem **vazio** depois disso: capturar enquanto pendente); `POST rules/toggle` (`abandoned-cart`, `abandoned-product`, `cancelled-order`; o mapeamento chave→automação é palpite e o `li-marketing` confere e reverte); `POST automations/optout`; newsletter v3 trava em 1.000 (usar a v1: 100 por página, ordenada por e-mail, não ordena por id; limite acima de 100 devolve vazio); lista de espera responde em snake_case (`total_records`, `results`, `produto_id`) ao contrário da doc, e só dá a contagem por produto.
- **Código**: `_shared/li-marketing.ts` (cliente), `_shared/abandonment-render.ts` (carrinho em HTML/texto, janela de silêncio, `nextDueStep`), `_shared/email-coupons.ts` (cupom único), `abandonment-capture` (cron 10 min), `abandonment-processor` (cron 1 min; e-mail e WhatsApp; só atende abandonos depois de `abandonment_flows.enabled_at`; reserva o envio em `abandonment_flow_sends` antes de enviar: no máximo uma vez), `li-marketing` (status/toggle da nativa), `li-marketing-jobs` (newsletter 15 min, outbox 5 min, waitlist diário, groups 1 min), `li-customer-groups` (grupos de clientes com prévia/desfazer). Front: página "Recuperação LI" no menu Automação (`/recuperacao-li`, `pages/RecuperacaoLI.tsx`; componentes em `components/email-marketing/recovery/`).
- **Fluxos** (`abandonment_flows`, um por tipo: cart, browse, order, welcome): cada etapa de e-mail é uma campanha `email_campaigns` com `flow_kind/flow_step` (editor, rastreio e métricas reaproveitados; escondidas da lista normal e do contador). Variáveis: `cart_items` (bloco "Itens do carrinho"), `cart_items_text`, `cart_total`, `cart_count`, `cart_url` (`/carrinho/index` da loja), `product_name/url/image`, `store_url`, mais as de cupom. Precisa de `integrations.metadata.store_url` (endereço da loja). O rodapé dos modelos usa `integrations.metadata.footer_address` (campo em Recuperação LI → Loja Integrada, `useFooterAddress`); sem ele sai o texto de exemplo "Endereço da empresa". Boas-vindas = novos inscritos da newsletter (registro `li_abandonment_campaigns` com `li_campaign_id` NEGATIVO = -id da newsletter, `automation_id` 0); os 17 mil inscritos antigos são `is_baseline` e nunca recebem nada.
- **Recuperação** (`refresh_abandonment_recovery`): compra do mesmo e-mail depois do abandono (7 dias); `recovered_via` = ours (recebeu algo nosso antes) ou other (inclui a nativa). Conversão do nosso fluxo entra em `email_campaign_conversions` com tipo `recovery`. Atribuição de campanhas agora: cupom > UTM (`utm_campaign` do pedido = `utm_slug(nome da campanha)`) > clique > abertura.
- **Descadastro em duas vias**: gatilho em `email_suppression_list` → fila `li_marketing_outbox` → remove da newsletter e faz opt-out nas automações (`li_marketing_settings.sync_unsubscribes`, padrão ligado); o contrário (saiu da newsletter da loja) entra na supressão com `source = 'li_newsletter'`, que não volta para a loja.
- **Cupons (livro-razão)**: TODO cupom criado na loja passa por `_shared/coupon-issuer.ts` (`issueCoupon`: reserva o código em `generated_coupons` antes, repete em 429/5xx, troca o código em colisão). Não chame `POST /v1/cupom` direto em módulo novo. `generated_coupons` guarda a origem (`origin_type`: cashback, birthday, reactivation, email_campaign, recovery, welcome, manual, loyalty, imported) e o uso vem do gatilho em `li_orders` (`cupom_desconto.codigo`; cancelado desfaz) e de `refresh_coupon_usage` na sincronização; retorno por origem em `get_coupon_performance` (tela Cupons). Bling/Nuvemshop têm criadores próprios.
- **Regras de contato (Fase N3)**: todo envio de marketing/automação chama `_shared/contact-policy.ts` — `canContact`/`blockedTargets` antes (supressão de e-mail, `contact_blocks` de telefone, limite diário por pessoa em `contact_policies`, prioridade: disparo em massa cede a quem recebeu mensagem de ciclo de vida) e `recordTouches` depois (`customer_touches`). Cashback, lembrete de cashback e aniversário não entram no limite. Módulo novo que envia mensagem a cliente DEVE usar isso. Não cobre conversas do atendimento/IA. E-mail automático promocional fora do motor de campanhas (aniversário, cashback, lembrete) DEVE levar o link de descadastro via `_shared/email-unsubscribe-link.ts` (`unsubscribeFor`).
- **Evento único de pedido (Fase N4)**: `li_orders` emite `domain_events` (`order_ingested`) por gatilho quando o pedido é novo ou muda de status; o cron `domain-event-processor` (1 min) entrega a consumidores idempotentes (`domain_event_deliveries`): cashback, recuperação de abandono, atribuição de campanhas (`domain-event-processor/consumers.ts`). **Não dispare cashback/recuperação direto da sincronização ou do webhook: acrescente um consumidor.** Notificações de status ao cliente seguem inline.
- **Identidade do cliente (Fase N5)**: a pessoa é identificada por `customer_key(email, telefone)` (SQL, igual a `normEmail`/`normPhone` do TS: e-mail minúsculo, senão telefone com 55). **Nunca ligar RFM a clientes pelo `customer_id` do snapshot**: ele vem em dois formatos (uuid de `li_customers.id` ou `li_<id da loja>`); use a chave (view `customer_rfm_latest` = último RFM por pessoa). O seletor de grupos casava só `li_<id>` e perdia 68% das pessoas (1.542 de 4.795).
- **PUT de cupom**: a loja devolve `valor_minimo: ""` e `limite_desconto: null` mas recusa receber de volta (400): omitir os vazios (`li-coupon-update`).

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
- `20260509000010-011`: aposentar feature de carrinho abandonado (reativada em 05/10/2026 pela API de Marketing da loja: migrations `20261004000011+`, seção "API da Loja Integrada")
- `20261003000001`: bloqueio de novos cadastros em `auth.users`
- `20261003000002`: repara textos padrão com dupla codificação (UTF-8 lido como cp1252)
- `20261003000003`: cron diário de limpeza do histórico dos crons
- `20261003000004`: `public.functions_base_url()` — URL das funções deixa de ficar fixa em crons/funções SQL
- `20261004000001`: métricas de e-mail marketing: `email_campaign_conversions`, `refresh_email_campaign_attribution(tenant)` (cron a cada 15 min), `get_email_campaign_performance/_conversions/_top_links`. Compra atribuída a UMA campanha: cupom > clique > abertura (janela `attribution_window_days`, padrão 7); pedidos cancelados/devolvidos não contam; só recalcula campanhas ativas (janela+7 dias) porque `email_events` é apagado aos 90 dias
- `20261004000004`: envio de campanhas em fila: `email_send_queue` (um registro por destinatário), `claim_email_send_batch` (lotes sem repetir destinatário), trava `email_campaigns.send_lease_until` e cron `email-send-watchdog` (1 min) que devolve à fila o que ficou preso e reativa campanhas paradas. `email-campaign-send` só prepara a fila e responde 202; `processor.ts` envia em lotes (4 conexões SMTP, limite por segundo da integração), continua sozinho em outra chamada e é retomável (pausar/retomar, queda do runtime). Envio de e-mail usa `_shared/mime-safe.ts` (base64 + Reply-To correto; o quoted-printable do denomailer corrompe acentos e gera =20)
- `20261004000005`: `email_events.event_type` aceita também `bot_open`/`bot_click` (robôs: Apple MPP, escaneadores; `_shared/email-bot-filter.ts`), `test_open`/`test_click` (e-mail de teste, token `is_test`) e `delivered`; as métricas filtram só `open`/`click`, então robôs e testes ficam de fora
- `20261004000006`: `get_li_showcase_products(modo, limite, dias)` — vitrine automática do editor de e-mail (mais vendidos por produto pai, lançamentos, promoção)
- `20261004000007`: `email_campaigns.skip_recent_days` + `get_recent_email_recipients` (só service_role): a campanha pula quem recebeu e-mail nos últimos N dias
- `20261004000008`: `get_email_health(tenant, dias)` — saúde do envio (falhas, descadastros, bounce/reclamação, campanhas travadas)
- `20261004000009`: cupons — `generated_coupons` ganha `li_ativo/li_valor_minimo/li_quantidade_por_cliente/li_cumulativo` e índice único (integração, código); `email_campaigns.unique_coupon` + tabela `email_campaign_coupons` (cupom único por destinatário); a atribuição de compra reconhece esses códigos. Formato real da API de cupom da LI: `_shared/li-coupons.ts` (tipos porcentagem|fixo|frete_gratis, validade AAAA-MM-DD, quantidade, quantidade_por_cliente). A API recusa rajadas (HTTP 429): criar com poucas conexões
- `20261004000010`: teste A/B com vencedor automático: colunas `ab_auto_winner/ab_winner_*`, `get_ab_winner_candidates()` e cron `email-ab-winner` (10 min, função `email-ab-winner`). A variante "W" (resto da lista) sai com o assunto de maior abertura e exclui quem recebeu A ou B
- `20261004000011`: recuperação de abandono: `abandonment_flows`, `li_abandonment_campaigns`, `abandonment_flow_sends`, `li_native_toggle_log`, `email_campaigns.flow_kind/flow_step`, `utm_slug()`, atribuição por UTM, `refresh_abandonment_recovery()`, `get_abandonment_funnel()`, crons `abandonment-capture` e `abandonment-processor`
- `20261004000012`: `abandonment_flows.enabled_at` (só atende abandonos depois de ligado) e `native_optout_at`
- `20261004000013`: fluxo `welcome`, newsletter da loja (`li_newsletter_subscribers`, `li_newsletter_scan_state`), lista de espera (`li_waitlist_snapshots`, `get_waitlist_panel`), descadastro em duas vias (`li_marketing_settings`, `li_marketing_outbox`, gatilho), índice de e-mail em `li_orders`, crons `li-newsletter-sync`, `li-marketing-outbox`, `li-waitlist-sync`
- `20261004000014`: audiência "newsletter" (novos inscritos) em `estimate_email_audience`
- `20261005000003`: `flow_kind = 'system'` (campanhas de sistema que guardam o token de descadastro dos e-mails automáticos)
- `20261005000001-002`: registro único de contatos (`customer_touches`, `contact_policies`, `get_contact_blockers`, `get_touch_summary`) e arquivamento de etapas de fluxo órfãs
- `20261004000016-017`: livro-razão de cupons (`origin_*`, `issue_status`, gatilho `mark_coupon_redeemed`, `get_coupon_performance`, `refresh_coupon_usage`, `cleanup_pending_coupons`)
- `20261005000004`: evento único de pedido (`domain_events`, `domain_event_deliveries`, gatilho em `li_orders`, `claim_domain_events`, cron `domain-event-processor`)
- `20261005000006`: painéis cruzados (`get_customer_communication`, `get_message_performance`)
- `20261005000005`: identidade do cliente (`customer_key(email, telefone)`, view `customer_rfm_latest`, correção de `get_rfm_audience_li_customers`)
- `20261004000015`: grupos de clientes da loja (`li_group_jobs`, `li_group_job_items`, `get_rfm_audience_li_customers`, cron `li-group-jobs`)
