import { Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { AutomationKind, PendingDelete } from '@/hooks/useDeleteAutomationConfig';

const EFFECT: Record<AutomationKind, string> = {
  birthday: 'Cupons já enviados continuam valendo e o histórico de envios é mantido. Os aniversariantes deixam de receber esta mensagem.',
  reactivation: 'Os ciclos de mensagem desta reativação serão removidos e o histórico de envios é mantido. Ninguém mais recebe esta automação.',
  order_notification: 'As regras de status desta configuração serão removidas e o cliente deixa de receber esses avisos. O histórico de envios é mantido; mensagens que já estão na fila ainda saem.',
};

/** Confirmação de exclusão de uma configuração de automação (aniversário, reativação, notificação de pedido). */
export function DeleteConfigDialog({ pending, deleting, onCancel, onConfirm }: { pending: PendingDelete | null; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog open={!!pending} onOpenChange={(open) => { if (!open && !deleting) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir "{pending?.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending ? EFFECT[pending.kind] : ''} Esta ação não pode ser desfeita. Para só parar os envios por um tempo, pause a automação em vez de excluir.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Excluir
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
