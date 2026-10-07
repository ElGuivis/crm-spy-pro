import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { executeNode } from "./node-executor.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-flow-runner", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { run_id, resume_from_node_id } = await req.json();
    if (!run_id) throw new Error("run_id required");

    // Get run
    const { data: run, error: rErr } = await supabase
      .from("instagram_flow_runs")
      .select("id, tenant_id, flow_id, version_id, thread_id, contact_id, status, current_node_id, context, paused_by_contact_rule")
      .eq("id", run_id)
      .single();
    if (rErr || !run) throw new Error("Run not found");
    if (run.status !== "running") {
      return new Response(JSON.stringify({ ok: true, skipped: `run status: ${run.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get version snapshot or nodes/edges
    const { data: version } = await supabase
      .from("instagram_flow_versions")
      .select("snapshot")
      .eq("id", run.version_id)
      .single();

    interface FlowNode { id: string; node_type: string; config: Record<string, unknown>; is_entry?: boolean }
    interface FlowEdge { source_node_id: string; target_node_id: string; source_handle?: string }

    let nodes: FlowNode[], edges: FlowEdge[];
    if (version?.snapshot) {
      nodes = version.snapshot.nodes;
      edges = version.snapshot.edges;
    } else {
      const [{ data: n }, { data: e }] = await Promise.all([
        supabase.from("instagram_flow_nodes").select("id, node_type, config, is_entry").eq("version_id", run.version_id),
        supabase.from("instagram_flow_edges").select("source_node_id, target_node_id, source_handle").eq("version_id", run.version_id),
      ]);
      nodes = (n || []) as FlowNode[];
      edges = (e || []) as FlowEdge[];
    }

    const nodeMap = new Map(nodes.map((n: FlowNode) => [n.id, n]));
    const edgesBySource = new Map<string, FlowEdge[]>();
    for (const e of edges) {
      const list = edgesBySource.get(e.source_node_id) || [];
      list.push(e);
      edgesBySource.set(e.source_node_id, list);
    }

    // Find starting node
    let currentNodeId = resume_from_node_id || run.current_node_id;
    if (!currentNodeId) {
      const entry = nodes.find((n: FlowNode) => n.is_entry);
      if (!entry) throw new Error("No entry node");
      currentNodeId = entry.id;
    }

    let context = { ...(run.context || {}) };
    let stepCount = 0;
    const MAX_STEPS = 100;

    while (currentNodeId && stepCount < MAX_STEPS) {
      stepCount++;
      const node = nodeMap.get(currentNodeId);
      if (!node) {
        await failRun(supabase, run_id, `Node not found: ${currentNodeId}`);
        break;
      }

      // Record step start
      const { data: step } = await supabase
        .from("instagram_flow_run_steps")
        .insert({
          tenant_id: run.tenant_id,
          run_id,
          node_id: node.id,
          node_type: node.node_type,
          status: "executing",
          input: { config: node.config, context },
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      try {
        const result = await executeNode(supabase, node, context, run);

        // Update step
        await supabase
          .from("instagram_flow_run_steps")
          .update({
            status: result.status || "completed",
            output: result.output || {},
            completed_at: new Date().toISOString(),
          })
          .eq("id", step!.id);

        // Merge context
        if (result.contextUpdates) {
          context = { ...context, ...result.contextUpdates };
        }

        // Handle special results
        if (result.action === "end") {
          await supabase.from("instagram_flow_runs").update({
            status: "completed",
            current_node_id: node.id,
            context,
            completed_at: new Date().toISOString(),
          }).eq("id", run_id);
          break;
        }

        if (result.action === "wait") {
          await supabase.from("instagram_flow_runs").update({
            status: "waiting",
            current_node_id: node.id,
            context,
          }).eq("id", run_id);

          // Schedule resume
          if (result.waitSeconds) {
            // Will be handled by flow-resume-worker cron
          }
          break;
        }

        if (result.action === "pause_contact") {
          await supabase.from("instagram_flow_runs").update({
            status: "completed",
            current_node_id: node.id,
            context,
            paused_by_contact_rule: true,
            completed_at: new Date().toISOString(),
          }).eq("id", run_id);
          break;
        }

        if (result.action === "handoff") {
          // Cancel this run
          await supabase.from("instagram_flow_runs").update({
            status: "completed",
            current_node_id: node.id,
            context,
            completed_at: new Date().toISOString(),
          }).eq("id", run_id);

          // Update thread mode
          await supabase.from("instagram_threads").update({
            current_mode: "human_active",
          }).eq("id", run.thread_id);
          break;
        }

        // Find next node
        const outEdges = edgesBySource.get(node.id) || [];
        let nextNodeId: string | null = null;

        if (result.selectedHandle) {
          const matchedEdge = outEdges.find((e: FlowEdge) => e.source_handle === result.selectedHandle);
          nextNodeId = matchedEdge?.target_node_id || null;
        } else if (outEdges.length === 1) {
          nextNodeId = outEdges[0].target_node_id;
        } else if (outEdges.length > 1) {
          // For condition nodes, use selectedHandle; otherwise take first
          nextNodeId = outEdges[0].target_node_id;
        }

        // Update run
        await supabase.from("instagram_flow_runs").update({
          current_node_id: nextNodeId,
          context,
        }).eq("id", run_id);

        currentNodeId = nextNodeId;

      } catch (nodeErr: unknown) {
        const nodeErrMsg = nodeErr instanceof Error ? nodeErr.message : String(nodeErr);
        await supabase.from("instagram_flow_run_steps").update({
          status: "failed",
          error_message: nodeErrMsg,
          completed_at: new Date().toISOString(),
        }).eq("id", step!.id);

        await failRun(supabase, run_id, nodeErrMsg);

        await failRun(supabase, run_id, nodeErr.message);
        break;
      }
    }

    if (stepCount >= MAX_STEPS) {
      await failRun(supabase, run_id, "Max steps exceeded");
    }

    return new Response(JSON.stringify({ ok: true, steps: stepCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[flow-runner] Error:", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function failRun(supabase: ReturnType<typeof createClient>, runId: string, error: string) {
  await supabase.from("instagram_flow_runs").update({
    status: "failed",
    error_message: error,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);
}
