-- Add columns to generated_coupons for tracking usage
ALTER TABLE generated_coupons ADD COLUMN IF NOT EXISTS used_in_order_id text;
ALTER TABLE generated_coupons ADD COLUMN IF NOT EXISTS used_order_value numeric;

-- Create table for scheduled cashback reminders
CREATE TABLE public.cashback_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES generated_coupons(id) ON DELETE CASCADE,
  config_id uuid REFERENCES cashback_configs(id) ON DELETE SET NULL,
  reminder_number integer NOT NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  message text,
  webhook_url text,
  webhook_payload jsonb,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create index for efficient querying of pending reminders
CREATE INDEX idx_cashback_reminders_pending ON cashback_reminders(scheduled_date, status) WHERE status = 'pending';
CREATE INDEX idx_cashback_reminders_coupon ON cashback_reminders(coupon_id);

-- Enable RLS on cashback_reminders
ALTER TABLE cashback_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on cashback_reminders"
ON cashback_reminders
FOR ALL
USING (true)
WITH CHECK (true);

-- Create table for cashback execution logs
CREATE TABLE public.cashback_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid REFERENCES cashback_configs(id) ON DELETE SET NULL,
  coupon_id uuid REFERENCES generated_coupons(id) ON DELETE SET NULL,
  reminder_id uuid REFERENCES cashback_reminders(id) ON DELETE SET NULL,
  order_id text,
  order_number text,
  coupon_code text,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  tokens_used integer DEFAULT 1,
  metadata jsonb,
  executed_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for execution logs
CREATE INDEX idx_cashback_executions_config ON cashback_executions(config_id);
CREATE INDEX idx_cashback_executions_coupon ON cashback_executions(coupon_id);
CREATE INDEX idx_cashback_executions_action ON cashback_executions(action_type);
CREATE INDEX idx_cashback_executions_date ON cashback_executions(executed_at DESC);

-- Enable RLS on cashback_executions
ALTER TABLE cashback_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on cashback_executions"
ON cashback_executions
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at on cashback_reminders
CREATE TRIGGER update_cashback_reminders_updated_at
BEFORE UPDATE ON cashback_reminders
FOR EACH ROW
EXECUTE FUNCTION update_li_updated_at_column();