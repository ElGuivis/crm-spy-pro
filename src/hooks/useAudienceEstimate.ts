import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";

export interface AudienceEstimate {
  total_with_email: number;
  suppressed: number;
  eligible: number;
}

export interface AudienceReference {
  segment_id?: string;
  rfm_audience_id?: string;
  filters?: {
    integration_id?: string;
    tag_ids?: string[];
    name_contains?: string;
    email_contains?: string;
    phone_contains?: string;
    doc_contains?: string;
    updated_from?: string;
    updated_to?: string;
  };
  emails?: string[];
}

export function useAudienceEstimate(
  audienceType: string | undefined,
  audienceReference: AudienceReference | undefined,
  enabled = true
) {
  // Memoize the reference to avoid infinite re-renders
  const referenceKey = useMemo(
    () => JSON.stringify(audienceReference || {}),
    [audienceReference]
  );

  return useQuery({
    queryKey: ["audience-estimate", audienceType, referenceKey],
    queryFn: async (): Promise<AudienceEstimate> => {
      if (!audienceType) {
        return { total_with_email: 0, suppressed: 0, eligible: 0 };
      }

      const { data, error } = await (supabase.rpc as any)("estimate_email_audience", {
        _audience_type: audienceType,
        _audience_reference: audienceReference || {},
      });

      if (error) throw error;

      return data as AudienceEstimate;
    },
    enabled: enabled && !!audienceType,
    staleTime: 30_000, // Cache for 30s
    refetchOnWindowFocus: false,
  });
}
