-- Add order verification configuration columns to ai_agents table
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_verification_enabled boolean DEFAULT false;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_verification_mode text DEFAULT 'sequential';

-- Custom messages for each step of the verification flow
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_verification_messages jsonb DEFAULT '{
  "ask_order_number": "Por favor, informe o *número do pedido* para que eu possa consultar.",
  "ask_cpf": "Agora preciso dos *3 primeiros dígitos do CPF* cadastrado no pedido para confirmar sua identidade.",
  "ask_both": "Para consultar seu pedido, por favor informe:\n\n1️⃣ *Número do pedido*\n2️⃣ *3 primeiros dígitos do CPF* cadastrado",
  "order_not_found": "❌ Não encontrei o pedido *#{order_number}* em nosso sistema.\n\nPor favor, verifique o número e tente novamente.",
  "cpf_wrong": "❌ CPF incorreto. Por favor, tente novamente.\n\n_(Tentativa {attempts}/3)_",
  "cpf_max_attempts": "⚠️ Você excedeu o número máximo de tentativas.\n\nVou transferir você para um de nossos atendentes que poderá ajudá-lo.",
  "order_verified": "✅ *Pedido encontrado!*\n\n{order_details}",
  "after_verified": "Posso ajudar com mais alguma coisa sobre este pedido?"
}'::jsonb;

-- Template for order details display
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_details_template text DEFAULT '📦 *Pedido #{numero}*
📅 Data: {data_criacao}
👤 Cliente: {cliente_nome}
📊 Status: {situacao_nome}
💰 Total: R$ {valor_total}
🚚 Rastreio: {codigo_rastreio}

🛒 *Itens:*
{order_items}';

-- Kanban columns for each transfer scenario
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS order_not_found_column_id uuid REFERENCES kanban_columns(id);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS cpf_max_attempts_column_id uuid REFERENCES kanban_columns(id);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS after_verified_column_id uuid REFERENCES kanban_columns(id);