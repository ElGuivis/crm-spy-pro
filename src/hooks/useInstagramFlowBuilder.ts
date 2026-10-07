import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { createLogger } from '@/lib/logger';
const log = createLogger('useInstagramFlowBuilder');

export interface FlowNode {
  id: string;
  tenant_id: string;
  version_id: string;
  node_type: string;
  label: string | null;
  config: Json;
  position_x: number;
  position_y: number;
  is_entry: boolean;
}

export interface FlowEdge {
  id: string;
  tenant_id: string;
  version_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  label: string | null;
  condition: Json | null;
}

export interface FlowVersion {
  id: string;
  flow_id: string;
  version_number: number;
  status: string;
  published_at: string | null;
}

export function useInstagramFlowBuilder(flowId: string | null) {
  const { tenantId } = useAuth();
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [flow, setFlow] = useState<Record<string, unknown> | null>(null);

  // Load flow & versions
  const loadFlow = useCallback(async () => {
    if (!flowId || !tenantId) return;
    setIsLoading(true);
    try {
      const { data: flowData } = await supabase
        .from("instagram_flows")
        .select("id, tenant_id, channel_id, name, description, status, live_version_id, allow_parallel_runs, created_at, updated_at")
        .eq("id", flowId)
        .single();
      setFlow(flowData);

      const { data: vers } = await supabase
        .from("instagram_flow_versions")
        .select("id, flow_id, version_number, status, published_at")
        .eq("flow_id", flowId)
        .order("version_number", { ascending: false });

      const vList = (vers || []) as unknown as FlowVersion[];
      setVersions(vList);

      // Use draft version or create one
      let draft = vList.find((v) => v.status === "draft");
      if (!draft) {
        const nextNum = vList.length > 0 ? Math.max(...vList.map((v) => v.version_number)) + 1 : 1;
        const { data: newVer } = await supabase
          .from("instagram_flow_versions")
          .insert({ tenant_id: tenantId, flow_id: flowId, version_number: nextNum })
          .select("id, flow_id, version_number, status, published_at")
          .single();
        draft = newVer as unknown as FlowVersion;
        setVersions([draft!, ...vList]);
      }

      setCurrentVersionId(draft!.id);
      await loadNodesEdges(draft!.id);
    } catch (err) {
      log.error("[useInstagramFlowBuilder] Error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [flowId, tenantId]);

  const loadNodesEdges = async (versionId: string) => {
    const [{ data: n }, { data: e }] = await Promise.all([
      supabase.from("instagram_flow_nodes").select("id, tenant_id, version_id, node_type, label, config, position_x, position_y, is_entry").eq("version_id", versionId),
      supabase.from("instagram_flow_edges").select("id, tenant_id, version_id, source_node_id, target_node_id, source_handle, label, condition").eq("version_id", versionId),
    ]);
    setNodes((n || []) as unknown as FlowNode[]);
    setEdges((e || []) as unknown as FlowEdge[]);
  };

  useEffect(() => { loadFlow(); }, [loadFlow]);

  const saveDraft = async (updatedNodes: FlowNode[], updatedEdges: FlowEdge[]) => {
    if (!currentVersionId || !tenantId) return;
    setIsSaving(true);
    try {
      // Atomic replace via RPC (transacao unica)
      const nodesPayload = updatedNodes.map(n => ({
        id: n.id,
        node_type: n.node_type,
        label: n.label,
        config: n.config,
        position_x: n.position_x,
        position_y: n.position_y,
        is_entry: n.is_entry,
      }));
      const edgesPayload = updatedEdges.map(e => ({
        id: e.id,
        source_node_id: e.source_node_id,
        target_node_id: e.target_node_id,
        source_handle: e.source_handle,
        label: e.label,
        condition: e.condition,
      }));
      const { error } = await supabase.rpc("replace_instagram_flow_version", {
        p_version_id: currentVersionId,
        p_tenant_id: tenantId,
        p_nodes: nodesPayload as unknown as Json,
        p_edges: edgesPayload as unknown as Json,
      });
      if (error) throw error;

      setNodes(updatedNodes);
      setEdges(updatedEdges);
      toast.success("Rascunho salvo");
    } catch (err) {
      log.error("[saveDraft] Error:", err);
      toast.error("Erro ao salvar rascunho");
    } finally {
      setIsSaving(false);
    }
  };

  const publish = async () => {
    if (!flowId || !currentVersionId) return false;
    const { data, error } = await supabase.functions.invoke("instagram-publish-flow-version", {
      body: { flow_id: flowId, version_id: currentVersionId },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao publicar");
      return false;
    }
    toast.success("Fluxo publicado com sucesso");
    await loadFlow();
    return true;
  };

  return {
    flow,
    versions,
    currentVersionId,
    nodes,
    edges,
    isLoading,
    isSaving,
    saveDraft,
    publish,
    setCurrentVersionId,
    loadNodesEdges,
    reload: loadFlow,
  };
}
