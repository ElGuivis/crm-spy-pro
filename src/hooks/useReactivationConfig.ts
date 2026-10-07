import { useState, useEffect, useRef } from "react";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/lib/logger";
import {
  type CycleStep, type ReactivationConfig, type Integration,
  DEFAULT_MESSAGE, defaultConfig,
} from "@/components/automations/reactivation/reactivationHelpers";

const log = createLogger("useReactivationConfig");

interface Options {
  open: boolean;
  editingId?: string | null;
  onSave: () => void;
  onOpenChange: (open: boolean) => void;
}

export function useReactivationConfig({ open, editingId, onSave, onOpenChange }: Options) {
  const { toast } = useToast();
  const { tenant } = useAuth();
  const [config, setConfig] = useState<ReactivationConfig>(defaultConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(0);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (!open) return;
    loadIntegrations();
    if (editingId) loadConfig(editingId);
    else { setConfig(defaultConfig); setExpandedStep(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const loadIntegrations = async () => {
    setIsLoadingIntegrations(true);
    try {
      const { data } = await supabase.from("integrations")
        .select("id, name, type, status").eq("status", "connected");
      if (data) setIntegrations(data);
    } catch (e) {
      log.error("Error loading integrations:", e);
    } finally {
      setIsLoadingIntegrations(false);
    }
  };

  const loadConfig = async (id: string) => {
    try {
      const [configResult, stepsResult] = await Promise.all([
        supabase.from("reactivation_configs")
          .select("id, name, integration_id, whatsapp_integration_id, inactivity_days, max_cycles, coupon_discount_percent, coupon_duration_days, is_active, message_template")
          .eq("id", id).single(),
        supabase.from("reactivation_cycle_steps")
          .select("id, step_number, delay_days, message_template, is_active, use_custom_coupon, coupon_discount_percent, coupon_duration_days")
          .eq("config_id", id).order("step_number", { ascending: true }),
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
          useCustomCoupon: s.use_custom_coupon ?? false,
          couponDiscountPercent: s.coupon_discount_percent ?? null,
          couponDurationDays: s.coupon_duration_days ?? null,
        }));
      } else {
        cycleSteps = [{
          stepNumber: 1, delayDays: 0,
          messageTemplate: data.message_template || DEFAULT_MESSAGE,
          isActive: true, useCustomCoupon: false,
          couponDiscountPercent: null, couponDurationDays: null,
        }];
      }

      setConfig({
        id: data.id,
        name: data.name || "Reativação de Clientes",
        integrationId: data.integration_id,
        whatsappIntegrationId: data.whatsapp_integration_id,
        inactivityDays: data.inactivity_days,
        maxCycles: data.max_cycles ?? 0,
        couponDiscountPercent: Number(data.coupon_discount_percent),
        couponDurationDays: data.coupon_duration_days,
        isActive: data.is_active ?? false,
        messageTemplate: data.message_template || DEFAULT_MESSAGE,
        cycleSteps,
      });
      setExpandedStep(0);
    } catch (e) {
      log.error("Error loading config:", e);
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
    const lastStep = config.cycleSteps[config.cycleSteps.length - 1];
    const newStep: CycleStep = {
      stepNumber: config.cycleSteps.length + 1,
      delayDays: lastStep?.delayDays || 7,
      messageTemplate: "",
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
    if (!config.integrationId) { toast({ title: "Erro", description: "Selecione uma loja", variant: "destructive" }); return; }
    if (!config.whatsappIntegrationId) { toast({ title: "Erro", description: "Selecione uma integração WhatsApp", variant: "destructive" }); return; }
    if (config.couponDiscountPercent <= 0 || config.couponDiscountPercent > 100) {
      toast({ title: "Erro", description: "A porcentagem deve estar entre 1 e 100%", variant: "destructive" }); return;
    }
    if (config.inactivityDays < 1) { toast({ title: "Erro", description: "Os dias de inatividade devem ser pelo menos 1", variant: "destructive" }); return; }
    if (config.cycleSteps.length === 0) { toast({ title: "Erro", description: "Adicione pelo menos um ciclo de mensagem", variant: "destructive" }); return; }
    for (const step of config.cycleSteps) {
      if (!step.messageTemplate.trim()) {
        toast({ title: "Erro", description: `Ciclo ${step.stepNumber}: mensagem não pode ser vazia`, variant: "destructive" }); return;
      }
    }

    setIsSaving(true);
    try {
      const payload: TablesUpdate<"reactivation_configs"> = {
        name: config.name || "Reativação de Clientes",
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
        const { data: existing } = await supabase.from("reactivation_configs")
          .select("activated_at, is_active").eq("id", editingId).single();
        if (config.isActive && existing && !existing.activated_at) {
          payload.activated_at = new Date().toISOString();
        }
        const { error } = await supabase.from("reactivation_configs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        if (config.isActive) payload.activated_at = new Date().toISOString();
        const { data: inserted, error } = await supabase.from("reactivation_configs")
          .insert({ ...payload, tenant_id: tenant?.id } as TablesInsert<"reactivation_configs">).select("id").single();
        if (error) throw error;
        configId = inserted.id;
      }

      if (configId) {
        const stepsPayload = config.cycleSteps.map(step => ({
          delay_days: step.delayDays,
          message_template: step.messageTemplate,
          is_active: step.isActive,
          use_custom_coupon: step.useCustomCoupon,
          coupon_discount_percent: step.useCustomCoupon ? step.couponDiscountPercent : null,
          coupon_duration_days: step.useCustomCoupon ? step.couponDurationDays : null,
        }));
        const { error: stepsError } = await supabase.rpc("replace_reactivation_cycle_steps", {
          p_config_id: configId,
          p_tenant_id: tenant?.id,
          p_steps: stepsPayload as unknown as Json,
        });
        if (stepsError) throw stepsError;
      }

      onSave();
      toast({ title: "Salvo!", description: editingId ? "Configuração atualizada." : "Automação de reativação criada." });
      onOpenChange(false);
    } catch (e) {
      log.error("Error saving:", e);
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    config, setConfig, isSaving, integrations, isLoadingIntegrations,
    expandedStep, setExpandedStep, textareaRefs,
    insertPlaceholder, addStep, removeStep, updateStep, handleSave,
  };
}
