import { useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CASHBACK_STATUS_LABEL, STATEMENT_PAGE_SIZE, useCashbackStatement, useCashbackTotals } from "@/hooks/useCashbackStatement";
import { CashbackExclusionsTab } from "./CashbackExclusionsTab";

const brl = (v: number | null | undefined) => `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const CARDS = ["pending", "available", "used", "expired", "cancelled"] as const;
const TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  available: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  used: "bg-primary/10 text-primary",
};

/** Extrato do cashback: cada crédito com a situação real (aguardando, disponível, usado, vencido, cancelado) + lista de exclusão. */
export function CashbackStatementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const totals = useCashbackTotals(open);
  const rows = useCashbackStatement(open, search, status, page);
  const data = rows.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Extrato do cashback</DialogTitle>
          <DialogDescription>Créditos gerados pelos pedidos, com a situação de cada um, e a lista de clientes que não ganham cashback.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="extrato">
          <TabsList>
            <TabsTrigger value="extrato">Extrato</TabsTrigger>
            <TabsTrigger value="exclusao">Lista de exclusão</TabsTrigger>
          </TabsList>

          <TabsContent value="extrato" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {CARDS.map((k) => (
                <button key={k} type="button" onClick={() => { setStatus(status === k ? "" : k); setPage(0); }}
                  className={`rounded-lg border p-3 text-left transition ${status === k ? "border-primary" : "border-border"}`}>
                  <p className="text-xs text-muted-foreground">{CASHBACK_STATUS_LABEL[k]}</p>
                  <p className="text-lg font-semibold">{brl(totals.data?.[k]?.amount)}</p>
                  <p className="text-xs text-muted-foreground">{totals.data?.[k]?.credits ?? 0} créditos</p>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Buscar por cliente, e-mail, telefone, pedido ou cupom" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="sm:w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as situações</SelectItem>
                  {Object.entries(CASHBACK_STATUS_LABEL).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Crédito</TableHead><TableHead>Situação</TableHead>
                    <TableHead>Cupom</TableHead><TableHead>Libera / vence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.isLoading && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Carregando...</TableCell></TableRow>}
                  {!rows.isLoading && data.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Nenhum crédito encontrado.</TableCell></TableRow>}
                  {data.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>#{r.order_number}</TableCell>
                      <TableCell>
                        <p className="font-medium">{r.customer_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.customer_email || r.customer_phone}</p>
                      </TableCell>
                      <TableCell className="text-right">{brl(r.base_amount)}</TableCell>
                      <TableCell className="text-right font-medium">{brl(r.credit_amount)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={TONE[r.display_status] ?? ""}>{CASHBACK_STATUS_LABEL[r.display_status] ?? r.display_status}</Badge>
                        {r.skip_reason && <p className="mt-1 text-xs text-muted-foreground">{r.skip_reason}</p>}
                        {r.used_at && <p className="mt-1 text-xs text-muted-foreground">Usado em {day(r.used_at)}{r.used_order_value ? ` (pedido de ${brl(r.used_order_value)})` : ""}</p>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.coupon_code || "—"}</TableCell>
                      <TableCell className="text-xs">{r.coupon_code ? `vence ${day(r.expires_at)}` : `libera ${day(r.release_at)}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span className="text-xs text-muted-foreground">Página {page + 1}</span>
              <Button variant="outline" size="sm" disabled={data.length < STATEMENT_PAGE_SIZE} onClick={() => setPage(page + 1)}>Próxima</Button>
            </div>
          </TabsContent>

          <TabsContent value="exclusao" className="pt-2">
            <CashbackExclusionsTab enabled={open} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
