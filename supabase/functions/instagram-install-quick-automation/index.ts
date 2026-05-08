import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-install-quick-automation", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId: authTenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tenant_id, channel_id, template_id } = await req.json();
    if (!channel_id || !template_id) throw new Error("Missing required fields");
    if (tenant_id) assertTenantMatch(authTenantId, tenant_id, req);
    const effectiveTenantId = authTenantId;

    await requireResource(supabase, "instagram_channels", channel_id, effectiveTenantId, req);

    // Get template
    const { data: template, error: tErr } = await supabase
      .from("instagram_quick_automation_templates")
      .select("id, name, description, required_capabilities, template_nodes, template_edges")
      .eq("id", template_id)
      .single();

    if (tErr || !template) throw new Error("Template not found");

    // Check capabilities if needed
    if (template.required_capabilities?.length > 0) {
      const { data: caps } = await supabase
        .from("instagram_channel_capabilities")
        .select("capability")
        .eq("channel_id", channel_id)
        .eq("is_enabled", true);

      const enabledCaps = new Set((caps || []).map((c: { capability: string }) => c.capability));
      const missing = template.required_capabilities.filter((c: string) => !enabledCaps.has(c));
      if (missing.length > 0) {
        return new Response(JSON.stringify({ error: `Capabilities ausentes: ${missing.join(", ")}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create flow copy
    const { data: flow, error: fErr } = await supabase
      .from("instagram_flows")
      .insert({
        tenant_id: effectiveTenantId,
        channel_id,
        name: template.name,
        description: `Instalado do template: ${template.description || template.name}`,
      })
      .select("id")
      .single();

    if (fErr) throw fErr;

    // Create draft version
    const { data: version, error: vErr } = await supabase
      .from("instagram_flow_versions")
      .insert({
        tenant_id: effectiveTenantId,
        flow_id: flow.id,
        version_number: 1,
      })
      .select("id")
      .single();

    if (vErr) throw vErr;

    // Copy nodes with new IDs
    const idMap = new Map<string, string>();
    const templateNodes = template.template_nodes || [];
    const nodesInsert = templateNodes.map((n: { id: string; node_type: string; label?: string; config?: Record<string, unknown>; position_x?: number; position_y?: number; is_entry?: boolean }) => {
      const newId = crypto.randomUUID();
      idMap.set(n.id, newId);
      return {
        id: newId,
        tenant_id: effectiveTenantId,
        version_id: version.id,
        node_type: n.node_type,
        label: n.label,
        config: n.config || {},
        position_x: n.position_x || 250,
        position_y: n.position_y || 100,
        is_entry: n.is_entry || false,
      };
    });

    if (nodesInsert.length > 0) {
      const { error: nErr } = await supabase
        .from("instagram_flow_nodes")
        .insert(nodesInsert);
      if (nErr) throw nErr;
    }

    // Copy edges with mapped IDs
    const templateEdges = template.template_edges || [];
    const edgesInsert = templateEdges.map((e: { source_node_id: string; target_node_id: string; source_handle?: string; label?: string; condition?: unknown }) => ({
      id: crypto.randomUUID(),
      tenant_id: effectiveTenantId,
      version_id: version.id,
      source_node_id: idMap.get(e.source_node_id) || e.source_node_id,
      target_node_id: idMap.get(e.target_node_id) || e.target_node_id,
      source_handle: e.source_handle || null,
      label: e.label || null,
      condition: e.condition || null,
    }));

    if (edgesInsert.length > 0) {
      const { error: eErr } = await supabase
        .from("instagram_flow_edges")
        .insert(edgesInsert);
      if (eErr) throw eErr;
    }

    // Record installation
    await supabase.from("instagram_quick_automation_installs").insert({
      tenant_id: effectiveTenantId,
      channel_id,
      template_id,
      flow_id: flow.id,
    });

    return new Response(JSON.stringify({ ok: true, flow_id: flow.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.error("[install-quick-automation]", err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
