-- Add data_access column to ai_agents table
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS data_access jsonb DEFAULT '{"orders": true, "products": false, "abandoned_carts": true, "customer_details": true}'::jsonb;