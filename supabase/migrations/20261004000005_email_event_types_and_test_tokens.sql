-- Eventos de rastreio de robôs e de testes ficam em tipos próprios, fora das métricas:
--   bot_open / bot_click : leitura/clique de robô (Apple Mail Privacy Protection, antivírus, escaneadores de link)
--   test_open / test_click: abertura/clique de um e-mail de TESTE (para o usuário ver que o rastreio funciona)
--   delivered             : entrega confirmada pelo provedor (webhook do SES, quando for ligado)
-- As consultas de métricas filtram por 'open'/'click', então os tipos novos não entram nelas sem mudar nada.
ALTER TABLE public.email_events DROP CONSTRAINT IF EXISTS email_events_event_type_check;
ALTER TABLE public.email_events ADD CONSTRAINT email_events_event_type_check
  CHECK (event_type = ANY (ARRAY['open', 'click', 'bounce', 'complaint', 'unsubscribe', 'delivered',
                                 'bot_open', 'bot_click', 'test_open', 'test_click']));

-- Token de teste: o link de descadastro do e-mail de teste não pode descadastrar ninguém de verdade
ALTER TABLE public.email_unsubscribe_tokens ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
