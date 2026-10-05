import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCapturedAbandonments, type CapturedRow } from "@/hooks/useRecoveryData";
import { RECOVERY_KINDS, type RecoveryKind } from "@/lib/recovery";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–");

function Status({ r }: { r: CapturedRow }) {
  if (r.flow_status === "recovered") return <Badge className="bg-emerald-600">{r.recovered_via === "ours" ? "Recuperado (nosso)" : "Comprou"}{r.recovered_total ? ` · ${brl(r.recovered_total)}` : ""}</Badge>;
  if (r.flow_status === "excluded") return <Badge variant="outline">Pulado (já contatado)</Badge>;
  if (r.flow_status === "done") return <Badge variant="secondary">Sequência concluída</Badge>;
  return <Badge variant="secondary">Em andamento</Badge>;
}

const SEND_TONE: Record<string, string> = { sent: "bg-emerald-100 text-emerald-800", failed: "bg-red-100 text-red-800", skipped: "bg-muted text-muted-foreground", sending: "bg-amber-100 text-amber-800" };
const SEND_LABEL: Record<string, string> = { sent: "enviado", failed: "falhou", skipped: "pulado", sending: "enviando" };

/** Abandonos capturados da loja e o que o fluxo já enviou a cada pessoa. */
export function CapturedList() {
  const [kind, setKind] = useState<RecoveryKind | "all">("all");
  const { data, isLoading } = useCapturedAbandonments(kind);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Capturados da Loja Integrada a cada 10 minutos (últimos 30 dias). Atualiza sozinho.</p>
        <Select value={kind} onValueChange={(v) => setKind(v as RecoveryKind | "all")}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {RECOVERY_KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isLoading ? <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : !data?.length ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum abandono capturado ainda. Quando alguém deixar itens no carrinho ou sair no meio do pedido, aparece aqui.</div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead>Pessoa</TableHead><TableHead>Itens</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Situação</TableHead><TableHead>Envios</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">{when(r.event_at)}</TableCell>
                  <TableCell className="text-xs">{RECOVERY_KINDS.find((k) => k.kind === r.kind)?.short}</TableCell>
                  <TableCell className="text-xs"><div className="font-medium">{r.recipient_name || "–"}</div><div className="text-muted-foreground">{r.recipient_email || r.recipient_phone || "sem contato"}</div></TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate" title={r.items.map((i) => `${i.quantity}x ${i.name ?? "item"}`).join(", ")}>{r.items.length ? r.items.map((i) => i.name ?? "item").slice(0, 2).join(", ") + (r.items.length > 2 ? ` +${r.items.length - 2}` : "") : "–"}</TableCell>
                  <TableCell className="text-right text-xs whitespace-nowrap">{r.value > 0 ? brl(r.value) : "–"}</TableCell>
                  <TableCell><Status r={r} /></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.sends.length === 0 && <span className="text-xs text-muted-foreground">nenhum</span>}
                      {r.sends.map((s, i) => (
                        <span key={i} title={s.reason ?? undefined} className={`rounded px-1.5 py-0.5 text-[11px] ${SEND_TONE[s.status] ?? ""}`}>{s.channel === "email" ? "E-mail" : "WhatsApp"} · {SEND_LABEL[s.status] ?? s.status}</span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
