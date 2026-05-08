import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CommentItem {
  id: string;
  channel_id: string;
  ig_media_id: string | null;
  ig_comment_id: string | null;
  text: string | null;
  commenter_username: string | null;
  commenter_igsid: string | null;
  parent_comment_id: string | null;
  moderation_status: string | null;
  is_hidden: boolean;
  is_deleted: boolean;
  created_at: string;
  is_live_comment: boolean;
  flagged_terms: string[] | null;
  [key: string]: unknown;
}

interface BlockedUser {
  id: string;
  channel_id: string;
  contact_id: string | null;
  ig_user_id: string | null;
  username: string | null;
  reason: string | null;
  blocked_at: string;
  is_active: boolean;
}

interface SpamThread {
  id: string;
  channel_id: string;
  contact_id: string | null;
  thread_status: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  is_spam: boolean;
  spam_marked_at: string | null;
  created_at: string;
  updated_at: string;
  contact: { instagram_username: string | null; display_name: string | null } | null;
}

interface BlacklistTerm {
  id: string;
  tenant_id: string;
  channel_id: string | null;
  term: string;
  action: string;
  is_active: boolean;
  created_at: string;
}

export function useInstagramSocialCare(channelId: string | null) {
  const { tenantId } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [spamThreads, setSpamThreads] = useState<SpamThread[]>([]);
  const [blacklistTerms, setBlacklistTerms] = useState<BlacklistTerm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentFilter, setCommentFilter] = useState<string>("all");
  const [commentSearch, setCommentSearch] = useState("");

  const fetchComments = useCallback(async () => {
    if (!tenantId || !channelId) return;
    let query = supabase
      .from("instagram_comment_queue")
      .select("id, channel_id, ig_media_id, ig_comment_id, text, commenter_username, commenter_igsid, parent_comment_id, moderation_status, is_hidden, is_deleted, created_at")
      .eq("channel_id", channelId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (commentFilter !== "all") {
      query = query.eq("moderation_status", commentFilter);
    }

    const { data } = await query;
    let filtered = (data || []) as unknown as CommentItem[];
    if (commentSearch) {
      const q = commentSearch.toLowerCase();
      filtered = filtered.filter(c =>
        c.text?.toLowerCase().includes(q) ||
        c.commenter_username?.toLowerCase().includes(q)
      );
    }
    setComments(filtered);
  }, [tenantId, channelId, commentFilter, commentSearch]);

  const fetchBlocked = useCallback(async () => {
    if (!tenantId || !channelId) return;
    const { data } = await supabase
      .from("instagram_blocked_users")
      .select("id, channel_id, contact_id, ig_user_id, username, reason, blocked_at, is_active")
      .eq("channel_id", channelId)
      .eq("is_active", true)
      .order("blocked_at", { ascending: false });
    setBlockedUsers((data || []) as unknown as BlockedUser[]);
  }, [tenantId, channelId]);

  const fetchSpam = useCallback(async () => {
    if (!tenantId || !channelId) return;
    const { data } = await supabase
      .from("instagram_threads")
      .select("id, channel_id, contact_id, thread_status, last_message_at, last_message_preview, unread_count, is_spam, spam_marked_at, created_at, updated_at, contact:instagram_contacts(instagram_username, display_name)")
      .eq("channel_id", channelId)
      .eq("is_spam", true)
      .order("spam_marked_at", { ascending: false })
      .limit(50);
    setSpamThreads((data || []) as unknown as SpamThread[]);
  }, [tenantId, channelId]);

  const fetchBlacklist = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("instagram_term_blacklist")
      .select("id, tenant_id, channel_id, term, action, is_active, created_at")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setBlacklistTerms((data || []) as unknown as BlacklistTerm[]);
  }, [tenantId]);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchComments(), fetchBlocked(), fetchSpam(), fetchBlacklist()]);
    setIsLoading(false);
  }, [fetchComments, fetchBlocked, fetchSpam, fetchBlacklist]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const hideComment = async (commentId: string, hide = true) => {
    await supabase.functions.invoke("instagram-hide-comment", {
      body: { channel_id: channelId, comment_id: commentId, hide },
    });
    await fetchComments();
  };

  const deleteComment = async (commentId: string) => {
    await supabase.functions.invoke("instagram-delete-comment", {
      body: { channel_id: channelId, comment_id: commentId },
    });
    await fetchComments();
  };

  const replyToComment = async (commentId: string, text: string) => {
    const result = await supabase.functions.invoke("instagram-send-comment-reply", {
      body: { channel_id: channelId, comment_id: commentId, text },
    });
    if (result.error) throw result.error;
    await fetchComments();
  };

  const sendPrivateReply = async (commentId: string, text: string) => {
    const result = await supabase.functions.invoke("instagram-send-private-reply", {
      body: { channel_id: channelId, comment_id: commentId, text },
    });
    if (result.error) throw result.error;
    await fetchComments();
  };

  const blockUser = async (contactId: string, reason?: string) => {
    await supabase.functions.invoke("instagram-block-user", {
      body: { channel_id: channelId, contact_id: contactId, reason },
    });
    await fetchBlocked();
  };

  const unblockUser = async (contactId: string) => {
    await supabase.functions.invoke("instagram-unblock-user", {
      body: { channel_id: channelId, contact_id: contactId },
    });
    await fetchBlocked();
  };

  const moveToSpam = async (threadId: string) => {
    await supabase.functions.invoke("instagram-move-thread-to-spam", {
      body: { thread_id: threadId, is_spam: true },
    });
    await fetchSpam();
  };

  const removeFromSpam = async (threadId: string) => {
    await supabase.functions.invoke("instagram-move-thread-to-spam", {
      body: { thread_id: threadId, is_spam: false },
    });
    await fetchSpam();
  };

  const addBlacklistTerm = async (term: string, action: string) => {
    if (!tenantId) return;
    await supabase.from("instagram_term_blacklist").insert({
      tenant_id: tenantId,
      channel_id: channelId,
      term,
      action,
    });
    await fetchBlacklist();
  };

  const removeBlacklistTerm = async (id: string) => {
    await supabase.from("instagram_term_blacklist").update({ is_active: false }).eq("id", id);
    await fetchBlacklist();
  };

  return {
    channelId, comments, blockedUsers, spamThreads, blacklistTerms,
    isLoading, commentFilter, setCommentFilter, commentSearch, setCommentSearch,
    hideComment, deleteComment, replyToComment, sendPrivateReply,
    blockUser, unblockUser, moveToSpam, removeFromSpam,
    addBlacklistTerm, removeBlacklistTerm, refetch: fetchAll,
  };
}
