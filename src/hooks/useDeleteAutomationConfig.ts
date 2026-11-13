import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

const log = createLogger('useDeleteAutomationConfig');

export type AutomationKind = 'birthday' | 'reactivation' | 'order_notification';
export interface PendingDelete { kind: AutomationKind; id: string; name: string }

const TABLE = {
  birthday: 'birthday_configs',
  reactivation: 'reactivation_configs',
  order_notification: 'order_notification_configs',
} as const;

/** Exclusão de uma configuração de automação. O histórico de envios fica (a chave vira nula); regras e ciclos filhos saem junto (cascata no banco). */
export function useDeleteAutomationConfig(reload: Record<AutomationKind, () => void>) {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    if (!pending) return;
    setDeleting(true);
    try {
      // .select() devolve as linhas apagadas: lista vazia = a permissão (RLS) barrou sem erro
      const { data, error } = await supabase.from(TABLE[pending.kind]).delete().eq('id', pending.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Sem permissão para excluir esta configuração.');
      toast({ title: 'Configuração excluída', description: `"${pending.name}" foi removida.` });
      reload[pending.kind]();
      setPending(null);
    } catch (e) {
      log.error('Error deleting automation config:', e);
      toast({ title: 'Erro ao excluir', description: e instanceof Error ? e.message : 'Não foi possível excluir a configuração.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return { pending, deleting, ask: setPending, cancel: () => setPending(null), confirm };
}
