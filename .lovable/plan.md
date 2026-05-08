

# Instagram no Menu Comunicação — Auto-DM para Novos Seguidores

## Contexto

O backend já possui toda a infraestrutura necessária:
- **Webhook worker** detecta eventos de `follow` e chama `instagram-experimental-trigger`
- **Tabela `instagram_follow_dm_configs`** armazena configuração (welcome_text, delay_seconds, once_per_user, is_active)
- **Tabela `instagram_feature_flags`** controla feature flags por canal
- **Tabela `instagram_experimental_executions`** rastreia deduplicação
- **`instagram-experimental-trigger`** executa o envio via `instagram-send-message`

**Problema crítico**: O `instagram-send-message` valida janelas de mensagem (standard_window / human_window). Para novos seguidores que nunca enviaram mensagem, essas janelas não existem — o envio seria bloqueado. Precisamos criar um bypass para mensagens do tipo `follow_to_dm`.

**Limitação da API Meta**: A API de Mensagens do Instagram permite enviar DMs para novos seguidores, mas **somente se o seguidor ainda não te bloqueou e a conta tem a permissão `instagram_manage_messages`**. A janela de follow-to-DM é curta (geralmente poucos minutos após o follow). Se o contato nunca enviou mensagem, pode não haver thread — o trigger precisa criar uma.

## Plano de Implementação

### 1. Nova página `src/pages/InstagramComunicacao.tsx`
- Aba no menu **Comunicação** com ícone Instagram
- Exibe estado da conexão (usa `useInstagramChannel`)
- Se não conectado: mostra CTA para ir em Integrações e conectar
- Se conectado: mostra painel de configuração de "Auto-DM para Novos Seguidores"

### 2. Componente `FollowToDmConfig`
- Toggle ativar/desativar
- Campo de texto para mensagem de boas-vindas (com preview)
- Slider para delay em segundos (0-60s)
- Toggle "Enviar apenas uma vez por usuário"
- Salva em `instagram_follow_dm_configs` + ativa feature flag `follow_to_dm` em `instagram_feature_flags`

### 3. Fix no `instagram-send-message` (backend)
- Adicionar bypass da validação de janela para mensagens com `idempotency_key` que começa com `follow_dm_`
- OU: criar rota interna separada no experimental-trigger que envia diretamente via API Meta sem passar pelo send-message (mais seguro)

### 4. Fix no `instagram-experimental-trigger`
- Quando não existe thread para o novo seguidor, **criar a thread** antes de enviar a mensagem
- Garantir que o envio direto via API Meta funcione para contatos sem janela de mensagem ativa

### 5. Rota e Sidebar
- Adicionar rota `/instagram` em `App.tsx`
- Adicionar item "Instagram" no grupo **Comunicação** do `Sidebar.tsx`

### 6. Migration (se necessário)
- Verificar se `instagram_follow_dm_configs` e `instagram_feature_flags` já possuem RLS adequada (já possuem)
- Nenhuma migration nova necessária — tabelas já existem

---

### Detalhes Técnicos

**Arquivos a criar:**
- `src/pages/InstagramComunicacao.tsx` — página principal
- `src/components/instagram/FollowToDmConfig.tsx` — painel de config

**Arquivos a editar:**
- `src/App.tsx` — nova rota `/instagram`
- `src/components/layout/Sidebar.tsx` — item no menu Comunicação
- `supabase/functions/instagram-experimental-trigger/index.ts` — criar thread quando não existe + enviar via API Meta diretamente (bypass do send-message)

**Fluxo do envio:**
```text
Novo seguidor → Webhook → processFollowEvent → experimental-trigger
  → Verifica capability (follow_to_dm) ✓
  → Verifica feature flag ✓
  → Busca config ativa ✓
  → Dedup (once_per_user) ✓
  → Delay configurado
  → Cria thread se não existe
  → Envia DM via API Meta diretamente (sem check de janela)
  → Log em experimental_executions
```

