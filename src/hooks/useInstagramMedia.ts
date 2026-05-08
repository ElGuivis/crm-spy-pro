import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useInstagramMedia');

export interface InstagramMedia {
  id: string;
  media_type: string;
  thumbnail_url: string | null;
  caption: string | null;
  permalink: string | null;
  timestamp: string | null;
}

interface FetchResult {
  media: InstagramMedia[];
  paging: { cursors?: { after?: string } } | null;
}

export function useInstagramMedia() {
  const [media, setMedia] = useState<InstagramMedia[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [afterCursor, setAfterCursor] = useState<string | null>(null);

  const fetchMedia = useCallback(async (type: 'post' | 'reel' | 'all' = 'all', loadMore = false) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ type, limit: '25' });
      if (loadMore && afterCursor) params.set('after', afterCursor);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const resp = await supabase.functions.invoke('instagram-list-media', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: null,
        method: 'GET',
      });

      // supabase.functions.invoke doesn't support query params, so use fetch directly
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      const fetchResp = await fetch(`${baseUrl}/functions/v1/instagram-list-media?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!fetchResp.ok) throw new Error('Failed to fetch media');

      const result: FetchResult = await fetchResp.json();
      
      if (loadMore) {
        setMedia(prev => [...prev, ...result.media]);
      } else {
        setMedia(result.media);
      }
      
      setAfterCursor(result.paging?.cursors?.after || null);
      setHasMore(!!result.paging?.cursors?.after);
    } catch (err) {
      log.error('[useInstagramMedia] fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [afterCursor]);

  return { media, isLoading, hasMore, fetchMedia };
}
