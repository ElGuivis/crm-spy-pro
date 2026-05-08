import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const logger = createLogger("InstagramFlows");

interface IGTriggerRule {
  id: string;
  trigger_type: string;
  trigger_value: string | null;
  flow_id: string;
}

interface IGFlowVersion {
  id: string;
  version_number: number;
  status: string;
  published_at: string | null;
}

export interface IGFlow {
  id: string;
  tenant_id: string;
  channel_id: string;
  name: string;
  description: string | null;
  status: string;
  live_version_id: string | null;
  allow_parallel_runs: boolean;
  created_at: string;
  updated_at: string;
  trigger_rules?: IGTriggerRule[];
  versions?: IGFlowVersion[];
  runs_count?: number;
}

export function useInstagramFlows(channelId: string | null) {
  const { tenantId } = useAuth();
  const [flows, setFlows] = useState<IGFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFlows = useCallback(async () => {
    if (!tenantId || !channelId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("instagram_flows")
        .select("id, tenant_id, channel_id, name, description, status, live_version_id, allow_parallel_runs, created_at, updated_at, trigger_rules:instagram_trigger_rules(id, trigger_type, trigger_value, flow_id), versions:instagram_flow_versions!instagram_flow_versions_flow_id_fkey(id, version_number, status, published_at)")
        .eq("channel_id", channelId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setFlows((data || []) as unknown as IGFlow[]);
    } catch (err: unknown) {
      logger.error("Error fetching flows", err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, channelId]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const createFlow = async (name: string, description?: string) => {
    if (!tenantId || !channelId) return null;
    const { data, error } = await supabase
      .from("instagram_flows")
      .insert({ tenant_id: tenantId, channel_id: channelId, name, description })
      .select("id, tenant_id, channel_id, name, description, live_version_id, is_active, created_at, updated_at")
      .single();
    if (error) { toast.error("Erro ao criar fluxo"); return null; }
    await fetchFlows();
    toast.success("Fluxo criado");
    return data;
  };

  const duplicateFlow = async (flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    if (!flow) return;
    await createFlow(`${flow.name} (cópia)`, flow.description || undefined);
  };

  const deleteFlow = async (flowId: string) => {
    try {
      // Get all version IDs for this flow
      const { data: versions } = await supabase
        .from("instagram_flow_versions")
        .select("id")
        .eq("flow_id", flowId);
      
      const versionIds = (versions || []).map((v) => v.id);
      
      if (versionIds.length > 0) {
        // Delete edges and nodes for all versions
        await supabase.from("instagram_flow_edges").delete().in("version_id", versionIds);
        await supabase.from("instagram_flow_nodes").delete().in("version_id", versionIds);
      }

      // Delete trigger rules, versions, then flow
      await supabase.from("instagram_trigger_rules").delete().eq("flow_id", flowId);
      
      // Clear live_version_id reference before deleting versions
      await supabase.from("instagram_flows").update({ live_version_id: null }).eq("id", flowId);
      
      if (versionIds.length > 0) {
        await supabase.from("instagram_flow_versions").delete().in("id", versionIds);
      }

      const { data: deletedFlow, error } = await supabase
        .from("instagram_flows")
        .delete()
        .eq("id", flowId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!deletedFlow) throw new Error("Sem permissão para excluir este fluxo");

      toast.success("Fluxo excluído");
      fetchFlows();
    } catch (err: unknown) {
      logger.error("Error deleting flow", err);
      toast.error("Erro ao excluir fluxo: " + (err instanceof Error ? err.message : ""));
    }
  };

  const archiveFlow = async (flowId: string) => {
    const { error } = await supabase
      .from("instagram_flows")
      .update({ status: "archived" })
      .eq("id", flowId);
    if (error) { toast.error("Erro ao arquivar"); return; }
    toast.success("Fluxo arquivado");
    fetchFlows();
  };

  const publishFlow = async (flowId: string, versionId: string) => {
    const { data, error } = await supabase.functions.invoke("instagram-publish-flow-version", {
      body: { flow_id: flowId, version_id: versionId },
    });
    if (error || data?.error) {
      toast.error(data?.error || "Erro ao publicar");
      return false;
    }
    toast.success("Fluxo publicado");
    fetchFlows();
    return true;
  };

  const rollbackFlow = async (flowId: string, versionId: string) => {
    const { error } = await supabase
      .from("instagram_flows")
      .update({ live_version_id: versionId })
      .eq("id", flowId);
    if (error) { toast.error("Erro ao fazer rollback"); return; }
    toast.success("Rollback realizado");
    fetchFlows();
  };

  return {
    flows,
    isLoading,
    channelId,
    createFlow,
    duplicateFlow,
    deleteFlow,
    archiveFlow,
    publishFlow,
    rollbackFlow,
    refetch: fetchFlows,
  };
}
