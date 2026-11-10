# Plano de melhorias do módulo Google Ads (decisões mais certeiras e automáticas)

Escrito para: o dono da Chronic (iniciante) e para o agente de código que vai executar.
Base: análise de 2026-11-10 (dados reais do banco + código). Princípio: **agentes propõem, regras em código decidem o que é seguro, só `google-ads-apply` escreve no Google.**

## 0. Economia da loja (medida com os dados do próprio CRM, 24 meses, pedidos válidos)
Fonte: `li_orders`, `li_order_items`, `li_products.cost_price` (98% dos produtos têm custo).
- Ticket médio **R$ 163,62** (1,86 peças/pedido), desconto médio R$ 11,72, frete cobrado do cliente R$ 22,96 (só 4,5% dos pedidos com frete grátis).
- Custo médio do produto no pedido R$ 74,46 → **margem bruta do produto 47,1%** (depois do desconto). Bem abaixo dos 58% do cálculo inicial (que ignorava desconto e mix de produtos).
- Pagamento: Pix 62%, cartão (Pagali) 22%, Appmax 15%, boleto 1%.
- **Cancelamentos altos:** 2024 teve 40% dos pedidos cancelados (a maioria cartão); devolução/chargeback 2025: ~5% dos pedidos válidos. Recompra: só 9% dos clientes compraram mais de uma vez em 24 meses (pouco retorno de cliente novo).
- **Ainda não medidos (premissas a confirmar):** custo real do frete pago, taxas de gateway, imposto. Premissa provisória: frete cobrado ≈ frete pago; taxas ~2,5%; devolução ~5%; imposto 0–8%.
- **Margem de contribuição estimada ≈ 28–35% da receita → ROAS de equilíbrio ≈ 2,9 a 3,5.**
- Conclusão: o piso de ROAS 4,0 atual **está certo** (dá ~R$ 0,10–0,40 de lucro por R$ 1 de anúncio); **piso 3,0 seria só empatar**. Metas: **piso 4,0, alvo 5,0, alerta/pausa abaixo de 3,0**. Em campanha de cliente novo não dá para aceitar menos, pois a recompra é baixa.
- **Google × CRM:** o valor atribuído pelo Google equivale a 93–95% da receita total do CRM em 2023–2025 (2024: R$ 414 mil de R$ 453 mil). Ou quase toda venda vem de anúncio, ou o Google atribui à marca vendas que viriam de qualquer jeito. ROAS Google: 6,5 (2023), 6,4 (2024), 4,1 (2025). Gasto: 33 mil, 65 mil, 30 mil.
- Orçamento: R$ 2.000/mês (teto já em vigor).

## Fase 0 — Agente de economia real (novo, antes de tudo)
0. **Agente "economia da loja" (código, sem IA)**: calcula todo mês, a partir do CRM, ticket, margem de produto, cancelamento, devolução, mix de pagamento e recompra; grava em `google_ads_unit_economics`. Permite informar só o que o CRM não sabe (imposto %, taxa por gateway, custo médio de frete) numa tela. Gera sozinho o **ROAS de equilíbrio, piso e alvo** e o **CPA máximo**, e atualiza `guardrails.min_roas` somente por proposta aprovada. Mostra o aviso quando a margem muda (promoção, custo novo).
0b. **Conversão que conta só venda boa:** comparar conversões do Google com pedidos pagos/entregues do CRM por mês e alertar se divergir (cancelados contados como venda inflam o ROAS). Base para importar conversão offline no futuro.
0c. **Incrementalidade da marca:** com pedidos do CRM por origem (cupom/UTM quando existir), estimar quanto da marca é venda que viria sem anúncio.

## Fase 1 — Consistência e confiança (rápida, maior ganho)
1. **Revisor de propostas** (`google-ads-review-rules.ts`, código puro, sem IA): roda antes de gravar propostas.
   - Barra conflito na mesma campanha (pausar × reconstruir × ajustar verba): fica a de maior prioridade, as outras viram "bloqueada por conflito".
   - Barra ajuste de verba < 10% ou < R$ 3/dia.
   - Barra mudança de verba/religar com menos de 7 dias de dados recentes da campanha (maturidade).
   - Barra religar campanha de marca duplicada (canibalização): só uma campanha de marca ativa.
   - Teste: caso real de hoje (pausar + reconstruir Camisetas; 37→38; Marca #2) deve sair com 1 proposta coerente.
2. **Status real da proposta**: nunca marcar "expirada" algo que foi aplicado ou que falhou de verdade. Novos estados: `applied`, `failed`, `resolved_externally` (já feito no Google por outro meio). Ao detectar que o efeito já existe no Google, gravar `resolved_externally` com a evidência.
3. **ROAS mínimo e metas a partir da margem**: tela para informar custo, preço e custos extras; o sistema calcula ROAS de equilíbrio, piso e CPA máximo e usa em todas as regras (substitui o "4 de palpite").
4. Camisetas: o agente de IA rascunha o anúncio novo (sem inventar oferta, sem "420"), o dono revisa, URL passa no teste do AdsBot, e só então aplica a reconstrução.

## Fase 2 — Aprender com o resultado (loop de feedback)
5. **Tabela `google_ads_action_outcomes`**: para cada ação aplicada guarda métricas de 7 dias antes e depois (gasto, cliques, conversões, receita, ROAS) em 7 e 14 dias.
6. **Agente avaliador** (código; IA só para explicar): classifica `melhorou / neutro / piorou / amostra insuficiente`; calcula taxa de acerto por tipo de ação. Mostra na aba Atividade.
7. Se um tipo de ação piora duas vezes seguidas, o sistema deixa de propô-lo automaticamente e avisa.

## Fase 3 — Alertas ativos
8. **Alertas por WhatsApp/e-mail** (canal já existente no CRM): saldo da conta baixo, campanha sem entrega, anúncio reprovado, gasto fora do ritmo (> 130% ou < 40% do esperado), ROAS 7 dias abaixo do piso, mudança feita fora do sistema.
9. **Detector de mudança externa**: compara `change_event` com o `audit_log`; o que não é nosso vira aviso ("alguém mexeu em X") e atualiza propostas afetadas.
10. Resumo diário/semanal curto (3 linhas): gasto, receita, ROAS, o que o sistema fez e o que espera aprovação.

## Fase 4 — Mais inteligência de decisão
11. **Vendas reais da Loja Integrada** × receita atribuída pelo Google → ROAS real e quanto da marca é venda nova (incrementalidade). Só leitura, mínimo de dados.
12. **Metas por campanha** (tabela `google_ads_campaign_targets` já existe; criar a tela) com valores vindos da margem.
13. **Campanhas novas fora da marca** (Shopping com feed, remarketing): agente de estratégia propõe estrutura, orçamento inicial pequeno de teste e critério de parada; criação sempre via aprovação.
14. **Integridade de conversão**: agente confere ações duplicadas/inativas, tag parada e queda brusca (2 ações GA4 ocultas hoje). Verificado: 99% da receita vem de uma ação só, sem dupla contagem.
15. Lances por dispositivo/dia só se mudar para lance manual (hoje Maximizar Valor de Conversão).

## Fase 5 — Automação com limites (só depois de 2–4 semanas de acertos medidos)
16. Modo `auto` restrito por lista de permissão, cada item com limite diário e trava:
    - negativar termo com gasto ≥ R$ 30, zero conversão e sem a marca;
    - pausar palavra com gasto ≥ R$ 40 e zero conversão;
    - ajustar verba até ±20% dentro do teto e do ROAS ≥ piso, no máximo 1 vez por semana por campanha.
17. Travas: botão "desligar automação" no painel, máximo de ações/dia, desfazer automático se a métrica piorar na avaliação, tudo com auditoria. Nada de criar/remover campanha nem mexer na meta de conversão em modo auto.

## Qualidade e operação (todas as fases)
- TDD em cada regra nova; manter os 116+ testes verdes; teste com os casos reais citados.
- Tamanhos de arquivo dentro dos limites; novo código em `_shared` ≤ 300 linhas.
- Privacidade: dados do Google só para a função do próprio dono; à IA vai só resumo numérico; confirmar termos da Groq.
- Cada entrega: migration, funções publicadas na VPS, commit na `main`, aviso para o dono refazer o rebuild do front.

## Ordem de execução
1 → 2 → 3 (um bloco), depois 5–7, 8–10, 11–12, 13–15, 16–17.
Critério para avançar para a Fase 5: ≥ 20 ações medidas com ≥ 70% `melhorou/neutro`.

## Pendências do dono (so o que o CRM nao sabe)
- Informar só o que o CRM não sabe: imposto (%), taxa de cada gateway e custo real do frete (a tela da Fase 0 pede isso).
- Aprovar piso 4,0 / alvo 5,0 / alerta abaixo de 3,0.
- Revisar o texto do anúncio de Camisetas.
- Repor crédito quando precisar.
