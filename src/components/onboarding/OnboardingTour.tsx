import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Check, Rocket, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface TourStep {
  id: string;
  title: string;
  description: string;
  tip?: string;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Bem-vindo ao SpyPro! 🚀',
    description: 'Vamos fazer um tour rápido para você conhecer as principais funcionalidades do seu CRM.',
    tip: 'Você pode reiniciar este tour a qualquer momento nas Configurações.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Aqui você vê uma visão geral de receitas, pedidos, RFM e métricas do seu e-commerce.',
    tip: 'Use as abas para alternar entre Vendas, Atendimento e Campanhas.',
    targetSelector: '[href="/dashboard"]',
    position: 'right',
  },
  {
    id: 'integrations',
    title: 'Integrações',
    description: 'Conecte Loja Integrada, Bling, WhatsApp, Melhor Envio e Instagram para sincronizar seus dados.',
    tip: 'Comece conectando sua loja para importar pedidos e clientes automaticamente.',
    targetSelector: '[href="/integrations"]',
    position: 'right',
  },
  {
    id: 'atendimentos',
    title: 'Atendimentos',
    description: 'Gerencie conversas com clientes via WhatsApp e Instagram em um único lugar com IA.',
    tip: 'Use Ctrl+K para buscar conversas rapidamente.',
    targetSelector: '[href="/atendimentos"]',
    position: 'right',
  },
  {
    id: 'automations',
    title: 'Automações',
    description: 'Configure automações de carrinho abandonado, pós-venda, aniversário e mais.',
    tip: 'Explore a biblioteca de templates para começar sem configurar do zero.',
    targetSelector: '[href="/automations"]',
    position: 'right',
  },
  {
    id: 'notifications',
    title: 'Notificações',
    description: 'Fique por dentro de novos pedidos, estoque baixo e alertas em tempo real.',
    tip: 'Personalize os sons e tipos de alerta em Configurações → Notificações.',
    position: 'top',
  },
];

export function OnboardingTour() {
  const { user } = useAuth();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [dbChecked, setDbChecked] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data?.onboarding_completed) {
        timer = setTimeout(() => { if (!cancelled) setActive(true); }, 2000);
      }
      setDbChecked(true);
    };
    check();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [user?.id]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, currentStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateHighlight = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (step.targetSelector) {
      const el = document.querySelector(step.targetSelector);
      if (el) {
        setHighlightRect(el.getBoundingClientRect());
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    setHighlightRect(null);
  }, [currentStep]);

  useEffect(() => {
    if (!active) return;
    updateHighlight();
    window.addEventListener('resize', updateHighlight);
    return () => window.removeEventListener('resize', updateHighlight);
  }, [active, updateHighlight]);

  const persistComplete = useCallback(async () => {
    if (!user?.id) return;
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('user_id', user.id);
  }, [user?.id]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) setCurrentStep(prev => prev + 1);
    else handleComplete();
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const handleComplete = () => {
    persistComplete();
    setActive(false);
  };

  const handleDismiss = () => {
    persistComplete();
    setActive(false);
  };

  if (!active) return null;

  const step = TOUR_STEPS[currentStep];
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  let tooltipStyle: React.CSSProperties = {};
  if (highlightRect) {
    const pos = step.position || 'right';
    if (pos === 'right') tooltipStyle = { top: highlightRect.top, left: highlightRect.right + 16 };
    else if (pos === 'bottom') tooltipStyle = { top: highlightRect.bottom + 16, left: highlightRect.left };
    else if (pos === 'top') tooltipStyle = { top: highlightRect.top - 240, left: highlightRect.left };
    else tooltipStyle = { top: highlightRect.top, left: highlightRect.left - 340 };
  } else {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999]">
        <div className="absolute inset-0 bg-black/60" onClick={handleDismiss} />
        {highlightRect && (
          <motion.div
            layoutId="tour-highlight"
            className="absolute border-2 border-primary rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] z-[1] pointer-events-none"
            style={{ top: highlightRect.top - 4, left: highlightRect.left - 4, width: highlightRect.width + 8, height: highlightRect.height + 8 }}
            transition={{ duration: 0.3 }}
          />
        )}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="absolute z-[2] w-80 rounded-xl bg-card border border-border shadow-2xl p-5"
          style={tooltipStyle}
        >
          <button onClick={handleDismiss} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Passo {currentStep + 1} de {TOUR_STEPS.length}</span>
            </div>
            <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>

            {/* Tip callout */}
            {step.tip && (
              <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 p-2.5">
                <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-primary/80 leading-relaxed">{step.tip}</p>
              </div>
            )}

            <Progress value={progress} className="h-1" />

            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5">
              {TOUR_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === currentStep ? "w-4 bg-primary" : i < currentStep ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentStep === 0} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button size="sm" onClick={handleNext} className="gap-1">
                {isLast ? (<><Check className="h-4 w-4" /> Concluir</>) : (<>Próximo <ChevronRight className="h-4 w-4" /></>)}
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground/50 text-center">Use ← → para navegar, Esc para fechar</p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
