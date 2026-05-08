import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-flow-resume-worker", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find runs in "waiting" status where wait has elapsed
    const { data: waitingRuns } = await supabase
      .from("instagram_flow_runs")
      .select("*, steps:instagram_flow_run_steps(node_id, node_type, output, completed_at)")
      .eq("status", "waiting")
      .limit(50);

    if (!waitingRuns || waitingRuns.length === 0) {
      return new Response(JSON.stringify({ ok: true, resumed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let resumed = 0;

    for (const run of waitingRuns) {
      // Get the last completed step (should be a wait node)
      const lastStep = (run.steps || [])
        .filter((s: Record<string, unknown>) => s.completed_at)
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0];

      if (!lastStep || lastStep.node_type !== "wait") continue;

      const waitSeconds = lastStep.output?.waitSeconds || 60;
      const completedAt = new Date(lastStep.completed_at);
      const resumeAt = new Date(completedAt.getTime() + waitSeconds * 1000);

      if (new Date() < resumeAt) continue;

      // Get next node from edges
      const { data: version } = await supabase
        .from("instagram_flow_versions")
        .select("snapshot")
        .eq("id", run.version_id)
        .single();

      if (!version?.snapshot) continue;

      const edges = version.snapshot.edges || [];
      const nextEdge = edges.find((e: Record<string, unknown>) => e.source_node_id === run.current_node_id);
      if (!nextEdge) {
        await supabase.from("instagram_flow_runs").update({
          status: "completed",
          completed_at: new Date().toISOString(),
        }).eq("id", run.id);
        continue;
      }

      // Resume
      await supabase.from("instagram_flow_runs").update({
        status: "running",
        current_node_id: nextEdge.target_node_id,
      }).eq("id", run.id);

      await supabase.functions.invoke("instagram-flow-runner", {
        body: { run_id: run.id, resume_from_node_id: nextEdge.target_node_id },
      });

      resumed++;
    }

    // Also clean up expired contact pauses
    await supabase
      .from("instagram_contact_pauses")
      .delete()
      .not("paused_until", "is", null)
      .lt("paused_until", new Date().toISOString());

    return new Response(JSON.stringify({ ok: true, resumed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[flow-resume-worker] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
