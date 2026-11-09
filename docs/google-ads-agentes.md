# Google Ads Manager: plano dos agentes

Plano de quais agentes o módulo precisa e como construir cada um. Escrito em 2026-11-09 a partir do estado real da conta (consultas somente leitura à Google Ads API). Quem for implementar: siga a ordem da seção 6 e as especificações da seção 4. O que é suposição está marcado como **SUPOSIÇÃO**.

## 1. Estado real da conta e diagnóstico das campanhas ativas

Conta `522-006-3897` (Chronic ®, BRL, America/Sao_Paulo), MCC `966-744-0809`. 44 campanhas: 32 pausadas, 10 removidas, **2 ativas**. As 2 ativas não gastam desde janeiro de 2026.

### Causa mais provável: o limite de gastos da conta (account budget) foi totalmente consumido

| Evidência (API, 2026-11-09) | Valor |
|---|---|
| `campaign.serving_status` das 2 ativas | `SUSPENDED` |
| `campaign.primary_status` | `LIMITED` (motivos vêm como `UNKNOWN`: a API não expõe o motivo exato) |
| `account_budget.adjusted_spending_limit` | R$ 131.520,33 |
| `account_budget.amount_served` | R$ 131.520,33 (**igual ao limite**) |
| Última elevação do limite (proposta aprovada) | 2025-12-16, de R$ 130.970,09 para R$ 131.470,09 (+R$ 500) |
| Padrão das elevações | +R$ 500 por proposta, a cada ~5 a 7 dias, de 2025-10-21 a 2025-12-16 (10 propostas aprovadas; a API não informa quem as criou) |
| Gasto mensal das 2 campanhas | out R$ 959,80 · nov R$ 2.175,17 · dez R$ 1.605,68 · jan R$ 0,20 |
| Último dia com métrica | 2026-01-13 |

O que NÃO é o problema (verificado): conta `ENABLED`, `test_account=false`; faturamento (`billing_setup`) `APPROVED`; orçamentos diários ativos (R$ 400 e R$ 190); anúncios e palavras-chave aprovados; grupo de recursos do PMax ativo e com força `GOOD`.

**Leitura:** o padrão de +R$ 500 a cada poucos dias sugere recargas de saldo (pagamento manual/pré-pago), mas isso é inferência: a API não diz como o limite foi elevado. Quando o limite da conta chegou ao valor já gasto, o Google suspendeu a entrega. Ninguém repôs o saldo depois de 2025-12-16.
**Confirmado pelo usuário em 2026-11-09: o saldo está zerado.** A solução é repor saldo (ação humana na interface do Google; **SUPOSIÇÃO:** a recarga não passa pela API neste tipo de conta).

**Risco ao repor o saldo:** as duas campanhas continuam `ENABLED` com orçamentos diários de R$ 400 (PMax) e R$ 190 (pesquisa de marca), somando R$ 590/dia, e o Google pode gastar até o dobro do orçamento diário em um dia. Com R$ 1.000 de verba, ao repor o saldo sem mexer nisso, **o dinheiro pode acabar em 2 dias**. Antes de repor, reduzir os orçamentos diários ou pausar uma das campanhas (decisão do usuário; o módulo ainda está em `read_only`).

### Achados secundários (hipóteses a verificar, não conclusões)

- Metas de conversão: várias ações **primárias** irrelevantes para e-commerce (instalações Android, ligações de campanha inteligente) ao lado de "Compra Use Chronic". Isso pode distorcer lances de "maximizar valor de conversão". Verificar se estão no objetivo da campanha.
- As ações de conversão do GA4 estão `HIDDEN`: confirmar se a medição ainda passa pelo GA4 ou só pela tag do site.
- O PMax tem um grupo de recursos `REMOVED` ("#Loja Integrada") e outro ativo: confirmar se o catálogo/feed de produtos está ligado.
- 10 campanhas removidas e 32 pausadas: possível ruído a limpar na visão.

## 2. Decisões que o módulo precisa apoiar

| # | Decisão | Frequência | Custo de errar | Dado necessário |
|---|---|---|---|---|
| D1 | A conta está entregando? Se não, por quê? | diária | **alto** (dinheiro parado/vendas perdidas) | status de entrega, saldo, faturamento, aprovação de anúncios |
| D2 | O saldo vai acabar? Quando repor? | diária | **alto** | limite, gasto acumulado, gasto médio diário |
| D3 | O que melhorou/piorou e por quê? | semanal | baixo | métricas diárias por campanha |
| D4 | Quanto investir e onde? | semanal | médio/alto | CPA/ROAS vs meta, retorno marginal |
| D5 | Os números de conversão são confiáveis? | semanal | médio | ações de conversão, divergência com a loja (LI) |
| D6 | Quais termos cortar/adicionar? | semanal | médio | termos de pesquisa, palavras-chave |
| D7 | Que anúncios testar? | quinzenal | baixo | anúncios, desempenho por ativo |
| D8 | O que montar a seguir? | sob demanda | médio | economia unitária, catálogo, histórico |

## 3. Agentes

Fase 1 (construir agora, só dados que já temos mais algumas sincronizações pequenas):
**Diagnóstico de conta** (D1, D2), **Consultor de estratégia** (D4, D8: reativar x criar, com verba inicial de R$ 1.000), **Revisor de segurança**, **Orquestrador**.
Fase 2: **Analista de desempenho** (D3), **Orçamento e lances** (D4), **Integridade de conversão** (D5).
Fase 3: **Termos e negativas** (D6), **Textos de anúncio** (D7).

O consultor de estratégia entrou na fase 1 por decisão do usuário (não sabe se deve reativar ou criar campanhas). Ele depende do histórico por campanha e das vendas reais da loja (ver 4.3b).

Os agentes só gravam em `google_ads_recommendations`. Nada é aplicado no Google Ads sem aprovação, e a conta começa em `read_only`.

**Decisão (2026-11-09): núcleo sem IA primeiro.** Cada agente tem um **núcleo determinístico** (regras e cálculos em código, com limiares configuráveis) que já entrega a recomendação completa, com os números e a justificativa em texto de modelo. A IA vira uma **camada opcional**, desligada por padrão (`google_ads_accounts.guardrails.ai_enabled = false`), que só melhora a redação, resolve ambiguidades e propõe ideias criativas. Sem ela o módulo funciona inteiro. Para os casos de julgamento, o sistema também gera um **dossiê de decisão** (resumo estruturado dos dados) que o usuário pode levar a uma conversa no Claude Code, sem custo de API.

### 3b. Dois tipos de agente

**Tipo A, por regras (sem tokens):** diagnóstico de conta, revisor de segurança, orquestrador, orçamento e lances, analista de desempenho (números), ranking do consultor de estratégia e a triagem das **recomendações nativas do Google** (resource `recommendation` da API, gratuito: entra como dado de entrada, filtrado por regras; elas tendem a sugerir gastar mais, então são sugestão e não ordem).

**Tipo B, com IA, só onde é essencial:**
1. Textos de anúncio (escrever e variar mensagens).
2. Cenários de estratégia para campanha nova (raciocínio aberto), sobre o ranking já calculado pelo tipo A.
3. Classificação de intenção de termos de pesquisa, em lote, com modelo pequeno.
4. Resumo narrativo semanal (opcional).

**Regras para gastar poucos tokens (valem para todo agente tipo B):**
- Só chama a IA quando uma regra ou o usuário disparar; nunca em cron "por garantia".
- Entrada pequena e agregada (tabelas resumidas, nunca linhas cruas) e saída em JSON com limite de tokens.
- Cache por hash da entrada: se os dados não mudaram, reaproveita a resposta anterior.
- Modelo pequeno primeiro; só escala para um modelo maior se o teste de qualidade exigir.
- Conhecimento fixo vai em prompt com cache; só os trechos necessários.
- Teto mensal em `google_ads_accounts.guardrails.ai_budget_usd` e registro de tokens por chamada no `google_ads_audit_log`. Ao atingir o teto, a camada de IA para sozinha e o núcleo por regras segue funcionando.
- **Provedor intercambiável** (uma interface única): o mesmo conjunto de casos de teste roda em mais de um modelo (ex.: Claude Haiku e Gemini Flash) e a escolha é por qualidade e custo medidos, não por suposição. Dados do Google Ads só vão a provedor/plano que não treine com eles (confirmar nos termos vigentes; planos gratuitos de algumas APIs usam os dados para melhorar produtos).

## 4. Especificações

### 4.1 diagnostico-de-conta (fase 1)

- **Decisão que toma:** a conta está entregando; se não, qual é a causa provável e o que fazer; o saldo vai acabar e quando.
- **Quando roda:** cron diário (após a sincronização) e sob demanda pelo botão "Diagnosticar". **Custo de errar:** alto.
- **Entradas:** `google_ads_accounts`, `google_ads_campaigns` (status, orçamento), `google_ads_campaign_daily` (últimos 30 dias) e as tabelas novas da seção 5: `google_ads_account_budget`, `google_ads_billing`, status de entrega por campanha, status de anúncios.
- **Cálculos em código, antes da IA (regras, nenhuma chamada de IA):**
  - **R1 Entrega suspensa por saldo:** campanha `ENABLED` com `serving_status` ≠ `SERVING` **e** `amount_served >= 0,999 × adjusted_limit`. Severidade crítica.
  - **R2 Saldo acabando (preventiva, a regra mais valiosa):** `dias_restantes = (limite − gasto_acumulado) / gasto_médio_diário_7d`. Alertar com ≤ 7 dias (médio), ≤ 3 dias (alto), ≤ 1 dia (crítico). Se não há gasto recente, não calcular (informar "sem gasto, sem previsão").
  - **R3 Ativa sem impressões:** campanha `ENABLED`, orçamento > 0, 0 impressões por 7 dias, com entrega normal: investigar anúncios, segmentação, lances.
  - **R4 Faturamento:** `billing_setup` ≠ `APPROVED` ou conta ≠ `ENABLED`.
  - **R5 Anúncios reprovados ou em revisão** em campanha ativa.
  - **R6 Dado velho:** última sincronização > 36 h: avisar antes de diagnosticar.
- **Conhecimento que carrega:** `.claude/skills/ads/references/google-audit.md`, `gaql-notes.md`, `status-contract.md` (só as partes de Google) e a skill `google-ads-api-account-diagnostics`.
- **O que a IA decide:** só o que as regras não resolvem: explicar a causa provável em linguagem simples, ordenar os consertos, escolher o texto do alerta. Nunca inventa a causa: se a regra não achou, diz "causa não identificada pelos dados disponíveis" e lista o que verificar na interface.
- **Saída (`google_ads_recommendations`):** `kind` = `alert` | `insight` | `manual_action`; `risk` conforme a severidade; `rationale` com os números (limite, gasto, data, dias restantes); `payload` com a ação humana sugerida (ex.: "repor saldo em Faturamento"). `manual_action` não gera chamada ao Google.
- **Regras de segurança:** nunca propõe aplicar mudança na conta; nunca afirma a causa como certa quando a API só dá `UNKNOWN`; escala para o usuário em R1, R2 (≤3 dias) e R4.
- **Como sabemos que acertou:** testes unitários de cada regra; retroteste na janela out/2025 a jan/2026 (a R1 deve disparar em 2026-01-13 e a R2 deve ter alertado dias antes); caso sem dados e caso de dado velho.
- **Falha segura:** sem `account_budget` (conta com outro tipo de pagamento): R1/R2 ficam "não aplicáveis" e o agente avisa em vez de calcular.
- **Depende de:** sincronização de `account_budget`, `billing_setup`, `serving_status`/`primary_status` e anúncios.

### 4.2 revisor-de-seguranca (fase 1)

- **Decisão:** a proposta respeita guardrails da conta e a política do Google?
- **Roda:** sempre que um agente grava uma recomendação, antes de ela aparecer ao usuário. **Custo de errar:** alto.
- **Em código:** `guardrails` da conta (variação máxima de orçamento, teto diário, ações permitidas por `mode`), limites de frequência de mudança (evitar reiniciar aprendizado de lances), rejeição de ações fora da conta, de valores absurdos e de termos/categorias restritos.
- **IA:** só casos ambíguos de política (texto de anúncio, termo de marca de terceiros). Conhecimento: `ads/references/compliance.md`, `compliance-requirements.md`.
- **Saída:** aprova, rebaixa (ex.: risco `high`) ou bloqueia com motivo. Quem bloqueia não pode ser contornado por outro agente.
- **Teste:** conjunto de propostas ruins que DEVEM ser barradas e boas que devem passar.
- **Falha segura:** na dúvida, bloqueia e pede revisão humana.

### 4.3 orquestrador (fase 1)

- **Decisão:** o que mostrar ao usuário e em que ordem; há conflito entre propostas?
- **Roda:** depois dos demais agentes. **Custo de errar:** médio.
- **Em código:** deduplicar, agrupar por entidade, ordenar por impacto × risco, expirar recomendações velhas (`expires_at`).
- **IA:** resolver conflitos (dois agentes pedindo coisas opostas) e escrever o resumo de 3 a 5 linhas do dia. Conhecimento: `multi-agent-orchestration`.
- **Regra:** alerta crítico do diagnóstico sempre vai ao topo.
- **Teste:** conjuntos de propostas com conflito e duplicatas; o resumo não pode citar número que não esteja nas recomendações.

### 4.3b consultor-de-estrategia (fase 1)

- **Decisão que toma:** com a verba disponível, o que fazer: reativar campanhas existentes (quais, com que orçamento) ou criar novas (de que tipo)? É a recomendação mais importante do módulo e a de maior custo de erro depois do diagnóstico.
- **Roda:** sob demanda (botão "Planejar investimento") e quando muda a verba ou a meta. **Custo de errar:** alto (verba inicial de R$ 1.000).
- **Entradas:** histórico completo por campanha desde 2021 (gasto, cliques, conversões, valor), metas por campanha (tabela `google_ads_campaign_targets`, seção 5), verba e prazo informados pelo usuário, e as **vendas reais da loja** (`li_orders` com UTM/cupom de origem Google) para conferir o ROAS que o Google reporta.
- **Em código, antes da IA:**
  - Por campanha: CPA, ROAS, taxa de conversão, parcela de gasto, tendência, janelas com amostra suficiente. Campanhas com amostra insuficiente são marcadas como "sem evidência".
  - Ranking das campanhas históricas por retorno vs a meta de cada uma.
  - Simulação simples de verba: dias de duração = verba ÷ orçamento diário proposto; nunca propor orçamento diário que esgote a verba em menos de N dias (limite configurável, padrão 14).
  - Divergência Google x loja (conversões reportadas vs pedidos atribuídos).
- **O que a IA decide:** montar 2 a 3 cenários comparáveis (ex.: só marca; marca + Shopping; reativar o PMax com orçamento reduzido), com o raciocínio, riscos, o que medir e quando decidir de novo; sugerir tipo de campanha nova só se o histórico e o catálogo sustentarem.
- **Conhecimento:** `ads-plan`, `ads-budget`, `ads-math`, `ads-test`, `budget-allocation.md`, `bidding-strategies.md`, `benchmarks.md`, `thinking-framework.md`.
- **Saída:** `kind` = `strategy`, com os cenários em `payload`, a recomendação principal, o orçamento diário sugerido por campanha, um período de teste e **critérios de parada** (ex.: pausar se gastar X sem conversão). Sempre `risk` ≥ `medium` e sempre passa pelo revisor.
- **Regras de segurança:** não promete resultado; separa fato (dado da conta), hipótese e suposição; não recomenda reativar campanha sem histórico confiável; com R$ 1.000 prefere poucos testes controlados a muitas campanhas.
- **Teste:** conjunto de ouro com cenários fabricados (campanha boa com amostra pequena, campanha ruim com muito gasto, conta sem metas) e retroteste: dado o histórico até uma data, o que ele recomendaria e como as campanhas foram depois.
- **Falha segura:** sem metas cadastradas, pergunta ao usuário em vez de inventar; sem vendas da loja, avisa que o ROAS é só o do Google.
- **Depende de:** backfill do histórico completo, metas por campanha, conversões (`conversion_action`), integração com `li_orders`.

### 4.4 analista-de-desempenho (fase 2)

Decisão D3. Em código: variação semana a semana, outliers, comparação com a mesma janela anterior, ignorando os últimos 3 dias (latência de conversão). IA: narrativa causal e hipóteses a testar. Só opina com amostra mínima (definir limiar em código, ex.: ≥ 100 cliques e ≥ 10 conversões); abaixo disso diz "amostra insuficiente". Conhecimento: `ads-monitor`, `ads-math`, `benchmarks.md`, `thinking-framework.md`. Depende de dados de conversão confiáveis (ver 4.6).

### 4.5 orcamento-e-lances (fase 2)

Decisão D4. Em código: pacing, CPA/ROAS vs meta, retorno marginal por campanha. IA: priorizar e justificar a realocação. Guardrails: variação máxima por mudança e por semana; nunca mexer em lance de campanha em aprendizado. Conhecimento: `ads-budget`, `ads-math`, `budget-allocation.md`, `bidding-strategies.md`, `automation-tier-classifier.md`. **Precisa da meta de CPA/ROAS definida pelo usuário** (pergunta aberta).

### 4.6 integridade-de-conversao (fase 2)

Decisão D5. Em código: ações primárias vs objetivo da campanha, ações ocultas, divergência entre conversões do Google Ads e pedidos da Loja Integrada (`li_orders`) no mesmo período. IA: interpretar a divergência. Conhecimento: `conversion-tracking`, `ads-attribution`, `conversion-tracking.md`. Deve rodar antes de o orçamento-e-lances recomendar qualquer coisa baseada em CPA.

### 4.7 a 4.9 (fase 3)

- **termos-e-negativas (D6):** em código, termos com gasto e zero conversão e regras de correspondência; IA classifica a intenção e o risco de cortar algo bom. Precisa sincronizar termos de pesquisa.
- **textos-de-anuncio (D7):** em código, limites de caracteres e política; IA escreve variações com base no que já performa. Conhecimento: `ad-creative`, `copy-frameworks.md`, `google-creative-specs.md`, `voice-to-style.md`. Passa sempre pelo revisor.
- (estratégia e nova campanha: ver 4.3b, agora na fase 1.)

## 5. Sincronizações que faltam (pré-requisitos)

Já temos: contas, campanhas, métricas diárias por campanha. Para a fase 1 faltam, todas somente leitura:

1. `account_budget` (limite, gasto acumulado, datas) e histórico de `account_budget_proposal`.
2. `billing_setup` (status) e `customer.status`.
3. Em `campaign`: `serving_status`, `primary_status`, `primary_status_reasons`. A API devolve os motivos como `UNKNOWN`: gravar o texto bruto.
4. `ad_group_ad` (status e aprovação) e `asset_group` (status, força) das campanhas ativas.

Para o consultor de estratégia (fase 1): 
5. **Backfill do histórico completo** por campanha e dia desde o início da conta (2021). `google-ads-sync` aceita no máximo 365 dias por chamada: sincronizar em janelas anuais.
6. `conversion_action` (status, se é primária, tipo).
7. Tabela nova `google_ads_campaign_targets` (por tenant e campanha): `target_type` (`cpa_max` | `roas_min`), `target_value`, `monthly_budget_cap_micros` opcional, `notes`, quem definiu e quando. O usuário disse que **cada campanha terá sua meta**: a tela do CRM precisa permitir editá-las. Escrita só via edge function com `requireUserAuth` e log de auditoria, como no resto do módulo.
8. Ligação com as vendas reais: usar `li_orders` (UTM/cupom) para conferir o ROAS reportado pelo Google. Verificar quais colunas de origem existem antes de desenhar a consulta.

Fase 2: já coberto pelo item 6. Fase 3: `search_term_view`, `keyword_view`, anúncios completos.

Nota técnica: `change_status` só aceita janela de até 90 dias; `account_budget_proposal` e métricas exigem filtro de data com início e fim.

## 6. Ordem de construção

1. Sincronizações 1 a 4 da seção 5 (nova migration + estender `google-ads-sync`).
2. `diagnostico-de-conta` em `read_only`, com regras R1 a R6 e testes (retroteste incluso).
3. `revisor-de-seguranca` e `orquestrador` (fixam o contrato de saída).
4. Tela `/google-ads` no CRM: visão da conta, alertas, **metas por campanha** e recomendações com aprovar/rejeitar.
4b. Backfill do histórico completo e `consultor-de-estrategia` (4.3b), com a chave de API da Anthropic configurada nos secrets (`ANTHROPIC_API_KEY`).
5. Cron diário: sincronizar, diagnosticar, revisar, orquestrar. **Alerta ao usuário** (e-mail/WhatsApp pelos canais que o CRM já tem) quando houver alerta crítico.
6. Fase 2, um agente por vez, cada um com seus testes.
7. Só por último, a função que **aplica** recomendações aprovadas (e mesmo assim em `approval`).

## 7. Testes e implantação

- **Regras em código:** `deno test` na CI, uma tabela de entrada/saída por regra.
- **IA:** conjunto de ouro de 10 a 20 casos por agente (padrão `scripts/ai-golden-set.ts`). Critérios verificáveis: cita período e números; não afirma causa quando a API dá `UNKNOWN`; diz "amostra insuficiente" quando for o caso.
- **Retroteste:** reconstruir `gasto_acumulado(t)` a partir das métricas diárias desde 2021 e verificar que R1/R2 teriam alertado antes de 2026-01-13.
- **Segurança:** propostas acima dos limites, fora da conta, termos restritos: o revisor deve barrar.
- **Medidas:** % de recomendações aprovadas e motivo das rejeitadas; recomendações sem evidência (meta: zero); tokens por execução.
- **Etapas:** `read_only` por algumas semanas → `approval` (uma ação por vez, com desfazer, tudo no `google_ads_audit_log`) → `auto` só para baixo risco e dentro de `guardrails`. Ações de alto risco ficam sempre em `approval`.

## 8. Suposições e perguntas em aberto

Decisões do usuário (2026-11-09):
- Saldo zerado: **confirmado**.
- **Cada campanha terá sua própria meta** (tabela `google_ads_campaign_targets`, ainda sem valores).
- **Verba inicial: R$ 1.000 por mês** (confirmado). Guardrail de teto: R$ 1.000 por mês, ou seja, ~R$ 33/dia na média. Cuidado com os orçamentos diários atuais (R$ 400 e R$ 190).
- **Foco indefinido:** o usuário quer que um agente ajude a decidir, inclusive entre reativar e criar campanhas (consultor de estratégia, 4.3b).
- **IA é opcional** (ver seção 3): o núcleo é por regras. Se a camada de IA for ligada, o provedor é **Claude (Anthropic)** via chave de API do Console (crédito pré-pago, separado do plano Pro).
- Detalhe do provedor, se ligada: Os dados do Google Ads só podem ir a um provedor que não treine com eles (política de uso limitado): usar a API da Anthropic sob termos comerciais e confirmar a política vigente. Os agentes do módulo Google Ads usam Claude; o `ai-chat` do CRM continua com o provedor atual.

Ainda em aberto:
1. **SUPOSIÇÃO:** a recarga de saldo só pode ser feita pelo usuário na interface do Google.
2. Quais são as metas de cada campanha (valores)?
3. (resolvido: a verba é mensal)
4. Os orçamentos diários das 2 campanhas ativas (R$ 400 e R$ 190) precisam ser reduzidos ou as campanhas pausadas antes de repor o saldo.
5. Os arquivos de referência da skill `ads` cobrem várias plataformas e podem ter limites ou benchmarks desatualizados: conferir na documentação oficial antes de virar regra.
