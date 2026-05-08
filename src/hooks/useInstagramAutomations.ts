import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { createLogger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';

const log = createLogger('useInstagramAutomations');

export interface KeywordResponse {
  keyword: string;
  dm_message: string;
}

export interface WatchlistRule {
  id: string;
  channel_id: string;
  tenant_id: string;
  media_type: string;
  watch_mode: string;
  media_id: string | null;
  rule_name: string | null;
  keywords_include: string[] | null;
  keywords_exclude: string[] | null;
  first_comment_only: boolean;
  delay_seconds: number | null;
  reply_public_enabled: boolean;
  reply_public_variants: string[] | null;
  round_robin_index: number;
  private_reply_enabled: boolean;
  private_reply_flow_id: string | null;
  dm_message: string | null;
  keyword_responses: KeywordResponse[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AutomationType = 'post' | 'reel' | 'story_reply' | 'story_mention' | 'dm_auto_reply';

const COLUMNS = 'id, channel_id, tenant_id, media_type, watch_mode, media_id, rule_name, keywords_include, keywords_exclude, first_comment_only, delay_seconds, reply_public_enabled, reply_public_variants, round_robin_index, private_reply_enabled, private_reply_flow_id, dm_message, keyword_responses, is_active, created_at, updated_at';

export function useInstagramAutomations(channelId: string | null) {
  const { tenantId } = useAuth();
  const [rules, setRules] = useState<WatchlistRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    if (!channelId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('instagram_media_watchlist')
        .select(COLUMNS)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRules((data || []).map(r => ({
        ...r,
        keyword_responses: Array.isArray(r.keyword_responses) ? r.keyword_responses : [],
      })) as unknown as WatchlistRule[]);
    } catch (err) {
      log.error('[useInstagramAutomations] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [channelId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const getRulesForType = (mediaType: string) => rules.filter(r => r.media_type === mediaType);
  const getActiveRuleForType = (mediaType: string) => rules.find(r => r.media_type === mediaType && r.is_active) || null;

  const upsertRule = async (rule: Partial<WatchlistRule> & { media_type: string }) => {
    if (!tenantId || !channelId) return;

    const { keyword_responses, ...rest } = rule;
    const payload = {
      ...rest,
      tenant_id: tenantId,
      channel_id: channelId,
      keyword_responses: (keyword_responses ?? []) as unknown as Json,
    };

    try {
      if (rule.id) {
        const { error } = await supabase
          .from('instagram_media_watchlist')
          .update(payload)
          .eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('instagram_media_watchlist')
          .insert(payload);
        if (error) throw error;
      }
      toast.success('Automação salva com sucesso!');
      await fetchRules();
    } catch (err) {
      log.error('[useInstagramAutomations] upsert error:', err);
      toast.error('Erro ao salvar automação');
    }
  };

  const toggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('instagram_media_watchlist')
        .update({ is_active: isActive })
        .eq('id', ruleId);
      if (error) throw error;
      toast.success(isActive ? 'Automação ativada' : 'Automação desativada');
      await fetchRules();
    } catch (err) {
      toast.error('Erro ao atualizar automação');
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('instagram_media_watchlist')
        .delete()
        .eq('id', ruleId);
      if (error) throw error;
      toast.success('Automação removida');
      await fetchRules();
    } catch (err) {
      toast.error('Erro ao remover automação');
    }
  };

  return {
    rules,
    isLoading,
    getRulesForType,
    getActiveRuleForType,
    upsertRule,
    toggleRule,
    deleteRule,
    refetch: fetchRules,
  };
}
