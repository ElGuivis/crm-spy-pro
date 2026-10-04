import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCampaignRecipients, SEGMENTS, type Segment } from "@/hooks/useCampaignRecipientsExport";

/**
 * Cria um rascunho novo com o mesmo e-mail e como público a lista manual de um segmento da campanha (ex.: quem não abriu).
 * Passa pela lista manual de propósito: assim estimativa, descadastrados e envio funcionam como em qualquer campanha.
 */
export function useResendToSegment() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async ({ campaignId, segment }: { campaignId: string; segment: Segment }) => {
      if (!tenantId) throw new Error("Tenant não encontrado");
      const rows = await fetchCampaignRecipients(tenantId, campaignId, segment);
      if (rows.length === 0) throw new Error("Esse segmento está vazio, não há para quem reenviar.");

      const { data: o, error: fetchError } = await supabase.from("email_campaigns")
        .select("internal_name, subject, preheader, sender_name, sender_email, reply_to, campaign_type, template_id, content_html, content_json, email_integration_id, coupon_codes, attribution_window_days, skip_recent_days")
        .eq("id", campaignId).single();
      if (fetchError) throw fetchError;

      const names: Record<string, string> = {};
      for (const r of rows) if (r.name) names[r.email] = r.name;
      const label = SEGMENTS.find((s) => s.value === segment)?.label ?? segment;
      const { data, error } = await supabase.from("email_campaigns").insert({
        tenant_id: tenantId, status: "draft", internal_name: `${o.internal_name} — Reenvio (${label})`,
        subject: o.subject, preheader: o.preheader, sender_name: o.sender_name, sender_email: o.sender_email, reply_to: o.reply_to,
        campaign_type: o.campaign_type, template_id: o.template_id, content_html: o.content_html, content_json: o.content_json,
        email_integration_id: o.email_integration_id, coupon_codes: o.coupon_codes, attribution_window_days: o.attribution_window_days, skip_recent_days: o.skip_recent_days,
        audience_type: "manual", audience_reference: JSON.stringify({ emails: rows.map((r) => r.email), names }),
      }).select().single();
      if (error) throw error;
      return { campaign: data, count: rows.length };
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
      toast.success(`Rascunho criado com ${count} destinatário(s). Ajuste o assunto na lista de campanhas e envie.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
