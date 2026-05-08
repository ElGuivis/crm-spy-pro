-- Add integration_id to cashback_configs
ALTER TABLE cashback_configs 
ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE;

-- Add integration_id to generated_coupons
ALTER TABLE generated_coupons 
ADD COLUMN IF NOT EXISTS integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_generated_coupons_integration_id ON generated_coupons(integration_id);
CREATE INDEX IF NOT EXISTS idx_cashback_configs_integration_id ON cashback_configs(integration_id);