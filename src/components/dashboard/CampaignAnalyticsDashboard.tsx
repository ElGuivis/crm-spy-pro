import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Send, CheckCircle, Eye, Gift } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCampaignAnalytics } from "@/hooks/useCampaignAnalytics";

export function CampaignAnalyticsDashboard() {
  const { data, isLoading } = useCampaignAnalytics();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
      </div>
    );
  }

  const overallDeliveryRate = data.totals.sent > 0 ? Math.round((data.totals.delivered / data.totals.sent) * 100) : 0;
  const overallReadRate = data.totals.delivered > 0 ? Math.round((data.totals.read / data.totals.delivered) * 100) : 0;

  const chartData = data.campaigns.slice(0, 10).reverse().map(c => ({
    name: c.name.substring(0, 15),
    Enviadas: c.sent,
    Entregues: c.delivered,
    Lidas: c.read,
  }));

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Send className="h-4 w-4" />
              <span className="text-xs font-medium">Enviadas</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{data.totals.sent.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.campaigns.length} campanhas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Taxa Entrega</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{overallDeliveryRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.totals.delivered.toLocaleString()} entregues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-xs font-medium">Taxa Leitura</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{overallReadRate}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.totals.read.toLocaleString()} lidas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Gift className="h-4 w-4" />
              <span className="text-xs font-medium">Cashback ROI</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{data.cashbackStats.estimatedROI}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">{data.cashbackStats.totalCoupons} cupons gerados</p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign performance chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Performance das Campanhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="Enviadas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Entregues" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Lidas" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Campaign list */}
      {data.campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Histórico de Campanhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.campaigns.slice(0, 10).map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(c.createdAt), "dd/MM/yyyy", { locale: ptBR })} • {c.totalContacts} contatos
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="text-right">
                      <span className="font-medium text-foreground">{c.deliveryRate}%</span>
                      <span className="text-muted-foreground ml-1">entrega</span>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-foreground">{c.readRate}%</span>
                      <span className="text-muted-foreground ml-1">leitura</span>
                    </div>
                    <Badge
                      variant={c.status === "completed" ? "default" : c.status === "sending" ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {c.status === "completed" ? "Concluída" : c.status === "sending" ? "Enviando" : c.status === "scheduled" ? "Agendada" : c.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
