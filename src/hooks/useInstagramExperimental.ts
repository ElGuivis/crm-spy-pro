import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { createLogger } from '@/lib/logger';
const log = createLogger('useInstagramExperimental');

export interface ChannelCapabilities {
  follow_to_dm: boolean;
  share_to_dm: boolean;
}

export interface FeatureFlag {
  feature_key: string;
  is_enabled: boolean;
}

interface FollowDmConfig {
  id: string;
  channel_id: string;
  tenant_id: string;
  is_active: boolean;
  flow_id: string | null;
  dm_template: string | null;
  delay_seconds: number | null;
  created_at: string;
}

interface ShareDmConfig {
  id: string;
  channel_id: string;
  tenant_id: string;
  is_active: boolean;
  flow_id: string | null;
  dm_template: string | null;
  match_type: string | null;
  match_value: string | null;
  created_at: string;
}

interface IGFlowRef {
  id: string;
  name: string;
}

export function useInstagramExperimental(channelId: string | null) {
  const { tenantId, user } = useAuth();
  const [capabilities, setCapabilities] = useState<ChannelCapabilities>({
    follow_to_dm: false,
    share_to_dm: false,
  });
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [followConfig, setFollowConfig] = useState<FollowDmConfig | null>(null);
  const [shareConfigs, setShareConfigs] = useState<ShareDmConfig[]>([]);
  const [flows, setFlows] = useState<IGFlowRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    supabase
      .from("instagram_channel_capabilities")
      .select("follow_to_dm, share_to_dm")
      .eq("channel_id", channelId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCapabilities({
            follow_to_dm: data.follow_to_dm || false,
            share_to_dm: data.share_to_dm || false,
          });
        }
      });
  }, [channelId]);

  const fetchAll = useCallback(async () => {
    if (!tenantId || !channelId) return;
    setIsLoading(true);
    try {
      const [flagsRes, followRes, shareRes, flowsRes] = await Promise.all([
        supabase.from("instagram_feature_flags").select("id, channel_id, feature_key, is_enabled, enabled_at, enabled_by").eq("channel_id", channelId),
        supabase.from("instagram_follow_dm_configs").select("id, channel_id, tenant_id, is_active, flow_id, dm_template, delay_seconds, created_at").eq("channel_id", channelId).maybeSingle(),
        supabase.from("instagram_share_dm_configs").select("id, channel_id, tenant_id, is_active, flow_id, dm_template, match_type, match_value, created_at").eq("channel_id", channelId),
        supabase.from("instagram_flows").select("id, name").eq("channel_id", channelId),
      ]);
      setFeatureFlags((flagsRes.data || []) as unknown as FeatureFlag[]);
      setFollowConfig((followRes.data as unknown as FollowDmConfig) || null);
      setShareConfigs((shareRes.data || []) as unknown as ShareDmConfig[]);
      setFlows((flowsRes.data || []) as unknown as IGFlowRef[]);
    } catch (err) {
      log.error("[useInstagramExperimental]", err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, channelId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const isFeatureEnabled = (key: string) => {
    return featureFlags.find(f => f.feature_key === key)?.is_enabled || false;
  };

  const isFeatureSupported = (key: string) => {
    if (key === "follow_to_dm") return capabilities.follow_to_dm;
    if (key === "share_to_dm") return capabilities.share_to_dm;
    return false;
  };

  const canEnableFeature = (key: string) => {
    return isFeatureSupported(key);
  };

  const toggleFeatureFlag = async (key: string, enabled: boolean) => {
    if (!tenantId || !channelId) return;
    if (enabled && !canEnableFeature(key)) {
      toast.error("Recurso não suportado pela sua conta");
      return;
    }
    const { error } = await supabase.from("instagram_feature_flags").upsert({
      tenant_id: tenantId,
      channel_id: channelId,
      feature_key: key,
      is_enabled: enabled,
      enabled_at: enabled ? new Date().toISOString() : null,
      enabled_by: enabled ? user?.id : null,
    }, { onConflict: "channel_id,feature_key" });
    if (error) { toast.error("Erro ao atualizar flag"); return; }
    toast.success(enabled ? "Recurso ativado" : "Recurso desativado");
    fetchAll();
  };

  const saveFollowConfig = async (config: Partial<FollowDmConfig>) => {
    if (!tenantId || !channelId) return;
    const payload = { ...config, tenant_id: tenantId, channel_id: channelId };
    if (followConfig?.id) {
      await supabase.from("instagram_follow_dm_configs").update(payload).eq("id", followConfig.id);
    } else {
      await supabase.from("instagram_follow_dm_configs").insert(payload);
    }
    toast.success("Configuração salva");
    fetchAll();
  };

  const saveShareConfig = async (config: Partial<ShareDmConfig> & { id?: string }) => {
    if (!tenantId || !channelId) return;
    const payload = { ...config, tenant_id: tenantId, channel_id: channelId };
    if (config.id) {
      await supabase.from("instagram_share_dm_configs").update(payload).eq("id", config.id);
    } else {
      await supabase.from("instagram_share_dm_configs").insert(payload);
    }
    toast.success("Configuração salva");
    fetchAll();
  };

  const deleteShareConfig = async (id: string) => {
    await supabase.from("instagram_share_dm_configs").delete().eq("id", id);
    toast.success("Removido");
    fetchAll();
  };

  return {
    channelId, capabilities, featureFlags, followConfig, shareConfigs, flows,
    isLoading, isFeatureEnabled, isFeatureSupported, canEnableFeature,
    toggleFeatureFlag, saveFollowConfig, saveShareConfig, deleteShareConfig,
    refetch: fetchAll,
  };
}
