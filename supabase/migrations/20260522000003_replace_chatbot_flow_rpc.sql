-- Atomic replace of chatbot_flow_nodes + edges for a given flow.
-- Antes: ChatbotFlowCanvas fazia DELETE edges, DELETE nodes, INSERT nodes,
-- INSERT edges em 4 chamadas separadas. Falha mid-way deixava flow em
-- estado inconsistente (nodes sem edges, ou nada).
-- Esta RPC roda tudo em uma unica transacao.

CREATE OR REPLACE FUNCTION public.replace_chatbot_flow(
  p_flow_id uuid,
  p_tenant_id uuid,
  p_nodes jsonb,
  p_edges jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  n jsonb;
  e jsonb;
BEGIN
  IF p_flow_id IS NULL THEN
    RAISE EXCEPTION 'p_flow_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'p_tenant_id is required';
  END IF;
  IF p_nodes IS NULL OR jsonb_typeof(p_nodes) <> 'array' THEN
    RAISE EXCEPTION 'p_nodes must be a JSON array';
  END IF;
  IF p_edges IS NULL OR jsonb_typeof(p_edges) <> 'array' THEN
    RAISE EXCEPTION 'p_edges must be a JSON array';
  END IF;

  -- Delete in FK-safe order: edges first, then nodes
  DELETE FROM public.chatbot_flow_edges WHERE flow_id = p_flow_id;
  DELETE FROM public.chatbot_flow_nodes WHERE flow_id = p_flow_id;

  -- Insert nodes first (edges reference them)
  IF jsonb_array_length(p_nodes) > 0 THEN
    FOR n IN SELECT jsonb_array_elements(p_nodes) LOOP
      INSERT INTO public.chatbot_flow_nodes (
        id, flow_id, tenant_id, node_type, label, config,
        position_x, position_y, is_entry
      )
      VALUES (
        (n->>'id')::uuid,
        p_flow_id,
        p_tenant_id,
        n->>'node_type',
        NULLIF(n->>'label', ''),
        COALESCE(n->'config', '{}'::jsonb),
        COALESCE((n->>'position_x')::float, 0),
        COALESCE((n->>'position_y')::float, 0),
        COALESCE((n->>'is_entry')::boolean, false)
      );
    END LOOP;
  END IF;

  -- Insert edges after nodes
  IF jsonb_array_length(p_edges) > 0 THEN
    FOR e IN SELECT jsonb_array_elements(p_edges) LOOP
      INSERT INTO public.chatbot_flow_edges (
        id, flow_id, tenant_id, source_node_id, target_node_id, condition
      )
      VALUES (
        (e->>'id')::uuid,
        p_flow_id,
        p_tenant_id,
        (e->>'source_node_id')::uuid,
        (e->>'target_node_id')::uuid,
        e->'condition'
      );
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_chatbot_flow(uuid, uuid, jsonb, jsonb) TO authenticated;
