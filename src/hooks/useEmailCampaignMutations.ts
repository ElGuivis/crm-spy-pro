import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { CreateEmailCampaignInput } from "./useEmailCampaigns";
import type { Json } from "@/integrations/supabase/types";

export function useCreateEmailCampaign() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateEmailCampaignInput) => {
      if (!tenantId) throw new Error('Tenant not found');
      const { data, error } = await supabase.from('email_campaigns').insert({ ...input, content_json: input.content_json as unknown as Json, tenant_id: tenantId }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Campanha criada com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao criar campanha: ${error.message}`); },
  });
}

export function useUpdateEmailCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateEmailCampaignInput> & { status?: "canceled" | "draft" | "error" | "paused" | "scheduled" | "sending" | "sent" } }) => {
      const { data, error } = await supabase.from('email_campaigns').update({ ...updates, content_json: updates.content_json as unknown as Json | undefined }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Campanha atualizada com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao atualizar campanha: ${error.message}`); },
  });
}

export function useDeleteEmailCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Campanha excluída com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao excluir campanha: ${error.message}`); },
  });
}

export function useArchiveEmailCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_campaigns').update({ is_archived: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Campanha arquivada com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao arquivar campanha: ${error.message}`); },
  });
}

export function useDuplicateEmailCampaign() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error('Tenant not found');
      const { data: original, error: fetchError } = await supabase.from('email_campaigns').select('internal_name, subject, preheader, sender_name, sender_email, reply_to, campaign_type, template_id, content_html, content_json, audience_type, audience_reference, email_integration_id, coupon_codes, attribution_window_days, skip_recent_days, unique_coupon').eq('id', id).single();
      if (fetchError) throw fetchError;
      const { data, error } = await supabase.from('email_campaigns').insert({ tenant_id: tenantId, internal_name: `${original.internal_name} (Cópia)`, subject: original.subject, preheader: original.preheader, sender_name: original.sender_name, sender_email: original.sender_email, reply_to: original.reply_to, campaign_type: original.campaign_type, template_id: original.template_id, content_html: original.content_html, content_json: original.content_json, audience_type: original.audience_type, audience_reference: original.audience_reference, email_integration_id: original.email_integration_id, coupon_codes: original.coupon_codes, attribution_window_days: original.attribution_window_days, skip_recent_days: original.skip_recent_days, unique_coupon: original.unique_coupon, status: 'draft' }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Campanha duplicada com sucesso!'); },
    onError: (error: Error) => { toast.error(`Erro ao duplicar campanha: ${error.message}`); },
  });
}

export interface AutoWinnerOptions { /** % da lista usada no teste (metade recebe A, metade recebe B) */ testPct: number; /** horas de espera antes de enviar o vencedor para o resto */ hours: number }

const AB_COPY_FIELDS = 'internal_name, subject, preheader, sender_name, sender_email, reply_to, campaign_type, template_id, content_html, content_json, audience_type, audience_reference, email_integration_id, coupon_codes, attribution_window_days, skip_recent_days, unique_coupon';

export function useCreateABTest() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();
  return useMutation({
    mutationFn: async ({ campaignId, subjectB, splitPct = 50, autoWinner }: { campaignId: string; subjectB: string; splitPct?: number; autoWinner?: AutoWinnerOptions }) => {
      if (!tenantId) throw new Error('Tenant não encontrado');
      const { data: original, error: fetchErr } = await supabase.from('email_campaigns').select(AB_COPY_FIELDS).eq('id', campaignId).single();
      if (fetchErr) throw fetchErr;
      const abTestId = crypto.randomUUID();
      // com vencedor automático, A e B dividem só a fatia de teste; o resto espera o resultado
      const sliceA = autoWinner ? autoWinner.testPct / 2 : splitPct;
      const sliceB = autoWinner ? autoWinner.testPct / 2 : 100 - splitPct;
      const base = { tenant_id: tenantId, preheader: original.preheader, sender_name: original.sender_name, sender_email: original.sender_email, reply_to: original.reply_to, campaign_type: original.campaign_type, template_id: original.template_id, content_html: original.content_html, content_json: original.content_json, audience_type: original.audience_type, audience_reference: original.audience_reference, email_integration_id: original.email_integration_id, coupon_codes: original.coupon_codes, attribution_window_days: original.attribution_window_days, skip_recent_days: original.skip_recent_days, unique_coupon: original.unique_coupon, status: 'draft' as const, ab_test_id: abTestId };
      const { error: updateA } = await supabase.from('email_campaigns').update({ ab_test_id: abTestId, ab_variant: 'A', ab_split_pct: sliceA, ab_offset_pct: 0 }).eq('id', campaignId);
      if (updateA) throw updateA;
      const { data: variantB, error: insertErr } = await supabase.from('email_campaigns').insert({ ...base, internal_name: `${original.internal_name} — Variante B`, subject: subjectB, ab_variant: 'B', ab_split_pct: sliceB, ab_offset_pct: sliceA }).select().single();
      if (insertErr) throw insertErr;
      if (autoWinner) {
        // o resto da lista: espera A e B e sai com o assunto vencedor (a função email-ab-winner decide e envia)
        const { error: winnerErr } = await supabase.from('email_campaigns').insert({ ...base, internal_name: `${original.internal_name} — Vencedor`, subject: original.subject, ab_variant: 'W', ab_split_pct: 100 - autoWinner.testPct, ab_offset_pct: autoWinner.testPct, ab_auto_winner: true, ab_winner_hours: autoWinner.hours });
        if (winnerErr) throw winnerErr;
      }
      return variantB;
    },
    onSuccess: (_d, v) => { queryClient.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success(v.autoWinner ? 'Teste A/B criado! Envie A e B; o vencedor sai sozinho para o resto da lista.' : 'Teste A/B criado! Variante B pronta para edição.'); },
    onError: (e: Error) => toast.error(`Erro ao criar A/B: ${e.message}`),
  });
}
