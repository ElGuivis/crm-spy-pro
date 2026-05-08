import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const logger = createLogger("InstagramGrowthTools");

interface IGFlowRef {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface MediaWatchlistItem {
  id: string;
  channel_id: string;
  media_id: string | null;
  media_type: string | null;
  media_url: string | null;
  trigger_keyword: string | null;
  flow_id: string | null;
  dm_template: string | null;
  is_active: boolean;
  created_at: string;
  watch_mode: string | null;
  keywords_include: string[] | null;
  keywords_exclude: string[] | null;
  reply_public_enabled: boolean;
  reply_public_variants: string[] | null;
  private_reply_enabled: boolean;
  private_reply_flow_id: string | null;
  first_comment_only: boolean;
  [key: string]: unknown;
}

interface DeepLinkItem {
  id: string;
  channel_id: string;
  slug: string;
  ref_key: string;
  flow_id: string | null;
  click_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  [key: string]: unknown;
}

interface IceBreakerItem {
  id: string;
  channel_id: string;
  question: string;
  flow_id: string | null;
  payload: string | null;
  sort_order: number;
  is_active: boolean;
  [key: string]: unknown;
}

interface PersistentMenuItem {
  id: string;
  channel_id: string;
  title: string;
  flow_id: string | null;
  payload: string | null;
  sort_order: number;
  is_active: boolean;
  [key: string]: unknown;
}

interface AdWelcomeFlowItem {
  id: string;
  channel_id: string;
  ad_id: string | null;
  flow_id: string | null;
  dm_template: string | null;
  is_active: boolean;
  created_at: string;
  name: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  [key: string]: unknown;
}

export function useInstagramGrowthTools(channelId: string | null) {
  const { tenantId } = useAuth();
  const [flows, setFlows] = useState<IGFlowRef[]>([]);
  const [mediaWatchlist, setMediaWatchlist] = useState<MediaWatchlistItem[]>([]);
  const [deepLinks, setDeepLinks] = useState<DeepLinkItem[]>([]);
  const [iceBreakers, setIceBreakers] = useState<IceBreakerItem[]>([]);
  const [menuItems, setMenuItems] = useState<PersistentMenuItem[]>([]);
  const [adWelcomeFlows, setAdWelcomeFlows] = useState<AdWelcomeFlowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId || !channelId) return;
    setIsLoading(true);
    try {
      const [flowsRes, watchRes, linksRes, ibRes, menuRes, adRes] = await Promise.all([
        supabase.from("instagram_flows").select("id, name").eq("channel_id", channelId),
        supabase.from("instagram_media_watchlist").select("id, channel_id, media_id, media_type, media_url, trigger_keyword, flow_id, dm_template, is_active, created_at").eq("channel_id", channelId).order("created_at", { ascending: false }),
        supabase.from("instagram_deep_links").select("id, channel_id, slug, ref_key, flow_id, click_count, metadata, created_at").eq("channel_id", channelId).order("created_at", { ascending: false }),
        supabase.from("instagram_ice_breakers").select("id, channel_id, question, flow_id, payload, sort_order, is_active").eq("channel_id", channelId).order("sort_order"),
        supabase.from("instagram_persistent_menu_items").select("id, channel_id, title, flow_id, payload, sort_order, is_active").eq("channel_id", channelId).order("sort_order"),
        supabase.from("instagram_ad_welcome_flows").select("id, channel_id, ad_id, flow_id, dm_template, is_active, created_at").eq("channel_id", channelId).order("created_at", { ascending: false }),
      ]);
      setFlows((flowsRes.data || []) as unknown as IGFlowRef[]);
      setMediaWatchlist((watchRes.data || []) as unknown as MediaWatchlistItem[]);
      setDeepLinks((linksRes.data || []) as unknown as DeepLinkItem[]);
      setIceBreakers((ibRes.data || []) as unknown as IceBreakerItem[]);
      setMenuItems((menuRes.data || []) as unknown as PersistentMenuItem[]);
      setAdWelcomeFlows((adRes.data || []) as unknown as AdWelcomeFlowItem[]);
    } catch (err) {
      logger.error("Error fetching growth tools", err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, channelId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveWatchlistItem = async (item: Record<string, unknown>) => {
    const payload = { ...item, tenant_id: tenantId, channel_id: channelId };
    const itemId = item.id as string | undefined;
    if (itemId) {
      const { error } = await supabase.from("instagram_media_watchlist").update(payload).eq("id", itemId);
      if (error) { toast.error("Erro ao salvar"); return; }
    } else {
      const { error } = await supabase.from("instagram_media_watchlist").insert(payload);
      if (error) { toast.error("Erro ao criar"); return; }
    }
    toast.success("Salvo");
    fetchAll();
  };

  const deleteWatchlistItem = async (id: string) => {
    await supabase.from("instagram_media_watchlist").delete().eq("id", id);
    toast.success("Removido");
    fetchAll();
  };

  const generateDeepLink = async (slug: string, refKey: string, flowId?: string, metadata?: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("instagram-generate-deep-link", {
      body: { tenant_id: tenantId, channel_id: channelId, slug, ref_key: refKey, flow_id: flowId, metadata },
    });
    if (error || data?.error) { toast.error(data?.error || "Erro"); return null; }
    toast.success("Deep link gerado");
    fetchAll();
    return data;
  };

  const deleteDeepLink = async (id: string) => {
    await supabase.from("instagram_deep_links").delete().eq("id", id);
    toast.success("Removido");
    fetchAll();
  };

  const saveIceBreakers = async (items: Partial<IceBreakerItem>[]) => {
    const { data, error } = await supabase.functions.invoke("instagram-upsert-ice-breakers", {
      body: { channel_id: channelId, ice_breakers: items },
    });
    if (error || data?.error) { toast.error(data?.error || "Erro"); return; }
    toast.success("Ice breakers salvos");
    fetchAll();
  };

  const savePersistentMenu = async (items: Partial<PersistentMenuItem>[]) => {
    const { data, error } = await supabase.functions.invoke("instagram-upsert-persistent-menu", {
      body: { channel_id: channelId, menu_items: items },
    });
    if (error || data?.error) { toast.error(data?.error || "Erro"); return; }
    toast.success("Menu salvo");
    fetchAll();
  };

  const saveAdWelcomeFlow = async (item: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("instagram-upsert-welcome-ad-flow", {
      body: { ...item, tenant_id: tenantId, channel_id: channelId },
    });
    if (error || data?.error) { toast.error(data?.error || "Erro"); return; }
    toast.success("Salvo");
    fetchAll();
  };

  const deleteAdWelcomeFlow = async (id: string) => {
    await supabase.from("instagram_ad_welcome_flows").delete().eq("id", id);
    toast.success("Removido");
    fetchAll();
  };

  return {
    channelId, flows, mediaWatchlist, deepLinks, iceBreakers, menuItems, adWelcomeFlows,
    isLoading, refetch: fetchAll,
    saveWatchlistItem, deleteWatchlistItem,
    generateDeepLink, deleteDeepLink,
    saveIceBreakers, savePersistentMenu,
    saveAdWelcomeFlow, deleteAdWelcomeFlow,
  };
}
