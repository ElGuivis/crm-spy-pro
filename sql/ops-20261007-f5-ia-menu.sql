-- F5 (07/10/2026): entrada da IA no menu da Recepcionista + correcao do perfil da loja.
-- Valores anteriores: ai_agents.system_prompt = '' (vazio); interactive_buttons tinha 3 botoes (track, human, atacado).

-- 1) Prompt generico (sem nicho; o perfil da loja entra em tempo de execucao) e botao "Tirar duvidas" -> delegate_ai.
UPDATE public.ai_agents
SET system_prompt = 'Você é o assistente virtual de uma loja online. Responda de forma cordial, objetiva e profissional, em português do Brasil. Use emojis com moderação. Mantenha as respostas curtas. Se não souber algo, diga que não tem a informação e ofereça chamar um atendente humano.',
    interactive_buttons = CASE
      WHEN interactive_buttons @> '[{"id":"ai"}]'::jsonb THEN interactive_buttons
      ELSE interactive_buttons || '[{"id":"ai","text":"Tirar dúvidas sobre produtos","action":"delegate_ai"}]'::jsonb
    END
WHERE id = '1850fbc8-50b5-4102-9d71-1436a1be8c88'
  AND coalesce(system_prompt, '') = '';

-- 2) Perfil: a UseChronic e REVENDEDORA AUTORIZADA da marca Chronic (nao e a marca); atacado e direto com a marca
--    (texto do botao "Revenda Atacado" do proprio agente).
UPDATE public.tenant_business_profiles
SET about = 'A UseChronic é revendedora autorizada da marca Chronic no varejo (streetwear), com coleções da marca e colaborações (ex.: Dexter, Mano Fler).',
    segment = 'Streetwear e acessórios (revenda autorizada da marca Chronic)',
    policies = policies || jsonb_build_object('wholesale', 'Para compras em atacado é preciso falar direto com a marca: site oficial www.chronic420.com.br ou WhatsApp do vendedor Samuel, (11) 93289-4285. A UseChronic atua só no varejo.')
WHERE tenant_id = 'bfbf95be-2ce9-47b5-82b1-c9677f42a5a8';
