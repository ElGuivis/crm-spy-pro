import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reais, x, type EconomicsView } from "@/lib/googleAdsEconomics";

const monthLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

/** Conciliação mês a mês: o que o Google diz que vendeu × o que o CRM realmente recebeu. */
export function EconomicsRecon({ recon }: { recon: EconomicsView["reconciliation"] }) {
  const rows = recon.rows.filter((r) => r.google_cost > 0 || r.crm_orders > 0);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">Google × vendas reais do CRM (12 meses)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {recon.warning && <p className="text-sm text-amber-600 dark:text-amber-400">{recon.warning}</p>}
        <p className="text-xs text-muted-foreground">
          “Valor Google” é a receita que o Google atribuiu aos anúncios. “CRM” é o que entrou de pedidos pagos na loja no mês (de todas as origens).
          Se o Google contar mais do que o CRM recebeu, o ROAS dele está inflado.
        </p>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Mês</TableHead><TableHead className="text-right">Gasto</TableHead><TableHead className="text-right">Valor Google</TableHead>
            <TableHead className="text-right">CRM</TableHead><TableHead className="text-right">ROAS Google</TableHead><TableHead className="text-right">ROAS CRM</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell>{monthLabel(r.month)}</TableCell>
                <TableCell className="text-right">{reais(r.google_cost)}</TableCell>
                <TableCell className="text-right">{reais(r.google_value)}</TableCell>
                <TableCell className="text-right">{reais(r.crm_revenue)}</TableCell>
                <TableCell className="text-right">{x(r.roas_google)}</TableCell>
                <TableCell className="text-right">{x(r.roas_crm)}</TableCell>
                <TableCell>{r.flag === "over" ? <Badge variant="destructive">Google acima</Badge> : r.flag === "no_ads" ? <Badge variant="outline">sem anúncio</Badge> : null}</TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Sem dados nos últimos 12 meses.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
