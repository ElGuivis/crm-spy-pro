import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, ShoppingCart, Wallet, Percent, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEmailCampaignsPerformance, pct } from "@/hooks/useEmailCampaignPerformance";
import { CampaignDetailsDialog } from "./CampaignDetailsDialog";
import { brl } from "./campaign-details/CampaignResultsTab";

function Stat({ title, value, hint, icon: Icon }: { title: string; value: string | number; hint: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function EmailPerformanceOverview() {
  const { data, isLoading } = useEmailCampaignsPerformance();
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma campanha enviada ainda</p>
          <p className="text-sm text-muted-foreground">Quando você enviar uma campanha, aberturas, cliques e compras aparecem aqui.</p>
        </CardContent>
      </Card>
    );
  }

  const sent = rows.reduce((s, r) => s + r.total_sent, 0);
  const orders = rows.reduce((s, r) => s + r.orders, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="Campanhas enviadas" value={rows.length} hint={`${sent} e-mails no total`} icon={Mail} />
        <Stat title="Pedidos atribuídos" value={orders} hint="por cupom, clique ou abertura" icon={ShoppingCart} />
        <Stat title="Receita atribuída" value={brl(revenue)} hint={orders > 0 ? `ticket médio ${brl(revenue / orders)}` : "—"} icon={Wallet} />
        <Stat title="Conversão média" value={`${pct(orders, sent)}%`} hint="pedidos ÷ e-mails enviados" icon={Percent} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Enviada em</TableHead>
                <TableHead className="text-right">Enviados</TableHead>
                <TableHead className="text-right">Abriram</TableHead>
                <TableHead className="text-right">Clicaram</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Conversão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const base = r.total_delivered || r.total_sent;
                return (
                  <TableRow key={r.campaign_id} className="cursor-pointer" onClick={() => setOpenId(r.campaign_id)}>
                    <TableCell>
                      <span className="font-medium">{r.internal_name}</span>
                      <span className="block max-w-[280px] truncate text-xs text-muted-foreground">{r.subject}</span>
                    </TableCell>
                    <TableCell>{format(new Date(r.sent_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell className="text-right">{r.total_sent}</TableCell>
                    <TableCell className="text-right">{r.unique_opens} <span className="text-xs text-muted-foreground">({pct(r.unique_opens, base)}%)</span></TableCell>
                    <TableCell className="text-right">{r.unique_clicks} <span className="text-xs text-muted-foreground">({pct(r.unique_clicks, base)}%)</span></TableCell>
                    <TableCell className="text-right font-medium">{r.orders}</TableCell>
                    <TableCell className="text-right font-medium">{brl(r.revenue)}</TableCell>
                    <TableCell className="text-right">{pct(r.orders, r.total_sent)}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Clique em uma campanha para ver os pedidos, os links mais clicados e a origem de cada compra.</p>

      {openId && (
        <CampaignDetailsDialog campaignId={openId} open onOpenChange={(o) => !o && setOpenId(null)} initialTab="resultados" />
      )}
    </div>
  );
}
