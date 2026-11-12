import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrderNotificationHistory, type NotificationExecution } from "@/hooks/useOrderNotificationHistory";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Na fila", variant: "secondary" },
  sent: { label: "Enviada", variant: "default" },
  cancelled: { label: "Não enviada", variant: "outline" },
  failed: { label: "Falhou", variant: "destructive" },
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function Row({ e }: { e: NotificationExecution }) {
  const st = STATUS[e.status ?? ""] ?? { label: e.status ?? "—", variant: "outline" as const };
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{when(e.created_at)}</TableCell>
      <TableCell>#{e.order_number}</TableCell>
      <TableCell>{e.status_name}{e.kind === "followup" && <span className="ml-1 text-xs text-muted-foreground">(lembrete)</span>}</TableCell>
      <TableCell>{e.channel === "email" ? "E-mail" : "WhatsApp"}</TableCell>
      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground" title={e.error_message ?? e.message_sent ?? ""}>{e.error_message ?? e.message_sent}</TableCell>
    </TableRow>
  );
}

/** Histórico de envios das notificações de pedido: o que foi enviado, o que está esperando e o que não saiu (com o motivo). */
export function OrderNotificationHistoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading, error } = useOrderNotificationHistory(open);
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => (data ?? []).filter((e) => filter === "all" || e.status === filter), [data, filter]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Histórico de envios</DialogTitle>
          <DialogDescription>Últimos 200 avisos de pedido. Passe o mouse no detalhe para ler a mensagem ou o motivo.</DialogDescription>
        </DialogHeader>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {isLoading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" />
          : error ? <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
          : (
            <Table>
              <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Pedido</TableHead><TableHead>Status</TableHead><TableHead>Canal</TableHead><TableHead>Situação</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((e) => <Row key={e.id} e={e} />)}
                {!rows.length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Nenhum envio ainda. Os avisos aparecem aqui assim que um pedido mudar de status.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
      </DialogContent>
    </Dialog>
  );
}
