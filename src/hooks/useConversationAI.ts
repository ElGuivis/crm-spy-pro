import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';

const log = createLogger('useConversationAI');

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

    let cancelled = false;

    supabase.functions.invoke('ai-assist', {
      body: { action: 'classify', conversation_id: conversationId, tenant_id: tenantId },
    }).then(({ data }) => {
      if (cancelled) return;
      const i = data?.result?.intent as ConvIntent;
      if (i) {
        setIntent(i);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('conversations') as any).update({ intent: i }).eq('id', conversationId)
          .then(({ error }: { error: unknown }) => {
            if (error) log.error('Failed to persist intent', error);
          });
      }
    }).catch((err) => log.error('classify failed', err));

    supabase.functions.invoke('ai-assist', {
      body: { action: 'sentiment', conversation_id: conversationId, tenant_id: tenantId },
    }).then(({ data }) => {
      if (cancelled) return;
      const s = data?.result?.sentiment as ConvSentiment;
      if (s) {
        setSentiment(s);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from('conversations') as any).update({ ai_sentiment: s }).eq('id', conversationId)
          .then(({ error }: { error: unknown }) => {
            if (error) log.error('Failed to persist sentiment', error);
          });
      }
    }).catch((err) => log.error('sentiment failed', err));

    return () => { cancelled = true; };
  }, [conversationId, tenantId]);

  return { intent, sentiment };
}
