-- Atomic replace of instagram_flow_nodes + edges for a given version.
-- Mesmo padrao do replace_chatbot_flow.

CREATE OR REPLACE FUNCTION public.replace_instagram_flow_version(
  p_version_id uuid,
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
  IF p_version_id IS NULL THEN
    RAISE EXCEPTION 'p_version_id is required';
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

  -- Delete in FK-safe order
  DELETE FROM public.instagram_flow_edges WHERE version_id = p_version_id;
  DELETE FROM public.instagram_flow_nodes WHERE version_id = p_version_id;

  -- Insert nodes first
  IF jsonb_array_length(p_nodes) > 0 THEN
    FOR n IN SELECT jsonb_array_elements(p_nodes) LOOP
      INSERT INTO public.instagram_flow_nodes (
        id, tenant_id, version_id, node_type, label, config,
        position_x, position_y, is_entry
      )
      VALUES (
        (n->>'id')::uuid,
        p_tenant_id,
        p_version_id,
        n->>'node_type',
        NULLIF(n->>'label', ''),
        COALESCE(n->'config', '{}'::jsonb),
        COALESCE((n->>'position_x')::double precision, 0),
        COALESCE((n->>'position_y')::double precision, 0),
        COALESCE((n->>'is_entry')::boolean, false)
      );
    END LOOP;
  END IF;

  -- Insert edges after nodes
  IF jsonb_array_length(p_edges) > 0 THEN
    FOR e IN SELECT jsonb_array_elements(p_edges) LOOP
      INSERT INTO public.instagram_flow_edges (
        id, tenant_id, version_id, source_node_id, target_node_id,
        source_handle, label, condition
      )
      VALUES (
        (e->>'id')::uuid,
        p_tenant_id,
        p_version_id,
        (e->>'source_node_id')::uuid,
        (e->>'target_node_id')::uuid,
        NULLIF(e->>'source_handle', ''),
        NULLIF(e->>'label', ''),
        e->'condition'
      );
    END LOOP;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_instagram_flow_version(uuid, uuid, jsonb, jsonb) TO authenticated;
