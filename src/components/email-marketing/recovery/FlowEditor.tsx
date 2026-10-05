import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Save, Sparkles, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRecoveryFlows, useStepFactory, archiveStepCampaign } from "@/hooks/useRecoveryFlows";
import { useRecoveryEnv } from "@/hooks/useRecoveryEnv";
import { useNativeStatus } from "@/hooks/useRecoveryData";
import { useTemplateContext } from "@/hooks/useTemplateContext";
import { DELAY_OPTIONS, MAX_STEPS, RECOVERY_KINDS, checkFlow, type RecoveryFlow, type RecoveryKind, type RecoveryStep } from "@/lib/recovery";
import { StepCard } from "./StepCard";
import { StepEmailDialog } from "./StepEmailDialog";
import { FlowSettings } from "./FlowSettings";

/** Editor de um fluxo (carrinho, navegação ou pedido): liga/desliga, etapas e regras. Tudo nasce desligado. */
export function FlowEditor({ kind }: { kind: RecoveryKind }) {
  const meta = RECOVERY_KINDS.find((k) => k.kind === kind)!;
  const { flows, isLoading, save } = useRecoveryFlows();
  const env = useRecoveryEnv();
  const native = useNativeStatus();
  const tpl = useTemplateContext(true);
  const makeSteps = useStepFactory();

  const stored = flows[kind];
  const [draft, setDraft] = useState<RecoveryFlow>(stored);
  const [dirty, setDirty] = useState(false);
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; usesCoupon: boolean } | null>(null);
  const [confirmEnable, setConfirmEnable] = useState(false);

  useEffect(() => { if (!dirty) setDraft(stored); }, [stored, dirty]);
  // com uma única integração de e-mail, já deixa escolhida
  useEffect(() => {
    if (!draft.email_integration_id && env.emailIntegrations.length === 1) setDraft((d) => ({ ...d, email_integration_id: env.emailIntegrations[0].id }));
  }, [draft.email_integration_id, env.emailIntegrations]);

  const update = (patch: Partial<RecoveryFlow>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const updateStep = (id: string, patch: Partial<RecoveryStep>) => update({ steps: draft.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const nativeOn = native.data?.native.find((n) => n.kind === kind)?.on ?? null;
  const problems = useMemo(() => checkFlow(draft, {
    storeUrl: env.storeUrl, emailIntegrations: env.emailIntegrations.length,
    whatsappConnected: env.whatsapps.find((w) => w.id === draft.whatsapp_integration_id)?.connected ?? false, nativeOn,
  }), [draft, env.storeUrl, env.emailIntegrations.length, env.whatsapps, nativeOn]);
  const errors = problems.filter((p) => p.level === "error");

  const factoryEnv = () => {
    if (!tpl.data) { toast.info("Carregando os dados da loja, tente de novo em instantes."); return null; }
    if (!env.storeUrl) { toast.error("Informe o endereço da loja primeiro (aba Loja Integrada): os links dos e-mails usam ele."); return null; }
    const integ = env.emailIntegrations.find((i) => i.id === draft.email_integration_id) ?? env.emailIntegrations[0];
    return { ctx: tpl.data, integrationId: integ?.id ?? null, sender: { name: integ?.sender_name || tpl.data.brandName || "Loja", email: integ?.sender_email || "" } };
  };

  const createDefaults = async () => {
    const fe = factoryEnv(); if (!fe) return;
    setBuilding(true);
    try {
      const steps = await makeSteps(kind, fe);
      update({ steps, email_integration_id: draft.email_integration_id ?? fe.integrationId });
      toast.success("Etapas criadas. Revise os e-mails e o cupom antes de ligar o fluxo.");
    } catch (e) { toast.error(`Não foi possível criar as etapas: ${(e as Error).message}`); }
    setBuilding(false);
  };

  const addStep = async () => {
    const fe = factoryEnv(); if (!fe) return;
    setBuilding(true);
    try {
      const maxDelay = Math.max(0, ...draft.steps.map((s) => s.delay_minutes));
      const delay = DELAY_OPTIONS.find((d) => d.minutes > maxDelay)?.minutes ?? DELAY_OPTIONS[DELAY_OPTIONS.length - 1].minutes;
      const [step] = await makeSteps(kind, fe, { template: draft.steps.length, delay });
      update({ steps: [...draft.steps, step].sort((a, b) => a.delay_minutes - b.delay_minutes) });
    } catch (e) { toast.error(`Não foi possível criar a etapa: ${(e as Error).message}`); }
    setBuilding(false);
  };

  const removeStep = async (s: RecoveryStep) => {
    await archiveStepCampaign(s.email.campaign_id);
    update({ steps: draft.steps.filter((x) => x.id !== s.id) });
  };

  const persist = async (next: RecoveryFlow) => {
    await save.mutateAsync(next);
    setDirty(false);
  };

  const onToggle = (v: boolean) => {
    if (!v) { persist({ ...draft, enabled: false }).then(() => toast.success("Fluxo desligado")); return; }
    if (errors.length) { toast.error(errors[0].text); return; }
    setConfirmEnable(true);
  };

  if (isLoading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const hasSteps = draft.steps.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{meta.label}</h3>
              {draft.enabled ? <Badge>Ligado</Badge> : <Badge variant="secondary">Desligado</Badge>}
              {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300">Alterações não salvas</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
            {draft.enabled && draft.enabled_at && (
              <p className="text-xs text-muted-foreground mt-1">Atende só quem abandonou depois de {new Date(draft.enabled_at).toLocaleString("pt-BR")}.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{draft.enabled ? "Ligado" : "Desligado"}</span>
            <Switch checked={draft.enabled} disabled={save.isPending || dirty} onCheckedChange={onToggle} aria-label={`Ligar fluxo de ${meta.label}`} />
          </div>
        </CardContent>
      </Card>
      {dirty && <p className="text-xs text-muted-foreground -mt-2">Salve as alterações para poder ligar ou desligar o fluxo.</p>}


      {problems.length > 0 && (
        <div className="space-y-2">
          {problems.map((p, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${p.level === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
              {p.level === "error" ? <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}<span>{p.text}</span>
            </div>
          ))}
        </div>
      )}

      {!hasSteps ? (
        <Card><CardContent className="p-8 text-center space-y-3">
          <Sparkles className="h-8 w-8 mx-auto text-primary" />
          <p className="font-medium">Comece com 3 etapas prontas</p>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Criamos os e-mails com os produtos e a identidade da sua loja: um lembrete, um reforço e a última chance com cupom único por pessoa. Você edita tudo depois, e o fluxo continua desligado até você ligar.
          </p>
          <Button onClick={createDefaults} disabled={building} className="gap-2">{building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Criar etapas padrão</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {draft.steps.map((s, i) => (
            <StepCard key={s.id} index={i} step={s} usedDelays={draft.steps.filter((x) => x.id !== s.id).map((x) => x.delay_minutes)}
              whatsappAvailable={env.whatsapps.length > 0}
              onChange={(patch) => updateStep(s.id, patch)} onRemove={() => removeStep(s)}
              onEditEmail={() => setEditing({ id: s.email.campaign_id, usesCoupon: !!s.coupon })} />
          ))}
          <Button variant="outline" className="gap-2" disabled={building || draft.steps.length >= MAX_STEPS} onClick={addStep}>
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Adicionar etapa{draft.steps.length >= MAX_STEPS ? ` (máximo ${MAX_STEPS})` : ""}
          </Button>
        </div>
      )}

      <FlowSettings flow={draft} onChange={update} emailIntegrations={env.emailIntegrations} whatsapps={env.whatsapps} nativeName={meta.nativeName} nativeOn={nativeOn} />

      {dirty && (
        <div className="sticky bottom-4 flex justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
          <Button variant="ghost" onClick={() => { setDraft(stored); setDirty(false); }}>Descartar</Button>
          <Button onClick={() => persist(draft).then(() => toast.success("Fluxo salvo"))} disabled={save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar alterações
          </Button>
        </div>
      )}

      <StepEmailDialog open={!!editing} campaignId={editing?.id ?? null} usesCoupon={!!editing?.usesCoupon} onOpenChange={(o) => { if (!o) setEditing(null); }} />

      <AlertDialog open={confirmEnable} onOpenChange={setConfirmEnable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ligar a recuperação de {meta.short.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">A partir de agora, quem abandonar receberá as {draft.steps.length} etapa(s) configuradas. Abandonos anteriores não são atendidos.</span>
              {nativeOn && !draft.opt_out_native && <span className="block text-amber-700">A automação nativa da Loja Integrada deste tipo está ligada: sem desligá-la (ou ativar "tirar da nativa"), as pessoas podem receber em dobro.</span>}
              {draft.steps.some((s) => s.coupon) && <span className="block">As etapas com cupom criam cupons de uso único na sua loja.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => persist({ ...draft, enabled: true }).then(() => toast.success("Fluxo ligado"))}>Ligar agora</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
