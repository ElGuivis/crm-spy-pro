-- Add reminder fields to cashback_configs table
ALTER TABLE public.cashback_configs
ADD COLUMN reminder_1_enabled boolean DEFAULT false,
ADD COLUMN reminder_1_days_before integer DEFAULT 7,
ADD COLUMN reminder_1_message text DEFAULT 'Olá {{cliente_nome}}! ⏰ Seu cupom {{cupom}} de {{valor_cupom}} de desconto expira em {{dias_restantes}} dias! Não perca essa oportunidade. Válido até {{validade}}.',
ADD COLUMN reminder_2_enabled boolean DEFAULT false,
ADD COLUMN reminder_2_days_before integer DEFAULT 3,
ADD COLUMN reminder_2_message text DEFAULT 'Olá {{cliente_nome}}! 🚨 Última chance! Seu cupom {{cupom}} expira em {{dias_restantes}} dias. Use agora e garanta {{valor_cupom}} de desconto!';