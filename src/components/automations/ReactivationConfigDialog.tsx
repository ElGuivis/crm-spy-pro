import { useState, useEffect, useRef } from "react";
import { Repeat, Percent, Clock, Store, Save, Loader2, MessageSquare, Plus, CalendarClock, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { createLogger } from '@/lib/logger';
const log = createLogger('ReactivationConfigDialog');

interface CycleStep {
  id?: string;
  stepNumber: number;
  delayDays: number;
  messageTemplate: string;
  isActive: boolean;
  useCustomCoupon: boolean;
  couponDiscountPercent: number | null;
  couponDurationDays: number | null;
}

interface ReactivationConfig {
  id?: string;
  name: string;
  integrationId: string | null;
  whatsappIntegrationId: string | null;
  inactivityDays: number;
  maxCycles: number;
  couponDiscountPercent: number;
  couponDurationDays: number;
  messageTemplate: string;
  isActive: boolean;
  cycleSteps: CycleStep[];
}

interface ReactivationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: string | null;
  onSave: () => void;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
}

const STORE_TYPES = ['loja_integrada', 'bling'];
const WHATSAPP_TYPES = ['evolution_whatsapp', 'whatsapp_api', 'z_api'];

const MESSAGE_PLACEHOLDERS = [
  { key: '{{cliente_nome}}', label: 'Nome Completo', description: 'Nome completo do cliente' },
  { key: '{{cliente_primeiro_nome}}', label: 'Primeiro Nome', description: 'Apenas o primeiro nome do cliente' },
  { key: '{{desconto}}', label: '% Desconto', description: 'Porcentagem de desconto do cupom' },
  { key: '{{cupom}}', label: 'Código Cupom', description: 'O código do cupom gerado' },
  { key: '{{validade}}', label: 'Validade', description: 'Data de validade do cupom' },
  { key: '{{dias_inativo}}', label: 'Dias Inativo', description: 'Quantidade de dias sem comprar' },
  { key: '{{ciclo}}', label: 'Nº Ciclo', description: 'Número do ciclo atual (1, 2, 3...)' },
];

const DEFAULT_MESSAGE = 'Olá {{cliente_nome}}! Sentimos sua falta 💜 Faz {{dias_inativo}} dias desde sua última compra. Preparamos um cupom especial de {{desconto}}% para você voltar: *{{cupom}}*. Válido até {{validade}}!';

const defaultConfig: ReactivationConfig = {
  name: "Reativação de Clientes",
  integrationId: null,
  whatsappIntegrationId: null,
  inactivityDays: 30,
  maxCycles: 3,
  couponDiscountPercent: 10,
  couponDurationDays: 7,
  isActive: false,
  messageTemplate: DEFAULT_MESSAGE,
  cycleSteps: [
    { stepNumber: 1, delayDays: 0, messageTemplate: DEFAULT_MESSAGE, isActive: true, useCustomCoupon: false, couponDiscountPercent: null, couponDurationDays: null },
  ],
};

const getStoreIcon = (type: string) => {
  switch (type) {
    case 'loja_integrada': return '🛒';
    case 'bling': return '📦';
    default: return '🏪';
  }
};

const getWhatsAppIcon = (type: string) => {
  switch (type) {
    case 'evolution_whatsapp': return '📱';
    case 'whatsapp_api': return '💬';
    default: return '📲';
  }
};

export function ReactivationConfigDialog({ open, onOpenChange, editingId, onSave }: ReactivationConfigDialogProps) {
  const [config, setConfig] = useState<ReactivationConfig>(defaultConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(0);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const { toast } = useToast();
  const { tenant } = useAuth();

  useEffect(() => {
    if (open) {
      loadIntegrations();
      if (editingId) {
        loadConfig(editingId);
      } else {
        setConfig(defaultConfig);
        setExpandedStep(0);
      }
    }
  }, [open, editingId]);

  const loadIntegrations = async () => {
    setIsLoadingIntegrations(true);
    try {
      const { data } = await supabase
        .from('integrations')
        .select('id, name, type, status')
        .eq('status', 'connected');
      if (data) setIntegrations(data);
    } catch (e) {
      log.error('Error loading integrations:', e);
    } finally {
      setIsLoadingIntegrations(false);
    }
  };

  const loadConfig = async (id: string) => {
    try {
      const [configResult, stepsResult] = await Promise.all([
        supabase
          .from('reactivation_configs')
          .select('id, name, integration_id, whatsapp_integration_id, inactivity_days, max_cycles, coupon_discount_percent, coupon_duration_days, is_active, message_template')
          .eq('id', id)
          .single(),
        supabase
          .from('reactivation_cycle_steps')
          .select('id, step_number, delay_days, message_template, is_active, use_custom_coupon, coupon_discount_percent, coupon_duration_days')
          .eq('config_id', id)
          .order('step_number', { ascending: true }),
      ]);

      if (configResult.error) throw configResult.error;
      const data = configResult.data;
      
      let cycleSteps: CycleStep[] = [];
      if (stepsResult.data && stepsResult.data.length > 0) {
        cycleSteps = stepsResult.data.map(s => ({
          id: s.id,
          stepNumber: s.step_number,
          delayDays: s.delay_days,
          messageTemplate: s.message_template,
          isActive: s.is_active,
          useCustomCoupon: (s as any).use_custom_coupon ?? false,
          couponDiscountPercent: (s as any).coupon_discount_percent ?? null,
          couponDurationDays: (s as any).coupon_duration_days ?? null,
        }));
      } else {
        // Migrate from legacy single message
        cycleSteps = [{
          stepNumber: 1,
          delayDays: 0,
          messageTemplate: data.message_template || DEFAULT_MESSAGE,
          isActive: true,
          useCustomCoupon: false,
          couponDiscountPercent: null,
          couponDurationDays: null,
        }];
      }

      setConfig({
        id: data.id,
        name: data.name || 'Reativação de Clientes',
        integrationId: data.integration_id,
        whatsappIntegrationId: data.whatsapp_integration_id,
        inactivityDays: data.inactivity_days,
        maxCycles: (data as any).max_cycles ?? 0,
        couponDiscountPercent: Number(data.coupon_discount_percent),
        couponDurationDays: data.coupon_duration_days,
        isActive: data.is_active ?? false,
        messageTemplate: data.message_template || DEFAULT_MESSAGE,
        cycleSteps,
      });
      setExpandedStep(0);
    } catch (e) {
      log.error('Error loading config:', e);
      toast({ title: "Erro ao carregar", description: "Não foi possível carregar a configuração.", variant: "destructive" });
    }
  };

  const insertPlaceholder = (stepIndex: number, placeholder: string) => {
    const textarea = textareaRefs.current[stepIndex];
    const steps = [...config.cycleSteps];
    const step = steps[stepIndex];
    if (!textarea) {
      step.messageTemplate += placeholder;
      setConfig({ ...config, cycleSteps: steps });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    step.messageTemplate = step.messageTemplate.substring(0, start) + placeholder + step.messageTemplate.substring(end);
    setConfig({ ...config, cycleSteps: steps });
    setTimeout(() => {
      textarea.focus();
      const pos = start + placeholder.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const addStep = () => {
    const nextNumber = config.cycleSteps.length + 1;
    const lastStep = config.cycleSteps[config.cycleSteps.length - 1];
    const newStep: CycleStep = {
      stepNumber: nextNumber,
      delayDays: lastStep?.delayDays || 7,
      messageTemplate: '',
      isActive: true,
      useCustomCoupon: false,
      couponDiscountPercent: null,
      couponDurationDays: null,
    };
    setConfig({ ...config, cycleSteps: [...config.cycleSteps, newStep] });
    setExpandedStep(config.cycleSteps.length);
  };

  const removeStep = (index: number) => {
    if (config.cycleSteps.length <= 1) return;
    const steps = config.cycleSteps.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setConfig({ ...config, cycleSteps: steps });
    setExpandedStep(Math.min(index, steps.length - 1));
  };

  const updateStep = (index: number, updates: Partial<CycleStep>) => {
    const steps = [...config.cycleSteps];
    steps[index] = { ...steps[index], ...updates };
    setConfig({ ...config, cycleSteps: steps });
  };

  const handleSave = async () => {
    if (!config.integrationId) {
      toast({ title: "Erro", description: "Selecione uma loja", variant: "destructive" });
      return;
    }
    if (!config.whatsappIntegrationId) {
      toast({ title: "Erro", description: "Selecione uma integração WhatsApp", variant: "destructive" });
      return;
    }
    if (config.couponDiscountPercent <= 0 || config.couponDiscountPercent > 100) {
      toast({ title: "Erro", description: "A porcentagem deve estar entre 1 e 100%", variant: "destructive" });
      return;
    }
    if (config.inactivityDays < 1) {
      toast({ title: "Erro", description: "Os dias de inatividade devem ser pelo menos 1", variant: "destructive" });
      return;
    }
    if (config.cycleSteps.length === 0) {
      toast({ title: "Erro", description: "Adicione pelo menos um ciclo de mensagem", variant: "destructive" });
      return;
    }
    for (const step of config.cycleSteps) {
      if (!step.messageTemplate.trim()) {
        toast({ title: "Erro", description: `Ciclo ${step.stepNumber}: mensagem não pode ser vazia`, variant: "destructive" });
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: config.name || 'Reativação de Clientes',
        integration_id: config.integrationId,
        whatsapp_integration_id: config.whatsappIntegrationId,
        inactivity_days: config.inactivityDays,
        max_cycles: config.maxCycles,
        coupon_discount_percent: config.couponDiscountPercent,
        coupon_duration_days: config.couponDurationDays,
        is_active: config.isActive,
        message_template: config.cycleSteps[0]?.messageTemplate || DEFAULT_MESSAGE,
        updated_at: new Date().toISOString(),
      };

      let configId = editingId;

      if (editingId) {
        const { data: existing } = await supabase
          .from('reactivation_configs')
          .select('activated_at, is_active')
          .eq('id', editingId)
          .single();

        if (config.isActive && existing && !existing.activated_at) {
          payload.activated_at = new Date().toISOString();
        }

        const { error } = await supabase.from('reactivation_configs').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        if (config.isActive) {
          payload.activated_at = new Date().toISOString();
        }
        const { data: inserted, error } = await supabase.from('reactivation_configs').insert({ ...payload, tenant_id: tenant?.id }).select('id').single();
        if (error) throw error;
        configId = inserted.id;
      }

      // Save cycle steps
      if (configId) {
        // Delete existing steps and re-insert
        await supabase.from('reactivation_cycle_steps').delete().eq('config_id', configId);

        const stepsToInsert = config.cycleSteps.map((step, idx) => ({
          config_id: configId,
          tenant_id: tenant?.id,
          step_number: idx + 1,
          delay_days: step.delayDays,
          message_template: step.messageTemplate,
          is_active: step.isActive,
          use_custom_coupon: step.useCustomCoupon,
          coupon_discount_percent: step.useCustomCoupon ? step.couponDiscountPercent : null,
          coupon_duration_days: step.useCustomCoupon ? step.couponDurationDays : null,
        }));

        const { error: stepsError } = await supabase.from('reactivation_cycle_steps').insert(stepsToInsert);
        if (stepsError) throw stepsError;
      }

      onSave();
      toast({ title: "Salvo!", description: editingId ? "Configuração atualizada." : "Automação de reativação criada." });
      onOpenChange(false);
    } catch (e) {
      log.error('Error saving:', e);
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const storeIntegrations = integrations.filter(i => STORE_TYPES.includes(i.type));
  const whatsappIntegrations = integrations.filter(i => WHATSAPP_TYPES.includes(i.type));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5 text-violet-500" />
            {editingId ? 'Editar' : 'Nova'} Reativação de Clientes
          </DialogTitle>
          <DialogDescription>
            Reengaje clientes inativos automaticamente com ciclos de mensagens e cupons de desconto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nome da automação</Label>
            <Input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} placeholder="Reativação de Clientes" />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Automação ativa</p>
              <p className="text-xs text-muted-foreground">Apenas pedidos feitos após ativação serão monitorados</p>
            </div>
            <Switch checked={config.isActive} onCheckedChange={(v) => setConfig({ ...config, isActive: v })} />
          </div>

          {/* Store & WhatsApp */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Store className="h-4 w-4" /> Loja *</Label>
              {isLoadingIntegrations ? (
                <div className="flex items-center gap-2 p-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">Carregando...</span></div>
              ) : (
                <Select value={config.integrationId || ''} onValueChange={(v) => setConfig({ ...config, integrationId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                  <SelectContent>
                    {storeIntegrations.map(i => (
                      <SelectItem key={i.id} value={i.id}>{getStoreIcon(i.type)} {i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /> WhatsApp *</Label>
              <Select value={config.whatsappIntegrationId || ''} onValueChange={(v) => setConfig({ ...config, whatsappIntegrationId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o WhatsApp" /></SelectTrigger>
                <SelectContent>
                  {whatsappIntegrations.map(i => (
                    <SelectItem key={i.id} value={i.id}>{getWhatsAppIcon(i.type)} {i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Inactivity days & Max cycles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Dias de inatividade *</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={config.inactivityDays}
                onChange={(e) => setConfig({ ...config, inactivityDays: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Sem compras há {config.inactivityDays}+ dias
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Repeat className="h-4 w-4" /> Máximo de ciclos</Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={config.maxCycles}
                onChange={(e) => setConfig({ ...config, maxCycles: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                {config.maxCycles === 0 ? 'Ilimitado (repete os ciclos)' : `Descarta após ${config.maxCycles} tentativa(s)`}
              </p>
            </div>
          </div>

          {/* Coupon settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Percent className="h-4 w-4" /> Desconto (%)</Label>
              <Input type="number" min={1} max={100} value={config.couponDiscountPercent} onChange={(e) => setConfig({ ...config, couponDiscountPercent: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Validade cupom (dias)</Label>
              <Input type="number" min={1} value={config.couponDurationDays} onChange={(e) => setConfig({ ...config, couponDurationDays: Number(e.target.value) })} />
            </div>
          </div>

          {/* Cycle Steps */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Ciclos de mensagem</Label>
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar ciclo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada ciclo envia uma mensagem diferente. O intervalo define quantos dias após o ciclo anterior (ou após a detecção de inatividade no 1º ciclo).
            </p>

            <div className="space-y-2">
              {config.cycleSteps.map((step, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  {/* Step header */}
                  <div
                    className="flex items-center justify-between p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedStep(expandedStep === index ? null : index)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-mono">
                        {step.stepNumber}º
                      </Badge>
                      <span className="text-sm font-medium">
                        {index === 0 ? 'Primeira mensagem' : `+${step.delayDays} dias após ciclo anterior`}
                      </span>
                      {!step.isActive && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Inativo</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {config.cycleSteps.length > 1 && (
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {expandedStep === index ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {/* Step body */}
                  {expandedStep === index && (
                    <div className="p-3 space-y-3 border-t">
                      <div className="flex items-center gap-3">
                        {index > 0 && (
                          <div className="space-y-1 flex-1">
                            <Label className="text-xs">Dias após ciclo anterior</Label>
                            <Input
                              type="number"
                              min={1}
                              max={365}
                              value={step.delayDays}
                              onChange={(e) => updateStep(index, { delayDays: Number(e.target.value) })}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Ativo</Label>
                          <Switch
                            checked={step.isActive}
                            onCheckedChange={(v) => updateStep(index, { isActive: v })}
                          />
                        </div>
                      </div>

                      {/* Placeholders */}
                      <div className="flex flex-wrap gap-1">
                        {MESSAGE_PLACEHOLDERS.map(p => (
                          <Badge key={p.key} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => insertPlaceholder(index, p.key)}>
                            <Plus className="h-3 w-3 mr-0.5" /> {p.label}
                          </Badge>
                        ))}
                      </div>

                      <Textarea
                        ref={(el) => { textareaRefs.current[index] = el; }}
                        value={step.messageTemplate}
                        onChange={(e) => updateStep(index, { messageTemplate: e.target.value })}
                        rows={4}
                        placeholder={index === 0 ? "Primeira mensagem de reativação..." : `Mensagem do ${step.stepNumber}º ciclo...`}
                      />

                      {/* Per-step coupon settings */}
                      <div className="space-y-2 pt-2 border-t border-dashed">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={step.useCustomCoupon}
                            onCheckedChange={(v) => updateStep(index, { 
                              useCustomCoupon: v,
                              couponDiscountPercent: v ? (step.couponDiscountPercent ?? config.couponDiscountPercent) : null,
                              couponDurationDays: v ? (step.couponDurationDays ?? config.couponDurationDays) : null,
                            })}
                          />
                          <Label className="text-xs">Cupom personalizado neste ciclo</Label>
                        </div>
                        {step.useCustomCoupon && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs flex items-center gap-1"><Percent className="h-3 w-3" /> Desconto (%)</Label>
                              <Input
                                type="number" min={1} max={100}
                                value={step.couponDiscountPercent ?? config.couponDiscountPercent}
                                onChange={(e) => updateStep(index, { couponDiscountPercent: Number(e.target.value) })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Validade (dias)</Label>
                              <Input
                                type="number" min={1}
                                value={step.couponDurationDays ?? config.couponDurationDays}
                                onChange={(e) => updateStep(index, { couponDurationDays: Number(e.target.value) })}
                              />
                            </div>
                          </div>
                        )}
                        {!step.useCustomCoupon && (
                          <p className="text-xs text-muted-foreground">
                            Usando cupom padrão: {config.couponDiscountPercent}% / {config.couponDurationDays} dias
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 text-sm space-y-1">
            <p className="font-medium text-violet-700 dark:text-violet-300">ℹ️ Como funciona</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Apenas pedidos feitos <strong>após a ativação</strong> são considerados</li>
              <li>Clientes sem compras nos últimos <strong>{config.inactivityDays} dias</strong> entram no fluxo</li>
              <li>Cada ciclo envia uma <strong>mensagem diferente</strong> com intervalo configurável</li>
              {config.maxCycles > 0
                ? <li>Após <strong>{config.maxCycles} ciclo(s)</strong> sem resposta, o cliente é descartado</li>
                : <li>Os ciclos se <strong>repetem indefinidamente</strong> enquanto o cliente estiver inativo</li>
              }
            </ul>
          </div>

          {/* Token cost info */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
            <span className="text-muted-foreground">Custo por execução:</span>
            <span className="font-semibold text-primary">5 tokens</span>
          </div>

          {/* Save */}
          <Button className="w-full" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {editingId ? 'Atualizar' : 'Criar'} Automação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
