-- Criar tabela de jobs para sincronização do Melhor Envio
CREATE TABLE IF NOT EXISTS me_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  integration_id uuid REFERENCES integrations(id),
  status text NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  current_page integer DEFAULT 1,
  total_pages integer,
  items_saved integer DEFAULT 0,
  items_total integer,
  items_linked integer DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS para me_sync_jobs
ALTER TABLE me_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant me_sync_jobs"
  ON me_sync_jobs FOR SELECT
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can insert me_sync_jobs for their tenant"
  ON me_sync_jobs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their tenant me_sync_jobs"
  ON me_sync_jobs FOR UPDATE
  USING (auth.uid() IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Service role can manage me_sync_jobs"
  ON me_sync_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

-- Habilitar Realtime para acompanhamento de progresso
ALTER PUBLICATION supabase_realtime ADD TABLE me_sync_jobs;

-- Adicionar coluna li_order_id na tabela me_shipments para vincular com pedidos da Loja Integrada
ALTER TABLE me_shipments 
ADD COLUMN IF NOT EXISTS li_order_id uuid REFERENCES li_orders(id);

-- Índice para buscas por li_order_id
CREATE INDEX IF NOT EXISTS idx_me_shipments_li_order_id 
ON me_shipments(li_order_id);

-- Índice para buscas por external_order_number
CREATE INDEX IF NOT EXISTS idx_me_shipments_external_order_number 
ON me_shipments(tenant_id, external_order_number);

-- Atualizar registros existentes vinculando com li_orders
UPDATE me_shipments ms
SET li_order_id = lo.id
FROM li_orders lo
WHERE ms.tenant_id = lo.tenant_id
  AND ms.external_order_number IS NOT NULL
  AND ms.external_order_number = lo.numero
  AND ms.li_order_id IS NULL;