import { useMemo } from "react";
import { Download, Loader2, PackageX, PackageCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMarketingSettings, useWaitlistPanel, type WaitlistRow } from "@/hooks/useLiMarketing";

const stockOf = (r: WaitlistRow) => r.current_stock ?? r.snapshot_stock ?? 0;

function exportCsv(rows: WaitlistRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Produto", "SKU", "Esperando", "Variação 7 dias", "Estoque", "Situação"].join(";"),
    ...rows.map((r) => [r.name, r.sku, r.subscribers, r.delta_7d, stockOf(r), r.restocked ? "Voltou ao estoque" : stockOf(r) > 0 ? "Em estoque" : "Esgotado"].map(esc).join(";"))];
  const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `lista-de-espera-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

/** Lista de espera da loja ("avise-me"): o que repor primeiro. A loja avisa os inscritos quando o produto volta; aqui você prioriza. */
export function WaitlistPanel() {
  const { data, isLoading } = useWaitlistPanel();
  const { settings, save } = useMarketingSettings();
  const stats = useMemo(() => {
    const rows = data ?? [];
    const out = rows.filter((r) => stockOf(r) <= 0);
    return { people: rows.reduce((s, r) => s + r.subscribers, 0), outCount: out.length, outPeople: out.reduce((s, r) => s + r.subscribers, 0), restocked: rows.filter((r) => r.restocked) };
  }, [data]);

  if (isLoading) return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!data?.length) return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Ainda não há retrato da lista de espera. Ele é atualizado todo dia de manhã.</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4 flex items-center gap-3"><Users className="h-5 w-5 text-muted-foreground" /><div><p className="text-2xl font-bold">{stats.people}</p><p className="text-xs text-muted-foreground">inscrições na lista de espera</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><PackageX className="h-5 w-5 text-destructive" /><div><p className="text-2xl font-bold">{stats.outCount}</p><p className="text-xs text-muted-foreground">produtos esgotados com fila ({stats.outPeople} pessoas)</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><PackageCheck className="h-5 w-5 text-emerald-600" /><div><p className="text-2xl font-bold">{stats.restocked.length}</p><p className="text-xs text-muted-foreground">voltaram ao estoque (últimos 30 dias)</p></div></CardContent></Card>
      </div>

      {settings.waitlist_alert && stats.restocked.length > 0 && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <strong>Voltaram ao estoque com gente esperando:</strong> {stats.restocked.slice(0, 5).map((r) => `${r.name ?? r.sku} (${r.subscribers})`).join(", ")}{stats.restocked.length > 5 ? "…" : ""}. A Loja Integrada avisa os inscritos; vale divulgar nas redes e no e-mail.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm"><Switch checked={settings.waitlist_alert} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ waitlist_alert: v })} aria-label="Destacar produtos que voltaram ao estoque" />Destacar produtos que voltam ao estoque com gente esperando</label>
        <p className="text-sm text-muted-foreground">Esgotados primeiro, do maior para o menor número de inscritos. A API da loja entrega só a contagem, não quem espera.</p>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCsv(data)}><Download className="h-4 w-4" />Exportar CSV</Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Esperando</TableHead><TableHead className="text-right">7 dias</TableHead><TableHead className="text-right">Estoque</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.slice(0, 200).map((r) => {
              const stock = stockOf(r);
              return (
                <TableRow key={r.product_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {r.image_url ? <img src={r.image_url} alt="" className="h-10 w-10 rounded object-cover bg-muted" loading="lazy" /> : <div className="h-10 w-10 rounded bg-muted" />}
                      <div className="min-w-0"><div className="text-sm font-medium truncate max-w-[360px]">{r.name ?? "Produto"}</div><div className="text-xs text-muted-foreground">{r.sku}</div></div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{r.subscribers}</TableCell>
                  <TableCell className={`text-right text-xs ${r.delta_7d > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>{r.delta_7d > 0 ? `+${r.delta_7d}` : r.delta_7d}</TableCell>
                  <TableCell className="text-right">{stock}</TableCell>
                  <TableCell>{r.restocked ? <Badge className="bg-emerald-600">Voltou ao estoque</Badge> : stock > 0 ? <Badge variant="secondary">Em estoque</Badge> : <Badge variant="destructive">Esgotado</Badge>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
