# Regras de Tamanho de Arquivo

## Limites Recomendados

| Tipo | Limite (linhas) | Ação |
|------|----------------|------|
| Componente React (page) | 400 | Extrair sub-componentes |
| Componente React (shared) | 250 | Extrair lógica para hooks |
| Hook customizado | 200 | Separar por responsabilidade |
| Edge Function (index.ts) | 500 | Extrair para `_shared/` |
| Shared helper (`_shared/`) | 300 | Dividir por domínio |
| Utilitário/helper | 150 | Dividir por domínio |

## Como Aplicar

1. **Novos arquivos**: seguir os limites acima
2. **Arquivos existentes**: refatorar quando houver mudança funcional no arquivo
3. **CI**: o script `scripts/check-file-sizes.ts` bloqueia PRs com violações críticas (>150% do limite)
4. **Regra de ouro**: se for alterar um arquivo que já está acima do limite, **extraia antes de adicionar**

## Tipagem

- **Proibido**: `any` em fluxos críticos (auth, pagamento, webhook)
- **Tolerado**: `any` com comentário justificando em integrações com APIs externas sem tipos
- **Preferido**: `unknown` + type guard quando o tipo real não é conhecido

---

## Backlog de Decomposição — Priorizado

> Atualizado: 2026-03-23
> Fonte: `scripts/check-file-sizes.ts` + contagem manual
> Total de violadores: ~80 arquivos

### 🔴 Tier 1 — Críticos (≥3x limite) — 15 arquivos

Estes são os maiores riscos de manutenção. Devem ser decompostos com prioridade.

| # | Arquivo | Linhas | Limite | Razão | Owner | Plano de Decomposição |
|---|---------|--------|--------|-------|-------|----------------------|
| 1 | `supabase/functions/ai-chat/index.ts` | 2771 | 500 | 5.5x | @backend | Extrair: `_shared/ai-chat-verification.ts` (CPF/pedido ~800L), `_shared/ai-chat-response-builder.ts` (~400L), `_shared/ai-chat-conversation.ts` (~300L). Parcialmente modularizado. |
| 2 | `supabase/functions/whatsapp-webhook/index.ts` | 1853 | 500 | 3.7x | @backend | Extrair: `_shared/wa-webhook-status-handler.ts` (~400L), `_shared/wa-webhook-media-handler.ts` (~300L), `_shared/wa-webhook-routing.ts` (~300L). |
| 3 | `src/components/sales/BlingOrderDetailsDialog.tsx` | 870 | 250 | 3.5x | @frontend | Extrair: `BlingOrderItems`, `BlingOrderShipping`, `BlingOrderPayment` como sub-componentes |
| 4 | `src/components/products/BlingProductsContent.tsx` | 870 | 250 | 3.5x | @frontend | Extrair: `BlingProductFilters`, `BlingProductTable`, `BlingProductActions` |
| 5 | `src/components/envios/EnviosContent.tsx` | 862 | 250 | 3.4x | @frontend | Extrair: `EnviosList`, `EnviosFilters`, `EnviosActions` |
| 6 | `src/components/email-marketing/EmailCampaignFormDialog.tsx` | 847 | 250 | 3.4x | @frontend | Extrair: `EmailEditorTab`, `EmailRecipientsTab`, `EmailScheduleTab` |
| 7 | `src/components/sales/SalesContent.tsx` | 817 | 250 | 3.3x | @frontend | Extrair filtros e tabela em sub-componentes |
| 8 | `supabase/functions/_shared/li-sync-orders.ts` | 967 | 300 | 3.2x | @backend | Extrair: `li-sync-orders-upsert.ts`, `li-sync-orders-transform.ts` |
| 9 | `supabase/functions/melhor-envio/index.ts` | 1530 | 500 | 3.1x | @backend | Extrair: `_shared/melhor-envio-cart.ts` (~400L), `_shared/melhor-envio-tracking.ts` (~300L), `_shared/melhor-envio-checkout.ts` (~300L). |
| 10 | `src/components/dashboard/IntegrationCard.tsx` | 768 | 250 | 3.1x | @frontend | Extrair card por tipo de integração |
| 11 | `src/hooks/useMelhorEnvio.ts` | 618 | 200 | 3.1x | @frontend | Extrair: `useMelhorEnvioAuth`, `useMelhorEnvioShipments`, `useMelhorEnvioStats` |
| 12 | `src/components/automations/OrderNotificationConfigDialog.tsx` | 752 | 250 | 3.0x | @frontend | Extrair tabs do form |
| 13 | `src/components/atendimentos/settings/AIAgentBuilder.tsx` | 751 | 250 | 3.0x | @frontend | Extrair seções do builder |
| 14 | `src/components/envios/ShipmentDetailsDialog.tsx` | 750 | 250 | 3.0x | @frontend | Extrair sub-seções (timeline, detalhes, ações) |
| 15 | `src/components/coupons/CouponsContent.tsx` | 749 | 250 | 3.0x | @frontend | Extrair tabela e filtros |

### 🟠 Tier 2 — Altos (2x–3x limite) — 25 arquivos

Devem ser decompostos quando houver mudança funcional no arquivo.

| # | Arquivo | Linhas | Limite | Razão | Próxima ação |
|---|---------|--------|--------|-------|-------------|
| 1 | `src/components/products/ProductDetailsDialog.tsx` | 683 | 250 | 2.7x | Extrair tabs |
| 2 | `src/components/instagram/automations/NodeConfigPanel.tsx` | 670 | 250 | 2.7x | Extrair config por tipo de nó |
| 3 | `src/components/clients/BlingClientsContent.tsx` | 649 | 250 | 2.6x | Extrair tabela e filtros |
| 4 | `src/components/integrations/EvolutionWhatsAppDialog.tsx` | 648 | 250 | 2.6x | Extrair steps do wizard |
| 5 | `src/components/ui/sidebar.tsx` | 637 | 250 | 2.5x | Extrair sub-componentes (menu, footer, trigger) |
| 6 | `src/components/clients/ClientsContent.tsx` | 635 | 250 | 2.5x | Extrair tabela e filtros |
| 7 | `src/components/products/BlingProductDetailsDialog.tsx` | 631 | 250 | 2.5x | Extrair tabs |
| 8 | `src/components/atendimentos/settings/ChatbotBuilder.tsx` | 618 | 250 | 2.5x | Extrair seções |
| 9 | `supabase/functions/_shared/whatsapp-sender.ts` | 744 | 300 | 2.5x | Extrair formatação de mensagem |
| 10 | `supabase/functions/_shared/li-sync-carts.ts` | 678 | 300 | 2.3x | Extrair transform/upsert |
| 11 | `src/components/email-marketing/editor/EmailEditor.tsx` | 551 | 250 | 2.2x | Extrair toolbar e canvas |
| 12 | `src/components/bulk-campaigns/CreateCampaignDialog.tsx` | 542 | 250 | 2.2x | Extrair steps |
| 13 | `src/components/integrations/EmailIntegrationDialog.tsx` | 538 | 250 | 2.2x | Extrair form sections |
| 14 | `src/components/automations/AutomationTemplatesLibrary.tsx` | 536 | 250 | 2.1x | Extrair cards e filtros |
| 15 | `src/components/catalogo/CatalogoContent.tsx` | 514 | 250 | 2.1x | Extrair tabela |
| 16 | `src/hooks/useBlingSync.ts` | 403 | 200 | 2.0x | Separar por tipo de sync |
| 17 | `supabase/functions/_shared/ai-chat-context.ts` | 608 | 300 | 2.0x | Extrair por tipo de contexto |
| 18 | `src/components/email-marketing/editor/BlockPropertiesPanel.tsx` | 497 | 250 | 2.0x | Extrair por tipo de bloco |
| 19 | `src/components/atendimentos/CatalogPickerDialog.tsx` | 488 | 250 | 2.0x | Extrair grid e preview |
| 20 | `supabase/functions/bling-webhooks/index.ts` | 944 | 500 | 1.9x | Extrair handlers por recurso |
| 21 | `supabase/functions/rfm-calculator/index.ts` | 869 | 500 | 1.7x | Extrair scoring e segmentação |
| 22 | `supabase/functions/bling-products-job-processor/index.ts` | 868 | 500 | 1.7x | Extrair sync de variações |
| 23 | `src/hooks/useMelhorEnvioSync.ts` | 362 | 200 | 1.8x | Extrair progress tracking |
| 24 | `src/hooks/useDashboardStats.ts` | 347 | 200 | 1.7x | Extrair transformers |
| 25 | `src/components/clients/BlingClientDetailsDialog.tsx` | 455 | 250 | 1.8x | Extrair tabs |

### 🟡 Tier 3 — Acima do limite (1x–2x) — ~40 arquivos

Congelar crescimento. Decomposição oportunista quando tocar no arquivo.

Principais (parcial):

| Arquivo | Linhas | Limite | Razão |
|---------|--------|--------|-------|
| `src/pages/Integrations.tsx` | 732 | 400 | 1.8x |
| `src/pages/Team.tsx` | 636 | 400 | 1.6x |
| `src/pages/InstagramAutomations.tsx` | 615 | 400 | 1.5x |
| `supabase/functions/me-job-processor/index.ts` | 788 | 500 | 1.6x |
| `supabase/functions/bling-job-processor/index.ts` | 756 | 500 | 1.5x |
| `supabase/functions/instagram-webhook-worker/index.ts` | 738 | 500 | 1.5x |
| `supabase/functions/email-campaign-send/index.ts` | 731 | 500 | 1.5x |
| `supabase/functions/li-sync/index.ts` | 695 | 500 | 1.4x |
| `supabase/functions/li-cashback/index.ts` | 679 | 500 | 1.4x |
| `supabase/functions/bot-engine/index.ts` | 825 | 500 | 1.6x |
| `src/components/layout/Sidebar.tsx` | 431 | 250 | 1.7x |
| `src/components/sales/AddStoreConnectionDialog.tsx` | 430 | 250 | 1.7x |
| `src/components/email-marketing/EmailCampaignList.tsx` | 419 | 250 | 1.7x |
| `src/components/clients/ClientDetailsDialog.tsx` | 419 | 250 | 1.7x |
| `src/components/advanced/UnifiedInboxView.tsx` | 418 | 250 | 1.7x |
| ... e mais ~25 arquivos entre 1.0x–1.5x |

---

## Governança Contínua

### Processo

1. **CI Gate**: `scripts/check-file-sizes.ts` roda no CI e **bloqueia** merge quando há violações críticas (>150% do limite)
2. **Growth Guard**: `.lovable/file-sizes-snapshot.json` impede que arquivos acima do limite cresçam ainda mais
3. **Regra de PR**: PRs que tocam arquivos Tier 1 ou Tier 2 devem incluir pelo menos uma extração
4. **Sprint cadence**: decompor 2–3 arquivos Tier 1 por sprint até zerar

### Métricas de progresso

| Data | Tier 1 | Tier 2 | Tier 3 | Total |
|------|--------|--------|--------|-------|
| 2026-03-23 | 15 | 25 | ~40 | ~80 |

### Próximos passos imediatos

1. **ai-chat/index.ts** (5.5x) — maior risco; extrair verificação e response builder
2. **whatsapp-webhook/index.ts** (3.7x) — extrair status handler e media handler
3. **BlingOrderDetailsDialog.tsx** (3.5x) — extrair sub-componentes de items/shipping/payment
4. **BlingProductsContent.tsx** (3.5x) — extrair filtros e tabela
5. **EnviosContent.tsx** (3.4x) — extrair lista e filtros
