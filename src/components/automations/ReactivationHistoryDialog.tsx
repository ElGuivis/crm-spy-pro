import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReactivationHistory } from "@/hooks/useReactivationHistory";

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Enviando", variant: "secondary" },
  sent: { label: "Enviada", variant: "default" },
  unreachable: { label: "Sem WhatsApp", variant: "outline" },
  failed: { label: "Falhou", variant: "destructive" },
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Histórico e resultado da reativação: quem recebeu, quem voltou a comprar em até 30 dias e quanto isso rendeu. */
export function ReactivationHistoryDialog({ open, onOpenChange, configIds }: { open: boolean; onOpenChange: (o: boolean) => void; configIds: string[] }) {
  const { executions, results } = useReactivationHistory(configIds, open);
  const r = results.data;
  const rate = r && r.sent > 0 ? `${Math.round((r.returned / r.sent) * 100)}% dos que receberam` : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Histórico e resultado da reativação</DialogTitle>
          <DialogDescription>“Voltaram a comprar” conta quem fez um pedido válido em até 30 dias depois da mensagem (casado pelo e-mail ou telefone).</DialogDescription>
        </DialogHeader>
        {r && (
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Mensagens enviadas" value={String(r.sent)} hint={r.unreachable + r.failed > 0 ? `${r.unreachable} sem WhatsApp · ${r.failed} falhas` : undefined} />
            <Stat label="Voltaram a comprar" value={String(r.returned)} hint={rate} />
            <Stat label="Receita dos que voltaram" value={brl(r.revenue)} />
            <Stat label="Custo em tokens" value={String(r.sent * 5)} hint="5 por mensagem enviada" />
          </div>
        )}
        {executions.isLoading ? <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-muted-foreground" />
          : executions.error ? <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p>
          : (
            <Table>
              <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Cliente</TableHead><TableHead>Inativo há</TableHead><TableHead>Passo</TableHead><TableHead>Situação</TableHead><TableHead>Cupom / detalhe</TableHead></TableRow></TableHeader>
              <TableBody>
                {(executions.data ?? []).map((e) => {
                  const st = STATUS[e.status ?? ""] ?? { label: e.status ?? "—", variant: "outline" as const };
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{when(e.created_at)}</TableCell>
                      <TableCell>{e.customer_name ?? "—"}</TableCell>
                      <TableCell>{e.days_inactive != null ? `${e.days_inactive} dias` : "—"}</TableCell>
                      <TableCell>{e.cycle_step ?? "—"}º{e.attempt_no && e.attempt_no > 1 ? <span className="ml-1 text-xs text-muted-foreground">(envio {e.attempt_no})</span> : null}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground" title={e.error_message ?? e.coupon_code ?? ""}>{e.error_message ?? e.coupon_code}</TableCell>
                    </TableRow>
                  );
                })}
                {!(executions.data ?? []).length && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Nenhum envio ainda. A automação começa a agir quando houver clientes sem comprar há mais dias que o limite configurado.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
      </DialogContent>
    </Dialog>
  );
}
