-- Add message template field to cashback_configs
ALTER TABLE public.cashback_configs 
ADD COLUMN message_template TEXT DEFAULT 'Olá {{cliente_nome}}! 🎉 Obrigado pela sua compra! Use o cupom {{cupom}} e ganhe {{valor_cupom}} de desconto na próxima compra. Válido até {{validade}}.';

COMMENT ON COLUMN public.cashback_configs.message_template IS 'Template da mensagem WhatsApp com placeholders: {{cliente_nome}}, {{cliente_primeiro_nome}}, {{valor_cupom}}, {{cupom}}, {{validade}}';