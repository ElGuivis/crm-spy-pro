import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type ConvIntent = 'compra' | 'suporte' | 'reclamacao' | 'outro' | null;
export type ConvSentiment = 'positive' | 'neutral' | 'negative' | null;

export function useConversationAI(conversationId: string | null) {
  const { tenantId } = useAuth();
  const [intent, setIntent] = useState<ConvIntent>(null);
  const [sentiment, setSentiment] = useState<ConvSentiment>(null);
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setIntent(null);
    setSentiment(null);
    if (!conversationId || !tenantId) return;
    if (processedRef.current.has(conversationId)) return;
    processedRef.current.add(conversationId);

    supabase.functions.invoke('ai-assist', {
      body: { action: 'classify', conversation_id: conversationId, tenant_id: tenantId },
    }).then(({ data }) => {
      const i = data?.result?.intent as ConvIntent;
      if (i) {
        setIntent(i);
        supabase.from('conversations').update({ intent: i } as any).eq('id', conversationId);
      }
    }).catch(() => { /* silent */ });

    supabase.functions.invoke('ai-assist', {
      body: { action: 'sentiment', conversation_id: conversationId, tenant_id: tenantId },
    }).then(({ data }) => {
      const s = data?.result?.sentiment as ConvSentiment;
      if (s) {
        setSentiment(s);
        supabase.from('conversations').update({ ai_sentiment: s } as any).eq('id', conversationId);
      }
    }).catch(() => { /* silent */ });
  }, [conversationId, tenantId]);

  return { intent, sentiment };
}
