# SPY PRO CRM - Edge Functions (87 funções)

> Gerado em: 2026-03-09  
> Todas as funções são deployadas automaticamente via Lovable Cloud.

## Resumo por Módulo

| Módulo | Quantidade | Funções |
|--------|-----------|---------|
| WhatsApp | 8 | bot-engine, evolution-api, message-queue-processor, process-outbound-queue, send-message, whatsapp-send-catalog, whatsapp-webhook, get-store-statuses |
| Instagram | 37 | instagram-* (ver lista completa abaixo) |
| Loja Integrada | 7 | li-cashback, li-coupon-create, li-coupon-sync, li-job-processor, li-reconciliation-processor, li-sync, li-validate, li-webhook |
| Bling | 6 | bling-job-processor, bling-oauth, bling-products-job-processor, bling-stores, bling-sync, bling-webhooks |
| Melhor Envio | 3 | me-job-processor, melhor-envio, melhor-envio-webhook |
| Email Marketing | 5 | email-campaign-scheduler, email-campaign-send, email-campaign-send-test, email-unsubscribe, send-email |
| AI/Chat | 4 | ai-assist, ai-buffer-processor, ai-chat, ai-provider-validate |
| Automações | 4 | birthday-processor, bulk-campaign-processor, bulk-campaign-scheduler, cashback-reminder-processor |
| WhatsApp Atendimento | 1 | conversation-inactivity-processor |
| RFM | 2 | rfm-calculator, rfm-cron-trigger |
| LI Status | 1 | bulk-status-update-li |
| Equipe/Auth | 2 | create-team-member, delete-account |

---

## Lista Completa (87 funções)

### Core / Auth
1. `create-team-member` — Cria membro de equipe com verificação admin e custo em tokens
2. `delete-account` — Exclusão de conta do usuário

### AI / Chat
3. `ai-assist` — Assistente AI para sugestões inline
4. `ai-buffer-processor` — Processa buffer de mensagens para resposta AI agrupada (cron: */3 min)
5. `ai-chat` — Chat com IA para geração de conteúdo
6. `ai-provider-validate` — Valida credenciais de provedores AI

### WhatsApp
7. `bot-engine` — Motor de chatbot com árvore de decisão
8. `evolution-api` — Proxy para Evolution API (conexão WhatsApp)
9. `get-store-statuses` — Verifica status de conexão das lojas
10. `message-queue-processor` — Processa fila de mensagens multi-canal (cron: */1 min)
11. `process-outbound-queue` — Despacha mensagens da fila de saída (cron: */1 min)
12. `send-message` — Envia mensagem WhatsApp individual
13. `whatsapp-send-catalog` — Envia catálogo de produtos via WhatsApp
14. `whatsapp-webhook` — Recebe webhooks do WhatsApp/Evolution API

### Campanhas WhatsApp
15. `bulk-campaign-processor` — Processa envio de campanha em massa
16. `bulk-campaign-scheduler` — Verifica campanhas agendadas (cron: */3 min)

### Atendimento
17. `conversation-inactivity-processor` — Encerra conversas inativas (cron: */5 min)

### Loja Integrada
18. `li-cashback` — Gera cupons de cashback
19. `li-coupon-create` — Cria cupom na Loja Integrada
20. `li-coupon-sync` — Sincroniza cupons
21. `li-job-processor` — Processador de sync jobs LI (cron: */5 min)
22. `li-reconciliation-processor` — Reconciliação de status de pedidos (cron: */3 min)
23. `li-sync` — Sync manual/inicial de dados LI
24. `li-validate` — Valida credenciais LI
25. `li-webhook` — Recebe webhooks da Loja Integrada
26. `bulk-status-update-li` — Atualização em massa de status LI

### Bling
27. `bling-job-processor` — Processador de sync jobs Bling (cron: */3 min)
28. `bling-oauth` — OAuth flow do Bling
29. `bling-products-job-processor` — Sync de produtos Bling (cron: */5 min)
30. `bling-stores` — Lista lojas do Bling
31. `bling-sync` — Sync manual/inicial Bling
32. `bling-webhooks` — Recebe webhooks do Bling

### Melhor Envio
33. `me-job-processor` — Processador de sync jobs ME (cron: */5 min)
34. `melhor-envio` — OAuth e operações Melhor Envio
35. `melhor-envio-webhook` — Recebe webhooks do Melhor Envio

### Email Marketing
36. `email-campaign-scheduler` — Verifica campanhas agendadas (cron: */3 min)
37. `email-campaign-send` — Envia campanha de email (suporta service_role para agendamento)
38. `email-campaign-send-test` — Envia email de teste
39. `email-unsubscribe` — Processa unsubscribe de email
40. `send-email` — Envia email individual via SMTP

### Cashback / Birthday
41. `birthday-processor` — Processa aniversariantes (cron: horário)
42. `cashback-reminder-processor` — Envia lembretes de cashback (cron: horário)

### RFM
43. `rfm-calculator` — Calcula scores RFM para um tenant
44. `rfm-cron-trigger` — Trigger diário de cálculo RFM (cron: 7h)

### Instagram (37 funções)
45. `instagram-backfill-contacts` — Preenche contatos históricos
46. `instagram-block-user` — Bloqueia usuário no Instagram
47. `instagram-cancel-run` — Cancela execução de flow
48. `instagram-create-cta-link` — Cria link CTA rastreável
49. `instagram-dead-letter-retry` — Reprocessa mensagens dead-letter
50. `instagram-delete-comment` — Deleta comentário
51. `instagram-experimental-trigger` — Trigger experimental
52. `instagram-flow-resume-worker` — Resume flows pausados
53. `instagram-flow-runner` — Executa flow nodes
54. `instagram-generate-deep-link` — Gera deep links
55. `instagram-generate-flow-draft-ai` — Gera draft de flow via AI
56. `instagram-healthcheck` — Verifica saúde da conexão
57. `instagram-hide-comment` — Oculta comentário
58. `instagram-install-quick-automation` — Instala automação rápida
59. `instagram-list-quick-automations` — Lista automações rápidas disponíveis
60. `instagram-manual-token` — Configura token manual
61. `instagram-metrics-rollup` — Agrega métricas diárias (cron: horário)
62. `instagram-move-thread-to-spam` — Move thread para spam
63. `instagram-oauth-callback` — Callback OAuth Instagram
64. `instagram-oauth` — Inicia OAuth Instagram
65. `instagram-outbox-dispatch` — Despacha mensagens do outbox (cron: */1 min)
66. `instagram-pause-contact-automations` — Pausa automações de contato
67. `instagram-publish-content` — Publica conteúdo no Instagram
68. `instagram-publish-flow-version` — Publica versão de flow
69. `instagram-refresh-token` — Renova tokens (cron: diário 3h)
70. `instagram-resume-contact-automations` — Resume automações de contato
71. `instagram-save-contact-data` — Salva dados coletados de contato
72. `instagram-schedule-content` — Agenda publicação de conteúdo
73. `instagram-seed-test-flows` — Cria flows de teste
74. `instagram-send-comment-reply` — Responde comentário publicamente
75. `instagram-send-message` — Envia DM no Instagram
76. `instagram-send-private-reply` — Envia resposta privada a comentário
77. `instagram-sync-insights` — Sincroniza insights de mídia
78. `instagram-track-cta-click` — Rastreia clique em CTA
79. `instagram-trigger-dispatcher` — Despacha triggers de flow
80. `instagram-unblock-user` — Desbloqueia usuário
81. `instagram-upsert-ice-breakers` — Configura ice breakers
82. `instagram-upsert-persistent-menu` — Configura menu persistente
83. `instagram-upsert-welcome-ad-flow` — Configura flow de welcome ad
84. `instagram-validate-collected-data` — Valida dados coletados
85. `instagram-webhook-ingest` — Recebe webhooks do Instagram
86. `instagram-webhook-worker` — Processa webhooks em fila (cron: */1 min)

### Shared Modules (_shared/)
- `email-html-generator.ts` — Gerador de HTML para emails
- `email-sender.ts` — Módulo de envio SMTP
- `email-variable-replacer.ts` — Substituição de variáveis em templates
- `ig-crypto.ts` — Criptografia de tokens Instagram
- `ig-token-resolver.ts` — Resolução de tokens Instagram
- `li-status-sync.ts` — Sincronização de status LI
- `whatsapp-sender.ts` — Módulo de envio WhatsApp

---

## Segredos Necessários (27)

| Segredo | Descrição |
|---------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role do Supabase |
| `SUPABASE_DB_URL` | URL de conexão direta ao banco |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publicável |
| `CRON_SECRET` | Segredo para autenticação de cron jobs |
| `LOVABLE_API_KEY` | Chave API do Lovable (AI proxy) |
| `EVOLUTION_API_URL` | URL da Evolution API (WhatsApp) |
| `EVOLUTION_API_KEY` | Chave da Evolution API |
| `LOJA_INTEGRADA_API_KEY` | Chave API Loja Integrada |
| `LOJA_INTEGRADA_APP_KEY` | App Key Loja Integrada |
| `LI_WEBHOOK_SECRET` | Segredo para webhooks LI |
| `BLING_CLIENT_ID` | Client ID OAuth Bling |
| `BLING_CLIENT_SECRET` | Client Secret OAuth Bling |
| `MELHOR_ENVIO_CLIENT_ID` | Client ID OAuth Melhor Envio |
| `MELHOR_ENVIO_CLIENT_SECRET` | Client Secret OAuth Melhor Envio |
| `MELHOR_ENVIO_ENVIRONMENT` | Ambiente ME (sandbox/production) |
| `MELHOR_ENVIO_WEBHOOK_SECRET` | Segredo para webhooks ME |
| `META_APP_ID` | App ID do Meta (Instagram) |
| `META_APP_SECRET` | App Secret do Meta |
| `META_WEBHOOK_VERIFY_TOKEN` | Token de verificação de webhook Meta |
| `INSTAGRAM_APP_ID` | App ID do Instagram |
| `INSTAGRAM_APP_SECRET` | App Secret do Instagram |
| `VITE_META_APP_ID` | App ID Meta (frontend) |
| `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | Config ID do Embedded Signup |
| `CHATWOOT_PLATFORM_URL` | URL da plataforma Chatwoot |
| `CHATWOOT_PLATFORM_TOKEN` | Token da plataforma Chatwoot |
| `N8N_WEBHOOK_URL` | URL de webhook do n8n |

---

## Storage Buckets

| Bucket | Público | Descrição |
|--------|---------|-----------|
| `campaign-media` | Não | Mídia de campanhas WhatsApp |
| `whitelabel-assets` | Sim | Logos e favicons de white label |
