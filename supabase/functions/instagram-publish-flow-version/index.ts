import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResources } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { flow_id, version_id } = await req.json();
    if (!flow_id || !version_id) throw new Error("flow_id and version_id required");

    // Validate both resources belong to tenant (IDOR protection)
    await requireResources(supabase, [
      { table: "instagram_flows", id: flow_id },
      { table: "instagram_flow_versions", id: version_id },
    ], tenantId, req);

    // Get version
    const { data: version, error: vErr } = await supabase
      .from("instagram_flow_versions")
      .select("id, flow_id, tenant_id, status, snapshot, version_number, published_at")
      .eq("id", version_id)
      .eq("flow_id", flow_id)
      .single();
    if (vErr || !version) throw new Error("Version not found");
    if (version.status === "published") throw new Error("Version already published (immutable)");

    // Get nodes & edges
    const [{ data: nodes }, { data: edges }] = await Promise.all([
      supabase.from("instagram_flow_nodes").select("id, node_type, label, config, position_x, position_y, is_entry").eq("version_id", version_id),
      supabase.from("instagram_flow_edges").select("id, source_node_id, target_node_id, source_handle, label, condition").eq("version_id", version_id),
    ]);

    // ---- VALIDATION ----
    const nodeList = nodes || [];
    const edgeList = edges || [];

    if (nodeList.length === 0) throw new Error("Flow has no nodes");

    // Must have exactly 1 entry node (trigger or is_entry)
    const entryNodes = nodeList.filter((n: { is_entry?: boolean; node_type: string }) => n.is_entry || n.node_type === "trigger");
    if (entryNodes.length !== 1) throw new Error("Flow must have exactly 1 entry node (trigger)");

    // No orphan nodes (every non-entry node must be target of at least one edge)
    interface FlowNodeMin { id: string; node_type: string; label?: string; is_entry?: boolean; config?: Record<string, unknown> }
    const nodeIds = new Set(nodeList.map((n: FlowNodeMin) => n.id));
    const targetIds = new Set(edgeList.map((e: { target_node_id: string }) => e.target_node_id));
    const orphans = nodeList.filter((n: FlowNodeMin) => !n.is_entry && !targetIds.has(n.id));
    if (orphans.length > 0) throw new Error(`Orphan nodes found: ${orphans.map((n: FlowNodeMin) => n.label || n.id).join(", ")}`);

    // No broken edges
    for (const edge of edgeList) {
      if (!nodeIds.has(edge.source_node_id) || !nodeIds.has(edge.target_node_id)) {
        throw new Error("Broken edge detected");
      }
    }

    // No unsafe wait loops (wait -> ... -> wait cycle without human intervention)
    const waitNodes = new Set(nodeList.filter((n: FlowNodeMin) => n.node_type === "wait").map((n: FlowNodeMin) => n.id));
    if (waitNodes.size > 0) {
      const adj: Record<string, string[]> = {};
      for (const e of edgeList) {
        if (!adj[e.source_node_id]) adj[e.source_node_id] = [];
        adj[e.source_node_id].push(e.target_node_id);
      }
      // Simple DFS cycle detection from wait nodes
      for (const wId of waitNodes) {
        const visited = new Set<string>();
        const stack = [wId];
        while (stack.length > 0) {
          const curr = stack.pop()!;
          if (visited.has(curr)) continue;
          visited.add(curr);
          for (const next of (adj[curr] || [])) {
            if (next === wId && waitNodes.has(curr)) {
              throw new Error("Unsafe wait loop detected");
            }
            stack.push(next);
          }
        }
      }
    }

    // Leaf nodes (no outgoing edges) must be "end" type
    const sourceIds = new Set(edgeList.map((e: { source_node_id: string }) => e.source_node_id));
    const leafNodes = nodeList.filter((n: FlowNodeMin) => !sourceIds.has(n.id));
    const nonEndLeaves = leafNodes.filter((n: FlowNodeMin) => n.node_type !== "end");
    if (nonEndLeaves.length > 0) {
      throw new Error(`Non-end leaf nodes: ${nonEndLeaves.map((n: FlowNodeMin) => n.label || n.node_type).join(", ")}`);
    }

    // Create snapshot
    const snapshot = { nodes: nodeList, edges: edgeList };

    // Archive previous live version
    const { data: flow } = await supabase
      .from("instagram_flows")
      .select("live_version_id")
      .eq("id", flow_id)
      .single();

    if (flow?.live_version_id && flow.live_version_id !== version_id) {
      await supabase
        .from("instagram_flow_versions")
        .update({ status: "archived" })
        .eq("id", flow.live_version_id);
    }

    // Publish version
    await supabase
      .from("instagram_flow_versions")
      .update({
        status: "published",
        snapshot,
        published_at: new Date().toISOString(),
      })
      .eq("id", version_id);

    // Update flow
    await supabase
      .from("instagram_flows")
      .update({ live_version_id: version_id, status: "active" })
      .eq("id", flow_id);

    // ---- AUTO-CREATE TRIGGER RULES FROM TRIGGER NODE ----
    const triggerNode = nodeList.find((n: FlowNodeMin) => n.node_type === "trigger");
    if (triggerNode) {
      const tc = triggerNode.config || {};
      let triggerType = tc.trigger_type || "dm_any_message";
      
      // For dm_first_message, we use dm_any_message with once_per_contact throttle
      const effectiveThrottle = triggerType === "dm_first_message" 
        ? "once_per_contact" 
        : (tc.throttle_mode || "once_per_contact");
      
      if (triggerType === "dm_first_message") {
        triggerType = "dm_any_message";
      }

      // Delete existing trigger rules for this flow
      await supabase
        .from("instagram_trigger_rules")
        .delete()
        .eq("flow_id", flow_id);

      // Get flow's tenant_id
      const { data: flowData } = await supabase
        .from("instagram_flows")
        .select("tenant_id")
        .eq("id", flow_id)
        .single();

      // Insert new trigger rule
      const rulePayload: Record<string, unknown> = {
        tenant_id: flowData?.tenant_id || version.tenant_id,
        flow_id: flow_id,
        trigger_type: triggerType,
        is_active: true,
        priority: tc.priority ?? 10,
        throttle_mode: effectiveThrottle,
        keyword_match_mode: tc.keyword_match_mode || "exact",
      };

      if (triggerType === "dm_keyword" && tc.keywords?.length) {
        rulePayload.keywords = tc.keywords.filter((k: string) => k.trim());
      }

      await supabase.from("instagram_trigger_rules").insert(rulePayload);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
