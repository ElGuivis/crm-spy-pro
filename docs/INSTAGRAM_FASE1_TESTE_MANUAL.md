# Roteiro de Teste Manual — Instagram Fase 1 (Base Operacional)

> **Pré-requisito:** Todos os testes de conexão OAuth devem ser executados no domínio registrado no Facebook App (valor da env `FRONTEND_URL_APP` ou `FRONTEND_URL`), pois o Facebook não permite OAuth em ambientes de preview.
>
> **Referência de domínios:** Consulte `docs/DOMAIN_REFERENCE.md` para entender qual URL usar em cada ambiente.
>
> **Ambiente de verificação SQL:** Lovable Cloud → Backend (ou qualquer cliente SQL conectado ao projeto).

---

## Legenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Passou |
| ❌ | Reprovou — bloqueia a fase |
| ⚠️ | Atenção — verificar manualmente |

---

## 1. Conexão OAuth com Instagram

### 1.1 Conectar conta pela primeira vez

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Acesse a URL de produção/staging (ver `docs/DOMAIN_REFERENCE.md`) e faça login | Dashboard carrega normalmente | Erro de auth ou tela em branco |
| 2 | No menu lateral, clique em **Integrações** | Página de integrações carrega | Página não carrega ou erro 500 |
| 3 | Localize o card **Instagram** e clique em **Conectar** | Redirect para Facebook Login (`facebook.com/v21.0/dialog/oauth...`) | Não redireciona ou mostra erro no console |
| 4 | No Facebook, autorize o app com a conta Instagram Business desejada | Facebook processa e redireciona de volta | Erro do Facebook ("App not set up") |
| 5 | Aguarde o redirect de volta ao app (URL conterá `/integrations` ou rota configurada) | App exibe toast de sucesso e o card Instagram muda para **Conectado** | Redirect quebra, token não salvo, ou status continua "desconectado" |
| 6 | No card do Instagram, verifique se o **username** exibido corresponde à conta conectada | Username correto visível | Username vazio, null, ou de outra conta |

**Verificações SQL após o passo 6:**

```sql
-- 1. Canal criado com status 'connected'
SELECT id, tenant_id, ig_user_id, instagram_username, status,
       token_expires_at, token_refresh_at, webhook_verified
FROM instagram_channels
WHERE tenant_id = '<SEU_TENANT_ID>'
ORDER BY created_at DESC;
```

| Campo | Valor Esperado |
|-------|---------------|
| `status` | `connected` |
| `instagram_username` | Username real da conta |
| `ig_user_id` | ID numérico do Instagram (IGSID) |
| `token_expires_at` | ~60 dias no futuro |
| `token_refresh_at` | ~53 dias no futuro (7 dias antes da expiração) |

```sql
-- 2. Token criptografado com AES (prefixo 'aes:')
SELECT id, LEFT(access_token_encrypted, 10) AS token_prefix
FROM instagram_channels
WHERE tenant_id = '<SEU_TENANT_ID>';
```

| Campo | Valor Esperado | Critério de Reprovação |
|-------|---------------|----------------------|
| `token_prefix` | Começa com `aes:` | Token em texto puro ou sem prefixo `aes:` |

```sql
-- 3. Capabilities registradas
SELECT * FROM instagram_channel_capabilities
WHERE channel_id = '<CHANNEL_ID>';
```

| Campo | Valor Esperado |
|-------|---------------|
| Registro existe | Sim, ao menos 1 linha |

```sql
-- 4. OAuth state consumido
SELECT * FROM oauth_states
WHERE tenant_id = '<SEU_TENANT_ID>'
  AND provider = 'meta'
ORDER BY created_at DESC
LIMIT 1;
```

> O state deve ter sido criado e depois consumido (registro existe como evidência).

---

### 1.2 Conectar múltiplas contas (multi-account)

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Com uma conta já conectada, clique novamente em **Conectar Instagram** | Redirect para Facebook Login | Não redireciona |
| 2 | Autorize com uma **conta diferente** do Facebook/Instagram | Redirect de volta ao app | Erro no callback |
| 3 | Verifique que agora existem **2 cards** de Instagram na tela de integrações | Dois canais listados com usernames diferentes | Apenas 1 canal ou o anterior foi sobrescrito |

**Verificação SQL:**

```sql
SELECT id, instagram_username, status
FROM instagram_channels
WHERE tenant_id = '<SEU_TENANT_ID>';
-- Deve retornar 2+ linhas com usernames distintos
```

---

### 1.3 Reconectar conta com status expirado/erro

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | **Simule um status de erro** via SQL: | — | — |
|   | `UPDATE instagram_channels SET status = 'error' WHERE id = '<CHANNEL_ID>';` | — | — |
| 2 | Recarregue a página de Integrações | Card mostra status **Erro** ou **Desconectado** | Status não reflete a mudança |
| 3 | Clique em **Reconectar** (ou Conectar novamente) | Redirect para Facebook Login | Não redireciona |
| 4 | Complete o OAuth com a mesma conta | Redirect de volta, status atualiza para **Conectado** | Status permanece em erro |
| 5 | Verifique o token atualizado | `access_token_encrypted` diferente do anterior, prefixo `aes:` | Token igual ao anterior (não atualizou) |

**Verificação SQL:**

```sql
SELECT id, status, updated_at, LEFT(access_token_encrypted, 10) as token_prefix
FROM instagram_channels
WHERE id = '<CHANNEL_ID>';
-- status = 'connected', token_prefix = 'aes:', updated_at recente
```

---

## 2. Refresh de Token

> **Nota:** O refresh automático é executado por cron. Para teste manual, simulamos a condição.

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Marque o canal como pronto para refresh via SQL: | — | — |
|   | `UPDATE instagram_channels SET token_refresh_at = NOW() - INTERVAL '1 hour' WHERE id = '<CHANNEL_ID>';` | — | — |
| 2 | Invoque a edge function manualmente: | — | — |
|   | `curl -X POST https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-refresh-token -H "Authorization: Bearer <SERVICE_ROLE_KEY>"` | Response: `{ "refreshed": 1, "errors": 0 }` | `refreshed: 0` ou `errors: 1` |
| 3 | Verifique no banco | — | — |

**Verificação SQL:**

```sql
SELECT id, status, token_expires_at, token_refresh_at,
       LEFT(access_token_encrypted, 10) AS token_prefix
FROM instagram_channels
WHERE id = '<CHANNEL_ID>';
```

| Campo | Valor Esperado |
|-------|---------------|
| `status` | `connected` |
| `token_expires_at` | ~60 dias no futuro (renovado) |
| `token_refresh_at` | ~53 dias no futuro (renovado) |
| `token_prefix` | `aes:` (novo token criptografado) |

---

## 3. Webhook

### 3.1 Verificação do Webhook (GET — Meta Challenge)

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | No portal **Meta Developers**, vá em **Webhooks** | — | — |
| 2 | Configure o Callback URL: `https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-webhook-ingest` | — | — |
| 3 | Insira o Verify Token (igual ao secret `META_WEBHOOK_VERIFY_TOKEN`) | — | — |
| 4 | Clique em **Verificar e salvar** | Meta exibe ✅ "Callback URL verificada" | Falha na verificação — verificar se o secret está correto e se `verify_jwt = false` está no config.toml |

**Verificação nos logs da edge function:**

```
[instagram-webhook] ✅ Verification successful
```

| Sinal de Reprovação |
|---------------------|
| Log mostra `❌ Verification failed` |
| Meta retorna erro 403 |

### 3.2 Assinatura de campos do Webhook

| # | Passo | Resultado Esperado |
|---|-------|-------------------|
| 1 | No portal Meta, assine os campos: `messages`, `messaging_postbacks`, `messaging_optins`, `comments`, `live_comments`, `mention`, `messaging_referrals` | Todos os campos marcados com ✅ |

---

### 3.3 Ingestão de Webhook (POST — Evento Real)

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | De uma **conta externa** do Instagram, envie uma DM para a conta conectada | Mensagem enviada com sucesso | — |
| 2 | Aguarde 5-10 segundos | — | — |
| 3 | Verifique a tabela de deliveries | — | — |

**Verificação SQL:**

```sql
-- Webhook bruto persistido
SELECT id, channel_id, provider_delivery_key, event_hash,
       signature_valid, processed, parse_status, created_at
FROM instagram_webhook_deliveries
WHERE channel_id = '<CHANNEL_ID>'
ORDER BY created_at DESC
LIMIT 5;
```

| Campo | Valor Esperado | Critério de Reprovação |
|-------|---------------|----------------------|
| Registro existe | Sim | Nenhum registro = webhook não chegou |
| `signature_valid` | `true` | `false` = assinatura HMAC inválida |
| `processed` | `false` (inicialmente), depois `true` | — |
| `parse_status` | `pending` → `parsed` | Fica em `pending` indefinidamente |

### 3.4 Deduplicação de Webhook

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Anote o `event_hash` do webhook recebido | — | — |
| 2 | Se a Meta reenviar o mesmo evento (retry), verifique: | — | — |

```sql
SELECT COUNT(*) FROM instagram_webhook_deliveries
WHERE event_hash = '<HASH_DO_EVENTO>';
-- Deve retornar exatamente 1
```

| Critério de Reprovação |
|----------------------|
| COUNT > 1 (evento duplicado foi persistido) |

---

## 4. Criação de Contato e Thread

> **Pré-requisito:** Webhook do passo 3.3 já foi recebido e processado.

### 4.1 Contato criado automaticamente

**Verificação SQL:**

```sql
SELECT id, channel_id, ig_scoped_id, username, name, 
       is_blocked, created_at
FROM instagram_contacts
WHERE channel_id = '<CHANNEL_ID>'
ORDER BY created_at DESC
LIMIT 5;
```

| Campo | Valor Esperado | Critério de Reprovação |
|-------|---------------|----------------------|
| Registro existe | Sim, para o remetente da DM | Contato não criado |
| `ig_scoped_id` | ID do usuário que mandou a DM | Vazio ou incorreto |
| `is_blocked` | `false` | — |

### 4.2 Thread criada automaticamente

```sql
SELECT id, channel_id, contact_id, status, thread_type,
       last_message_at, unread_count, created_at
FROM instagram_threads
WHERE channel_id = '<CHANNEL_ID>'
ORDER BY created_at DESC
LIMIT 5;
```

| Campo | Valor Esperado | Critério de Reprovação |
|-------|---------------|----------------------|
| Registro existe | Sim | Thread não criada |
| `status` | `bot_active` (se bot ativo) ou `open` | Status inesperado |
| `contact_id` | Aponta para o contato criado em 4.1 | Vazio ou contato errado |
| `last_message_at` | Timestamp recente | Null |

### 4.3 Mensagem persistida

```sql
SELECT id, thread_id, direction, message_type, content,
       ig_message_id, ig_timestamp, created_at
FROM instagram_messages
WHERE thread_id = '<THREAD_ID>'
ORDER BY created_at DESC
LIMIT 5;
```

| Campo | Valor Esperado | Critério de Reprovação |
|-------|---------------|----------------------|
| Registro existe | Sim | Mensagem não persistida |
| `direction` | `inbound` | `outbound` ou valor legado |
| `message_type` | `text` (para DM de texto) | Tipo incorreto |
| `content` | Texto da mensagem enviada | Vazio ou incorreto |
| `ig_message_id` | ID único do Meta | Vazio |

---

## 5. Inbox Básica (UI)

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | No menu lateral, clique em **Instagram > Inbox** | Página de inbox carrega | Tela em branco ou erro |
| 2 | Verifique se a thread da DM recebida aparece na lista | Thread visível com preview da última mensagem | Lista vazia mesmo com dados no banco |
| 3 | Clique na thread | Janela de chat abre com o histórico de mensagens | Chat vazio ou erro ao carregar |
| 4 | Verifique que a mensagem recebida aparece como **bolha do lado esquerdo** (inbound) | Mensagem posicionada corretamente | Mensagem no lado errado ou não aparece |
| 5 | Verifique o nome/username do contato no painel | Nome/username corresponde ao remetente | Dados incorretos ou "Unknown" |
| 6 | Use o campo de **busca** para procurar pelo username | Thread aparece nos resultados | Busca não funciona ou não retorna nada |
| 7 | Use o **filtro por status** (se disponível) | Filtro aplica corretamente | Filtro não funciona |
| 8 | Verifique no **Console do navegador** (F12) que as queries fazem chamadas reais ao backend | Requests para `/rest/v1/instagram_threads`, `/rest/v1/instagram_messages` | Dados hardcoded/mockados sem chamadas reais |

| Sinal de Reprovação Global |
|---------------------------|
| Inbox renderiza dados mockados sem consultar o backend |
| Inbox não exibe threads que existem no banco |
| Console mostra erros de query ou RLS |

---

## 6. Envio pela Outbox

### 6.1 Enviar resposta de teste

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Na inbox, abra a thread da conversa | Chat carrega | — |
| 2 | Digite uma mensagem de teste no campo de composição | — | — |
| 3 | Clique em **Enviar** | Mensagem aparece como "enviando" e depois como "enviada" | Botão não funciona ou erro no console |

**Verificação SQL:**

```sql
-- Mensagem na outbox
SELECT id, thread_id, channel_id, content, status,
       idempotency_key, attempts, max_attempts,
       scheduled_at, sent_at, created_at
FROM instagram_outbox
WHERE channel_id = '<CHANNEL_ID>'
ORDER BY created_at DESC
LIMIT 5;
```

| Campo | Valor Esperado | Critério de Reprovação |
|-------|---------------|----------------------|
| Registro existe | Sim | Mensagem não entrou na outbox |
| `status` | `pending` → `sent` (após processamento) | Fica em `pending` indefinidamente |
| `idempotency_key` | Valor único (UUID ou hash) | Vazio ou duplicado |
| `attempts` | 1 (após envio bem-sucedido) | 0 (nunca tentou) |
| `sent_at` | Timestamp preenchido após envio | Null após envio |

```sql
-- Mensagem persistida no histórico
SELECT id, thread_id, direction, content, status
FROM instagram_messages
WHERE thread_id = '<THREAD_ID>'
  AND direction = 'outbound'
ORDER BY created_at DESC
LIMIT 1;
```

| Campo | Valor Esperado |
|-------|---------------|
| `direction` | `outbound` |
| `content` | Texto digitado |
| `status` | `sent` ou `delivered` |

---

## 7. Guardrails de Envio

### 7.1 Thread em spam

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Marque uma thread como spam via SQL: | — | — |
|   | `UPDATE instagram_threads SET status = 'spam' WHERE id = '<THREAD_ID>';` | — | — |
| 2 | Tente enviar uma mensagem nessa thread pela inbox | Sistema **impede** o envio com mensagem de erro | Mensagem enviada mesmo com thread em spam |

**Verificação SQL:**

```sql
-- Não deve haver novo registro na outbox
SELECT COUNT(*) FROM instagram_outbox
WHERE thread_id = '<THREAD_ID>'
  AND created_at > NOW() - INTERVAL '1 minute';
-- Deve retornar 0
```

### 7.2 Contato bloqueado

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Bloqueie um contato via SQL: | — | — |
|   | `UPDATE instagram_contacts SET is_blocked = true WHERE id = '<CONTACT_ID>';` | — | — |
| 2 | Tente enviar mensagem para esse contato | Sistema **impede** o envio | Mensagem enviada para contato bloqueado |

### 7.3 Fora da janela de 24h

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Manipule o `last_message_at` da thread para simular janela expirada: | — | — |
|   | `UPDATE instagram_threads SET last_inbound_at = NOW() - INTERVAL '25 hours' WHERE id = '<THREAD_ID>';` | — | — |
| 2 | Tente enviar mensagem nessa thread | Sistema **impede** o envio ou exibe aviso de janela expirada | Mensagem enviada fora da janela de 24h |

**Verificação SQL (para todos os guardrails):**

```sql
-- Event log deve registrar tentativas bloqueadas
SELECT * FROM instagram_event_log
WHERE channel_id = '<CHANNEL_ID>'
  AND event_type LIKE '%blocked%' OR event_type LIKE '%guardrail%'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 8. Retry e Dead Letter

### 8.1 Simular falha de envio

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Insira um registro na outbox com token inválido (simulando falha): | — | — |
|   | ```sql | — | — |
|   | INSERT INTO instagram_outbox (channel_id, thread_id, content, status, idempotency_key, max_attempts) | — | — |
|   | VALUES ('<CHANNEL_ID>', '<THREAD_ID>', 'Teste retry', 'pending', gen_random_uuid()::text, 3); | — | — |
|   | ``` | — | — |
| 2 | Invoque o dispatcher manualmente: | — | — |
|   | `curl -X POST https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-outbox-dispatch -H "Authorization: Bearer <SERVICE_ROLE_KEY>"` | — | — |
| 3 | Verifique que o `attempts` incrementou | — | — |

**Verificação SQL após cada tentativa:**

```sql
SELECT id, status, attempts, max_attempts, last_error,
       next_retry_at, created_at
FROM instagram_outbox
WHERE idempotency_key = '<KEY_INSERIDA>'
ORDER BY created_at DESC;
```

| Tentativa | `status` Esperado | `attempts` |
|-----------|------------------|-----------|
| 1ª falha | `retrying` ou `pending` | 1 |
| 2ª falha | `retrying` ou `pending` | 2 |
| 3ª falha | `dead_letter` ou `failed` | 3 |

### 8.2 Validar dead letter

| Campo | Valor Esperado | Critério de Reprovação |
|-------|---------------|----------------------|
| `status` | `dead_letter` ou `failed` | Continua tentando além do `max_attempts` |
| `attempts` | = `max_attempts` | `attempts` > `max_attempts` |
| `last_error` | Mensagem de erro descritiva | Vazio |

---

## 9. Healthcheck

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Na tela de Integrações, clique em **Verificar Saúde** (se disponível) ou invoque via curl: | — | — |
|   | `curl -X POST https://fsrgtnasverkkqkbnmzf.supabase.co/functions/v1/instagram-healthcheck -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -d '{"channel_id": "<CHANNEL_ID>"}'` | — | — |
| 2 | Verifique a resposta | — | — |

| Cenário | Resposta Esperada |
|---------|------------------|
| Token válido, conta ativa | `{ "healthy": true, "username": "..." }` |
| Token inválido | `{ "healthy": false, "error": "..." }`, status atualizado para `error` |

**Verificação SQL:**

```sql
SELECT id, status, last_healthcheck_at
FROM instagram_channels
WHERE id = '<CHANNEL_ID>';
-- last_healthcheck_at deve estar atualizado
```

---

## 10. Tela de Integração (UI)

| # | Passo | Resultado Esperado | Critério de Reprovação |
|---|-------|--------------------|-----------------------|
| 1 | Acesse **Integrações** | Página carrega | — |
| 2 | Verifique card do Instagram com status **Conectado** | Badge verde "Conectado" | Status incorreto |
| 3 | Verifique username exibido | Corresponde ao `instagram_username` do banco | Username errado ou ausente |
| 4 | Clique em **Desconectar** | Confirmação solicitada | Desconecta sem confirmação |
| 5 | Confirme a desconexão | Status muda para **Desconectado** | Status não muda |
| 6 | Verifique no banco que o canal foi removido ou marcado como `disconnected` | — | Canal continua `connected` |

---

## Checklist Resumo — Aprovação da Fase 1

| # | Critério | Status |
|---|----------|--------|
| 1 | OAuth conecta e retorna ao app com status `connected` | ⬜ |
| 2 | Token salvo com criptografia AES (prefixo `aes:`) | ⬜ |
| 3 | Canal vinculado ao `tenant_id` correto | ⬜ |
| 4 | Username correto exibido na UI | ⬜ |
| 5 | Múltiplas contas suportadas | ⬜ |
| 6 | Reconexão atualiza token e status | ⬜ |
| 7 | Refresh de token funciona via cron/manual | ⬜ |
| 8 | Webhook verificado pela Meta (GET challenge) | ⬜ |
| 9 | Webhook ingestado e persistido (POST) | ⬜ |
| 10 | Deduplicação de webhook funciona | ⬜ |
| 11 | Contato criado automaticamente | ⬜ |
| 12 | Thread criada automaticamente | ⬜ |
| 13 | Mensagem inbound persistida corretamente | ⬜ |
| 14 | Inbox exibe threads e mensagens reais (não mockadas) | ⬜ |
| 15 | Busca e filtros funcionam na inbox | ⬜ |
| 16 | Envio via outbox funciona | ⬜ |
| 17 | Guardrail: thread spam bloqueia envio | ⬜ |
| 18 | Guardrail: contato bloqueado impede envio | ⬜ |
| 19 | Guardrail: janela 24h impede envio fora do prazo | ⬜ |
| 20 | Retry incrementa tentativas | ⬜ |
| 21 | Dead letter após `max_attempts` | ⬜ |
| 22 | Healthcheck retorna status correto | ⬜ |
| 23 | Desconexão funciona pela UI | ⬜ |

**Regra de aprovação:** Todos os 23 critérios devem estar ✅ para aprovar a Fase 1.

---

## Notas Importantes

1. **OAuth só funciona nos domínios registrados** — O redirect do Facebook só aceita os domínios configurados nas env vars `FRONTEND_URL` e `FRONTEND_URL_APP` (ver `docs/DOMAIN_REFERENCE.md`). Testes de preview não completarão o OAuth.

2. **Conta externa obrigatória** — Para testar recebimento de DM, use uma conta do Instagram **diferente** da conectada.

3. **Logs das edge functions** — Em caso de falha, verifique os logs das functions no backend para mensagens como `[instagram-webhook] ❌` ou `[healthcheck]`.

4. **RLS** — Se queries SQL retornarem 0 resultados inesperadamente, verifique se está usando `service_role_key` (que bypassa RLS) ou se as políticas RLS estão corretas.
