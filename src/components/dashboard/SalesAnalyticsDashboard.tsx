import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, ShoppingBag, TrendingUp, BarChart3 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format } from "date-fns";
import { useSalesAnalytics } from "@/hooks/useSalesAnalytics";

const CHANNEL_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"];

export function SalesAnalyticsDashboard() {
  const { data, isLoading } = useSalesAnalytics();

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
        <Card><CardContent className="p-4"><Skeleton className="h-[250px] w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium">Receita (30d)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <ShoppingBag className="h-4 w-4" />
              <span className="text-xs font-medium">Pedidos (30d)</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{data.totalOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Ticket Médio</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.avgTicket)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by Channel */}
        {data.revenueByChannel.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Receita por Canal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={data.revenueByChannel} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="revenue" paddingAngle={2}>
                      {data.revenueByChannel.map((_, i) => (
                        <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {data.revenueByChannel.map((ch, i) => (
                    <div key={ch.name}>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                        <span className="text-sm font-medium text-foreground">{ch.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-5">{formatCurrency(ch.revenue)} • {ch.orders} pedidos</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ticket Evolution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Evolução do Ticket Médio (14d)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.ticketEvolution} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTicket" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tickFormatter={(d) => { try { return format(new Date(d), "dd/MM"); } catch { return d; } }} tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Ticket"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Area type="monotone" dataKey="ticket" stroke="hsl(var(--chart-2))" fill="url(#colorTicket)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      {data.topProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Produtos Mais Vendidos (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, data.topProducts.length * 36)}>
              <BarChart data={data.topProducts} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Bar dataKey="revenue" name="Receita" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Conversion Funnel */}
      {data.conversionFunnel.some(f => f.value > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Funil de Conversão (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 justify-center py-4">
              {data.conversionFunnel.map((stage, i) => {
                const maxVal = Math.max(...data.conversionFunnel.map(f => f.value), 1);
                const heightPct = (stage.value / maxVal) * 100;
                return (
                  <div key={stage.stage} className="flex flex-col items-center gap-2">
                    <span className="text-lg font-bold text-foreground">{stage.value}</span>
                    <div
                      className="w-20 rounded-t-lg transition-all"
                      style={{
                        height: `${Math.max(heightPct, 10)}px`,
                        maxHeight: "120px",
                        backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground text-center max-w-[80px]">{stage.stage}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
