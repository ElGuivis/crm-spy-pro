import { useMemo, useState } from "react";
import { UserX, Search, Undo2, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useContactBlocks, useRemoveContactBlock, type ContactBlock } from "@/hooks/useContactBlocks";

type Filter = "all" | "optout" | "manual";

/** 5511984221987 → +55 (11) 98422-1987 */
function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : p;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Atendimentos → Descadastros: quem respondeu SAIR (ou foi bloqueado) e não recebe mais mensagens automáticas. */
export function OptoutList() {
  const { data = [], isLoading, error } = useContactBlocks();
  const remove = useRemoveContactBlock();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirm, setConfirm] = useState<ContactBlock | null>(null);

  const counts = useMemo(() => ({
    all: data.length,
    optout: data.filter((b) => b.source === "optout").length,
    manual: data.filter((b) => b.source === "manual").length,
  }), [data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return data.filter((b) => (filter === "all" || b.source === filter)
      && (!term || (b.name ?? "").toLowerCase().includes(term) || (digits.length >= 3 && b.phone.includes(digits))));
  }, [data, q, filter]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><UserX className="h-5 w-5 text-primary" /> Descadastros</CardTitle>
          <CardDescription>
            Quem responde <strong>SAIR</strong> (ou PARAR, STOP, DESCADASTRAR) no WhatsApp entra aqui na hora e para de receber
            as mensagens automáticas de marketing: carrinho abandonado, aniversário, reativação, cashback e disparos em massa.
            Os avisos do próprio pedido (pagamento, envio e entrega) e o atendimento normal continuam funcionando.
            Contato <strong>bloqueado pelo atendente</strong> não recebe nada. Para voltar a enviar, use <strong>Reativar envios</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou número" className="pl-9" aria-label="Buscar descadastros" />
            </div>
            <div className="flex gap-1" role="group" aria-label="Filtrar por origem">
              {([["all", "Todos"], ["optout", "Pediram para sair"], ["manual", "Bloqueados"]] as [Filter, string][]).map(([v, label]) => (
                <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} onClick={() => setFilter(v)} aria-pressed={filter === v}>
                  {label} <span className="ml-1 tabular-nums opacity-70">{counts[v]}</span>
                </Button>
              ))}
            </div>
          </div>

          {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}
          {error && <p className="text-sm text-destructive py-4">Não foi possível carregar a lista.</p>}
          {!isLoading && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {data.length === 0 ? "Ninguém pediu para sair ainda." : "Nenhum contato encontrado com esse filtro."}
            </p>
          )}

          <ul className="divide-y rounded-md border">
            {rows.map((b) => (
              <li key={b.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{b.name || "Sem nome"}</span>
                    <Badge variant={b.source === "optout" ? "secondary" : "outline"}>
                      {b.source === "optout" ? "Pediu para sair" : "Bloqueado pelo atendente"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground tabular-nums">{formatPhone(b.phone)}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(b.createdAt)}{b.message ? ` · mandou "${b.message}"` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setConfirm(b)} disabled={remove.isPending}>
                  <Undo2 className="h-4 w-4 mr-1" /> Reativar envios
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar envios para {confirm?.name || (confirm && formatPhone(confirm.phone))}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.source === "optout"
                ? "Essa pessoa pediu para sair. Só reative se ela pediu para voltar a receber: mandar mensagem para quem pediu para sair aumenta o risco de o WhatsApp bloquear o seu número."
                : "O contato volta a receber as mensagens automáticas."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) remove.mutate(confirm.id); setConfirm(null); }}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
