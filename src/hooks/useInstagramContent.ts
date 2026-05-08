import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ContentItem {
  id: string;
  tenant_id: string;
  channel_id: string;
  content_type: string;
  caption: string | null;
  media_urls: string[] | null;
  cover_url: string | null;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
  ig_media_id: string | null;
  error_message: string | null;
  created_by: string | null;
  ig_permalink: string | null;
  [key: string]: unknown;
}

export function useInstagramContent(channelId: string | null) {
  const { tenantId, user } = useAuth();
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchContent = useCallback(async () => {
    if (!tenantId || !channelId) return;
    setIsLoading(true);

    let query = supabase
      .from("instagram_content")
      .select("id, tenant_id, channel_id, content_type, caption, media_urls, cover_url, status, published_at, scheduled_at, ig_media_id, error_message, created_by, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    setContentList((data || []) as unknown as ContentItem[]);
    setIsLoading(false);
  }, [tenantId, channelId, statusFilter]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const createContent = async (content: {
    content_type: string;
    caption: string;
    media_urls: string[];
    cover_url?: string;
  }) => {
    if (!tenantId || !channelId) return;
    const { error } = await supabase.from("instagram_content").insert({
      tenant_id: tenantId,
      channel_id: channelId,
      content_type: content.content_type,
      caption: content.caption,
      media_urls: content.media_urls,
      cover_url: content.cover_url || null,
      created_by: user?.id,
    });
    if (error) throw error;
    toast.success("Conteúdo criado como rascunho");
    await fetchContent();
  };

  const publishContent = async (contentId: string) => {
    const { data, error } = await supabase.functions.invoke("instagram-publish-content", {
      body: { content_id: contentId },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    toast.success("Conteúdo publicado!");
    await fetchContent();
  };

  const scheduleContent = async (contentId: string, scheduledAt: string) => {
    const { data, error } = await supabase.functions.invoke("instagram-schedule-content", {
      body: { content_id: contentId, scheduled_at: scheduledAt },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    toast.success("Conteúdo agendado!");
    await fetchContent();
  };

  const deleteContent = async (contentId: string) => {
    await supabase.from("instagram_content").delete().eq("id", contentId);
    toast.success("Conteúdo removido");
    await fetchContent();
  };

  return {
    channelId, contentList, isLoading, statusFilter, setStatusFilter,
    createContent, publishContent, scheduleContent, deleteContent,
    refetch: fetchContent,
  };
}
