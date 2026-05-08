# Plano de Correção em Fases — Spy Pro CRM

> Cada fase deve ser implementada e validada antes de avançar para a próxima.

---

## FASE 1 — Bugs Críticos & Estabilidade ⚡
> **Objetivo:** Corrigir tudo que está quebrado ou pode quebrar em produção.
> **Estimativa:** 1 sessão

### 1.1 Fix AuthContext `.single()` → `.maybeSingle()`
- Arquivo: `src/contexts/AuthContext.tsx`
- Query de `team_members` retorna erro 406 para owners sem registro

### 1.2 Adicionar `.limit()` em queries dos dashboards
- `AttendanceDashboard.tsx` — conversations e messages sem limite
- `SalesAnalyticsDashboard.tsx` — li_orders, bling_orders, items sem limite
- `CampaignAnalyticsDashboard.tsx` — bulk_campaigns, coupons, executions sem limite

### 1.3 Fix deps de useEffect nos dashboards
- Corrigir warnings de dependências faltantes nos 3 dashboards da Fase 4

**Critério de aceite:** Zero erros no console, login funciona para owners e membros.

---

## FASE 2 — Performance & React Query 🚀
> **Objetivo:** Migrar data fetching para React Query, eliminando re-fetches desnecessários.
> **Estimativa:** 1 sessão

### 2.1 Migrar AttendanceDashboard para useQuery
- Hook: `useAttendanceStats(tenantId)`
- Query key: `['attendance-stats', tenantId]`

### 2.2 Migrar SalesAnalyticsDashboard para useQuery
- Hook: `useSalesAnalytics(tenantId)`
- Query key: `['sales-analytics', tenantId]`

### 2.3 Migrar CampaignAnalyticsDashboard para useQuery
- Hook: `useCampaignAnalytics(tenantId)`
- Query key: `['campaign-analytics', tenantId]`

**Critério de aceite:** Navegar entre tabs do dashboard não re-fetcha dados. Cache funciona.

---

## FASE 3 — Design System & Tokens Semânticos 🎨
> **Objetivo:** Eliminar cores hardcoded e garantir consistência visual + dark mode.
> **Estimativa:** 1 sessão

### 3.1 Corrigir cores nos componentes da Fase 5
- `SetupChecklist.tsx` — trocar `text-green-500`, `bg-green-100` etc.
- `OnboardingTour.tsx` — trocar `bg-blue-500`, `text-blue-600` etc.
- `NotificationSettings.tsx` — cores diretas
- `ChangelogDialog.tsx` — cores diretas

### 3.2 Corrigir cores nos componentes da Fase 6
- `UnifiedInboxView.tsx`
- `AdvancedCRM.tsx`
- `WebhooksApiConfig.tsx`
- `WhiteLabelSettings.tsx`

### 3.3 Corrigir aviso amarelo no Settings
- `Settings.tsx` linha 203 — `text-yellow-600` → `text-warning` ou `text-accent-foreground`

**Critério de aceite:** Nenhum `text-{color}-{number}` ou `bg-{color}-{number}` hardcoded nos componentes das Fases 5 e 6. Dark mode consistente.

---

## FASE 4 — Refatoração de Componentes Grandes 🏗️
> **Objetivo:** Quebrar arquivos monolíticos em componentes menores e focados.
> **Estimativa:** 1 sessão

### 4.1 Refatorar Automations.tsx (~870 linhas)
- Extrair: `AutomationCard`, `AutomationStatusBadge`, `AutomationConfigSection`
- Página principal vira orquestradora

### 4.2 Avaliar e limpar imports não utilizados
- Verificar imports mortos em todos os arquivos editados nas Fases 1-6

**Critério de aceite:** Nenhum arquivo de página com mais de 400 linhas. Build limpo sem warnings.

---

## FASE 5 — UX: Busca Global & Persistência ✨
> **Objetivo:** Fazer funcionar features que estão decorativas.
> **Estimativa:** 1 sessão

### 5.1 Busca global do header
- Opção A: Implementar busca real (conversas, clientes, pedidos)
- Opção B: Remover input para não confundir o usuário
- Decisão a tomar no início da fase

### 5.2 Persistir preferências de notificação no banco
- Criar coluna `notification_prefs` (jsonb) na tabela `profiles`
- Migrar `useWebNotifications.ts` para ler/salvar no banco

### 5.3 Persistir progresso do onboarding no banco
- Criar coluna `onboarding_completed` (boolean) na tabela `profiles`
- Migrar `OnboardingTour.tsx` para usar banco ao invés de localStorage

**Critério de aceite:** Preferências sincronizam entre navegadores. Tour não reaparece após completado em outro dispositivo.

---

## FASE 6 — Backend para Módulos Avançados 🗄️
> **Objetivo:** Conectar os módulos da Fase 6 (atualmente mockados) ao banco real.
> **Estimativa:** 3-4 sessões (subdivididas)

### 6A — CRM Avançado (1 sessão)
- Criar tabelas: `custom_fields`, `custom_field_values`, `dynamic_segments`
- RLS multi-tenant
- Conectar `AdvancedCRM.tsx` ao banco

### 6B — Webhooks & API (1 sessão)
- Criar tabelas: `webhook_configs`, `api_keys`
- RLS multi-tenant
- Conectar `WebhooksApiConfig.tsx` ao banco
- Gerar/validar API keys reais

### 6C — White Label (1 sessão)
- Criar tabela: `tenant_branding` (logo, cores, favicon, powered_by, custom_domain)
- RLS multi-tenant
- Conectar `WhiteLabelSettings.tsx` ao banco
- Storage bucket para logos

### 6D — Inbox Unificado (1 sessão)
- Conectar `UnifiedInboxView.tsx` a dados reais de conversations (WA + IG)
- Implementar merge de contatos
- Regras de roteamento

**Critério de aceite:** Cada módulo persiste dados reais. CRUD funcional com RLS.

---

## FASE 7 — Polish & Empty States 💎
> **Objetivo:** Polimento final e tratamento de edge cases.
> **Estimativa:** 1 sessão

### 7.1 Empty states para módulos Fase 6
- Telas vazias bonitas com CTAs quando não há dados

### 7.2 Changelog dinâmico
- Mover changelog para tabela ou JSON externo

### 7.3 SetupChecklist mais preciso
- Queries mais específicas para cada step do checklist

### 7.4 Revisão final
- Teste de fluxo completo: signup → onboarding → integração → uso
- Validação mobile

**Critério de aceite:** Todos os fluxos principais funcionam sem erros. UX polida.

---

## Resumo

| Fase | Foco | Esforço | Dependência |
|------|-------|---------|-------------|
| 1 | Bugs Críticos | ⚡ 1 sessão | Nenhuma |
| 2 | React Query | 🚀 1 sessão | Fase 1 |
| 3 | Design Tokens | 🎨 1 sessão | Nenhuma |
| 4 | Refatoração | 🏗️ 1 sessão | Nenhuma |
| 5 | Busca & Persistência | ✨ 1 sessão | Fase 1 |
| 6 | Backend Fase 6 | 🗄️ 3-4 sessões | Fase 1 |
| 7 | Polish | 💎  1 sessão | Todas |

**Total: ~9-11 sessões**

---

> Diga "implementa fase X" para começar qualquer fase!
