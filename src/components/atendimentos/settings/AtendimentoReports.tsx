import { useAtendimentoStats } from "@/hooks/useAtendimentoSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, Users, TrendingUp, AlertCircle, CheckCircle, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useExport } from "@/hooks/useExport";

export function AtendimentoReports() {
  const { stats, isLoading } = useAtendimentoStats();
  const { exportToPDF, exportToCSV, isExporting } = useExport();

  if (isLoading || !stats) {
    return <p className="text-sm text-muted-foreground text-center py-8">Carregando relatórios...</p>;
  }

  const totalOpen = (stats.statusCounts.open || 0) + (stats.statusCounts.pending || 0) + (stats.statusCounts.bot || 0);
  const totalClosed = stats.statusCounts.closed || 0;

  const dailyEntries = Object.entries(stats.dailyData).sort(([a], [b]) => a.localeCompare(b));
  const chartData = dailyEntries.map(([day, data]) => {
    const d = data as { opened: number; closed: number };
    return { date: day, opened: d.opened, closed: d.closed };
  });

  const handleExportPDF = () => {
    const headers = ["Métrica", "Valor"];
    const data: (string | number)[][] = [
      ["Conversas Abertas", totalOpen],
      ["Resolvidas", totalClosed],
      ["Mensagens Hoje", stats.messagesToday],
      ["Fila Pendente", stats.queuePending],
      ["Fila com Erros", stats.queueFailed],
    ];
    Object.entries(stats.statusCounts).forEach(([s, c]) => data.push([`Status: ${s}`, c]));
    Object.entries(stats.agentCounts).forEach(([a, c]) => data.push([`Atendente: ${a.slice(0, 8)}`, c]));
    exportToPDF({ filename: "relatorio-conversas", headers, data, title: "Relatório de Conversas" });
  };

  const handleExportCSV = () => {
    const headers = ["Data", "Abertas", "Fechadas"];
    const data = chartData.map(d => [d.date, d.opened, d.closed]);
    exportToCSV({ filename: "conversas-por-dia", headers, data });
  };

  return (
    <div className="space-y-6">
      {/* Export */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-medium">Conversas Abertas</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalOpen}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Resolvidas</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{totalClosed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Mensagens Hoje</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.messagesToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Fila de Envio</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-foreground">{stats.queuePending}</p>
              {stats.queueFailed > 0 && (
                <Badge variant="destructive" className="text-[10px]">{stats.queueFailed} erros</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Conversas por Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(stats.statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${
                  status === 'open' ? 'bg-green-500' :
                  status === 'pending' ? 'bg-yellow-500' :
                  status === 'bot' ? 'bg-blue-500' :
                  status === 'closed' ? 'bg-muted-foreground' :
                  'bg-muted'
                }`} />
                <span className="text-sm text-foreground capitalize">{status}</span>
                <span className="text-sm font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily chart with Recharts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Conversas por Dia (últimos 7 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => { try { return format(new Date(d), "EEE", { locale: ptBR }); } catch { return d; } }}
                  tick={{ fontSize: 11 }}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                  labelFormatter={(l) => { try { return format(new Date(l), "dd/MM", { locale: ptBR }); } catch { return l; } }}
                />
                <Bar dataKey="opened" name="Abertas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="closed" name="Fechadas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Agent workload */}
      {Object.keys(stats.agentCounts).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              Carga por Atendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.agentCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([agentId, count]) => (
                  <div key={agentId} className="flex items-center justify-between rounded-lg border p-3">
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">{agentId.slice(0, 8)}...</span>
                    <Badge variant="secondary">{count} conversas</Badge>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
