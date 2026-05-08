import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { createLogger } from '@/lib/logger';
const log = createLogger('useInstagramChannel');

export interface InstagramChannel {
  id: string;
  tenant_id: string;
  name: string;
  ig_user_id: string;
  instagram_username: string | null;
  status: string;
  webhook_verified: boolean;
  token_expires_at: string | null;
  token_refresh_at: string | null;
  last_sync_at: string | null;
  last_healthcheck_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InstagramCapabilities {
  id: string;
  channel_id: string;
  comments: boolean;
  private_replies: boolean;
  story_reply: boolean;
  story_mention: boolean;
  live_comments: boolean;
  welcome_ads: boolean;
  ice_breakers: boolean;
  persistent_menu: boolean;
  follow_to_dm: boolean;
  share_to_dm: boolean;
  content_publish: boolean;
  insights: boolean;
  moderation: boolean;
}

export function useInstagramChannel() {
  const { tenantId } = useAuth();
  const [channels, setChannels] = useState<InstagramChannel[]>([]);
  const [capabilitiesMap, setCapabilitiesMap] = useState<Record<string, InstagramCapabilities>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  // Legacy single-channel accessors
  const channel = channels.length > 0 ? channels[0] : null;
  const capabilities = channel ? capabilitiesMap[channel.id] || null : null;

  const fetchChannels = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('instagram_channels')
        .select('id, tenant_id, name, ig_user_id, instagram_username, status, webhook_verified, token_expires_at, token_refresh_at, last_sync_at, last_healthcheck_at, metadata, created_at, updated_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const channelList = (data || []) as InstagramChannel[];
      setChannels(channelList);

      // Fetch capabilities for all channels
      if (channelList.length > 0) {
        const channelIds = channelList.map(c => c.id);
        const { data: caps } = await supabase
          .from('instagram_channel_capabilities')
          .select('id, channel_id, comments, private_replies, story_reply, story_mention, live_comments, welcome_ads, ice_breakers, persistent_menu, follow_to_dm, share_to_dm, content_publish, insights, moderation')
          .in('channel_id', channelIds);
        
        const map: Record<string, InstagramCapabilities> = {};
        if (caps) {
          for (const cap of caps) {
            map[cap.channel_id] = cap as InstagramCapabilities;
          }
        }
        setCapabilitiesMap(map);
      }
    } catch (err) {
      log.error('[useInstagramChannel] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const connect = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-oauth', {
        body: { action: 'generate-oauth-url', origin_url: window.location.origin },
      });

      if (error) throw error;
      if (data?.url) {
        const isInIframe = window.self !== window.top;
        if (isInIframe) {
          const popup = window.open(data.url, 'instagram_oauth', 'width=600,height=700,scrollbars=yes');
          if (popup) {
            const pollTimer = setInterval(async () => {
              if (popup.closed) {
                clearInterval(pollTimer);
                setIsConnecting(false);
                await fetchChannels();
              }
            }, 1000);
          } else {
            window.open(data.url, '_blank');
            setIsConnecting(false);
          }
        } else {
          window.location.href = data.url;
        }
      }
    } catch (err) {
      log.error('[useInstagramChannel] Connect error:', err);
      setIsConnecting(false);
      throw err;
    }
  };

  const disconnect = async (channelId?: string) => {
    const targetId = channelId || channel?.id;
    if (!targetId) return;
    try {
      await supabase.functions.invoke('instagram-oauth', {
        body: { action: 'disconnect', channel_id: targetId },
      });
      await fetchChannels();
    } catch (err) {
      log.error('[useInstagramChannel] Disconnect error:', err);
      throw err;
    }
  };

  const healthcheck = async (channelId?: string) => {
    const targetId = channelId || channel?.id;
    if (!targetId) return;
    try {
      const { data } = await supabase.functions.invoke('instagram-healthcheck', {
        body: { channel_id: targetId },
      });
      await fetchChannels();
      return data;
    } catch (err) {
      log.error('[useInstagramChannel] Healthcheck error:', err);
      throw err;
    }
  };

  return {
    channel,
    channels,
    capabilities,
    capabilitiesMap,
    isLoading,
    isConnecting,
    connect,
    disconnect,
    healthcheck,
    refetch: fetchChannels,
  };
}
