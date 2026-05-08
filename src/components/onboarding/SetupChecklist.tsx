import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Plug, MessageSquare, Bot, Users, Rocket, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  link: string;
  check: () => Promise<boolean>;
}

export function SetupChecklist() {
  const { tenant, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const items: ChecklistItem[] = [
    {
      id: 'integration',
      label: 'Conectar integração',
      description: 'Conecte Loja Integrada, Bling ou WhatsApp',
      icon: Plug,
      link: '/integrations',
      check: async () => {
        if (!tenant?.id) return false;
        const { count } = await supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
        return (count || 0) > 0;
      },
    },
    {
      id: 'contacts',
      label: 'Importar contatos',
      description: 'Sincronize clientes da sua loja',
      icon: Users,
      link: '/clients',
      check: async () => {
        if (!tenant?.id) return false;
        const { count: liCount } = await supabase.from('li_customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
        const { count: blingCount } = await supabase.from('bling_customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
        return ((liCount || 0) + (blingCount || 0)) > 0;
      },
    },
    {
      id: 'whatsapp',
      label: 'Configurar WhatsApp',
      description: 'Conecte um número para atendimento',
      icon: MessageSquare,
      link: '/integrations',
      check: async () => {
        if (!tenant?.id) return false;
        const { count } = await supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('type', 'whatsapp');
        return (count || 0) > 0;
      },
    },
    {
      id: 'bot',
      label: 'Criar primeiro bot',
      description: 'Configure um agente de IA para atendimento',
      icon: Bot,
      link: '/automations',
      check: async () => {
        if (!tenant?.id) return false;
        const { count } = await supabase.from('ai_agents').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
        return (count || 0) > 0;
      },
    },
  ];

  // Load dismissed state from DB
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('checklist_dismissed')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.checklist_dismissed) {
        setDismissed(true);
      }
    };
    load();
  }, [user?.id]);

  const checkAll = async () => {
    setLoading(true);
    const results: Record<string, boolean> = {};
    for (const item of items) {
      try { results[item.id] = await item.check(); } catch { results[item.id] = false; }
    }
    setStatuses(results);
    setLoading(false);

    // Auto-dismiss if all complete
    if (Object.values(results).every(Boolean)) {
      toast({ title: '🎉 Setup completo!', description: 'Todas as etapas foram concluídas.' });
      setTimeout(() => handleDismiss(), 5000);
    }
  };

  useEffect(() => {
    if (dismissed || !tenant?.id) return;
    checkAll();
  }, [tenant?.id, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    setRefreshing(true);
    await checkAll();
    setRefreshing(false);
  };

  const handleDismiss = async () => {
    setDismissed(true);
    if (user?.id) {
      await supabase.from('profiles').update({ checklist_dismissed: true }).eq('user_id', user.id);
    }
  };

  if (dismissed || loading) return null;

  const completedCount = Object.values(statuses).filter(Boolean).length;
  const totalCount = items.length;
  const progressValue = (completedCount / totalCount) * 100;
  const allDone = completedCount === totalCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            allDone ? "bg-primary/20" : "bg-primary/10"
          )}>
            <Rocket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {allDone ? '🎉 Setup completo!' : 'Configure seu SpyPro'}
            </h3>
            <p className="text-xs text-muted-foreground">{completedCount}/{totalCount} etapas concluídas</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", refreshing && "animate-spin")}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Progress value={progressValue} className="h-1.5 mt-3" />

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-1.5">
              {items.map((item, index) => {
                const done = statuses[item.id];
                return (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => !done && navigate(item.link)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      done ? 'bg-primary/5 cursor-default' : 'hover:bg-muted/50 cursor-pointer'
                    )}
                  >
                    {done ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      </motion.div>
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/50 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                    </div>
                    <item.icon className={cn('h-4 w-4 shrink-0', done ? 'text-primary/50' : 'text-muted-foreground')} />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
