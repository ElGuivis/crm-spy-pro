import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";
import { DEFAULT_FLOW, RECOVERY_KINDS, hhmm, newStepId, parseSteps, type RecoveryFlow, type RecoveryKind, type RecoveryStep } from "@/lib/recovery";
import { recoveryTemplatesFor, PALETTES, withAccent, type TemplateCtx } from "@/components/email-marketing/editor/templates";
import { generateEmailHTML } from "@/components/email-marketing/editor/htmlGenerator";
import type { CouponConfig } from "@/components/email-marketing/CouponConfigFields";

type Flows = Record<RecoveryKind, RecoveryFlow>;

const emptyFlows = (): Flows => Object.fromEntries(RECOVERY_KINDS.map((k) => [k.kind, { ...DEFAULT_FLOW, kind: k.kind }])) as Flows;

/** Os 3 fluxos de recuperação do tenant (cart/browse/order), com valores padrão para os que ainda não foram criados. */
export function useRecoveryFlows() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const key = ["recovery-flows", tenantId];
  const fallback = useRef(emptyFlows()).current; // objeto estável: quem usa em useEffect não entra em laço

  const query = useQuery<Flows>({
    queryKey: key,
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("abandonment_flows").select("*").eq("tenant_id", tenantId!);
      if (error) throw error;
      const flows = emptyFlows();
      for (const r of data ?? []) {
        flows[r.kind as RecoveryKind] = {
          kind: r.kind as RecoveryKind, enabled: r.enabled, enabled_at: r.enabled_at, email_integration_id: r.email_integration_id,
          whatsapp_integration_id: r.whatsapp_integration_id, steps: parseSteps(r.steps), quiet_start: hhmm(r.quiet_start), quiet_end: hhmm(r.quiet_end),
          max_event_age_hours: r.max_event_age_hours, cooldown_days: r.cooldown_days, min_value: Number(r.min_value), opt_out_native: r.opt_out_native,
        };
      }
      return flows;
    },
  });

  const save = useMutation({
    mutationFn: async (flow: RecoveryFlow) => {
      const { error } = await supabase.from("abandonment_flows").upsert({
        tenant_id: tenantId!, kind: flow.kind, enabled: flow.enabled, email_integration_id: flow.email_integration_id, whatsapp_integration_id: flow.whatsapp_integration_id,
        steps: flow.steps as unknown as Json, quiet_start: flow.quiet_start, quiet_end: flow.quiet_end, max_event_age_hours: flow.max_event_age_hours,
        cooldown_days: flow.cooldown_days, min_value: flow.min_value, opt_out_native: flow.opt_out_native,
      }, { onConflict: "tenant_id,kind" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(`Não foi possível salvar o fluxo: ${e.message}`),
  });

  return { flows: query.data ?? fallback, isLoading: query.isLoading, save };
}

/** Cria uma campanha "de fluxo" (guarda o e-mail da etapa, os cupons e as métricas) e devolve o id. */
export async function createStepCampaign(o: {
  tenantId: string; kind: RecoveryKind; stepId: string; name: string; subject: string; preheader: string;
  contentJson: unknown; contentHtml: string; integrationId: string | null; sender: { name: string; email: string };
}): Promise<string> {
  const { data, error } = await supabase.from("email_campaigns").insert({
    tenant_id: o.tenantId, internal_name: o.name, subject: o.subject, preheader: o.preheader, sender_name: o.sender.name, sender_email: o.sender.email,
    campaign_type: "automation", status: "draft", flow_kind: o.kind, flow_step: o.stepId, email_integration_id: o.integrationId,
    content_json: o.contentJson as Json, content_html: o.contentHtml, is_archived: false,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

export interface StepFactoryEnv {
  ctx: Omit<TemplateCtx, "palette">; integrationId: string | null; sender: { name: string; email: string }; paletteId?: string; accent?: string;
}

/**
 * Cria etapas com e-mails prontos (modelos de recuperação com os dados da loja). A etapa 3 dos modelos vem com cupom de 10% por 3 dias
 * (o usuário ajusta no painel). Nada é ligado: o fluxo continua desligado até o usuário ativar.
 */
export function useStepFactory() {
  const { tenantId } = useAuth();
  return useCallback(async (kind: RecoveryKind, env: StepFactoryEnv, only?: { template: number; delay?: number }): Promise<RecoveryStep[]> => {
    if (!tenantId) throw new Error("Tenant não encontrado");
    const palette = withAccent(PALETTES[env.paletteId ?? "dark"] ?? PALETTES.dark, env.accent);
    const templates = recoveryTemplatesFor(kind);
    const chosen = only ? [templates[Math.min(Math.max(only.template, 0), templates.length - 1)]] : templates;
    const out: RecoveryStep[] = [];
    for (const t of chosen) {
      const content = t.build({ ...env.ctx, palette });
      const stepId = newStepId();
      const campaignId = await createStepCampaign({
        tenantId, kind, stepId, name: `Recuperação ${RECOVERY_KINDS.find((k) => k.kind === kind)!.short.toLowerCase()} · ${t.name}`, subject: t.subject, preheader: t.preheader,
        contentJson: content, contentHtml: generateEmailHTML(content), integrationId: env.integrationId, sender: env.sender,
      });
      const coupon: CouponConfig | null = t.usesCoupon ? { tipo: "porcentagem", valor: 10, validade_dias: 3, valor_minimo: null, prefixo: "VOLTE" } : null;
      out.push({ id: stepId, delay_minutes: only?.delay ?? t.delay, email: { enabled: true, campaign_id: campaignId }, whatsapp: { enabled: false, text: "" }, coupon });
    }
    return out;
  }, [tenantId]);
}

/** Etapa removida: o e-mail dela é arquivado (não apagado) para manter as métricas e conversões já registradas. */
export async function archiveStepCampaign(campaignId: string | null) {
  if (campaignId) await supabase.from("email_campaigns").update({ is_archived: true }).eq("id", campaignId);
}