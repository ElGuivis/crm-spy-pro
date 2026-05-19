import { useState } from "react";
import { useAtendimentoStats, StatsPeriod } from "@/hooks/useAtendimentoSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare, Users, TrendingUp, AlertCircle, CheckCircle,
  Download, Clock, Star, Timer,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useExport } from "@/hooks/useExport";

function formatMinutes(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function AtendimentoReports() {
  const [period, setPeriod] = useState<StatsPeriod>("7d");
  const { stats, isLoading } = useAtendimentoStats(period);
  const { exportToCSV, isExporting } = useExport();

  if (isLoading || !stats) {
    return <p className="text-sm text-muted-foreground text-center py-8">Carregando relatórios...</p>;
  }

  const totalOpen = (stats.statusCounts.open || 0) + (stats.statusCounts.pending || 0) + (stats.statusCounts.bot || 0);
  const totalClosed = stats.statusCounts.closed || 0;

  const dailyEntries = Object.entries(stats.dailyData).sort(([a], [b]) => a.localeCompare(b));
  const chartData = dailyEntries.map(([day, data]) => ({
    date: day,
    opened: (data as { opened: number; closed: number }).opened,
    closed: (data as { opened: number; closed: number }).closed,
  }));

  const handleExportCSV = () => {
    const headers = ["Agente", "Abertas", "Resolvidas", "Tempo Médio (min)"];
    const agentRows = stats.agentStats.map((a) => [
      a.name,
      a.openCount,
      a.resolvedCount,
      a.avgHandleMinutes ?? "—",
    ]);
    const sep: (string | number)[] = ["---", "---", "---", "---"];
    const metaRows: (string | number)[][] = [
      sep,
      ["Média 1ª Resposta", formatMinutes(stats.avgFirstResponseMinutes), "", ""],
      ["Média Resolução", formatMinutes(stats.avgResolutionMinutes), "", ""],
      ["CSAT Médio", stats.csatAvg ?? "—", `(${stats.csatCount} respostas)`, ""],
    ];
    exportToCSV({ filename: `relatorio-atendimento-${period}`, headers, data: [...agentRows, ...metaRows] });
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={period} onValueChange={(v) => setPeriod(v as StatsPeriod)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Exportar CSV
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-medium">Abertas</span>
            </div>
            <p className="text-2xl font-bold">{totalOpen}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Resolvidas</span>
            </div>
            <p className="text-2xl font-bold">{totalClosed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Mensagens Hoje</span>
            </div>
            <p className="text-2xl font-bold">{stats.messagesToday}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Fila de Envio</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">{stats.queuePending}</p>
              {stats.queueFailed > 0 && (
                <Badge variant="destructive" className="text-[10px]">{stats.queueFailed} erros</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SLA metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Tempo Médio 1ª Resposta</span>
            </div>
            <p className="text-2xl font-bold">{formatMinutes(stats.avgFirstResponseMinutes)}</p>
            {stats.avgFirstResponseMinutes === null && (
              <p className="text-xs text-muted-foreground mt-0.5">Dados a partir de agora</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Timer className="h-4 w-4" />
              <span className="text-xs font-medium">Tempo Médio de Resolução</span>
            </div>
            <p className="text-2xl font-bold">{formatMinutes(stats.avgResolutionMinutes)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Star className="h-4 w-4" />
              <span className="text-xs font-medium">CSAT Médio</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold">
                {stats.csatAvg !== null ? `${stats.csatAvg}/5` : "—"}
              </p>
              {stats.csatCount > 0 && (
                <span className="text-xs text-muted-foreground">{stats.csatCount} respostas</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Conversas por Status</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(stats.statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${
                  status === 'open' ? 'bg-green-500' :
                  status === 'pending' ? 'bg-yellow-500' :
                  status === 'bot' ? 'bg-blue-500' :
                  'bg-muted-foreground'
                }`} />
                <span className="text-sm capitalize">{status}</span>
                <span className="text-sm font-medium">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Conversas por Dia ({period === '7d' ? '7' : period === '30d' ? '30' : '90'} dias)
          </CardTitle>
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
                  tickFormatter={(d) => { try { return format(new Date(d), period === '7d' ? "EEE" : "dd/MM", { locale: ptBR }); } catch { return d; } }}
                  tick={{ fontSize: 11 }}
                  interval={period === '90d' ? 6 : undefined}
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

      {/* Agent table */}
      {stats.agentStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" />
              Volume por Atendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.agentStats.map((agent) => (
                <div key={agent.agentId} className="flex items-center justify-between rounded-lg border p-3 gap-2">
                  <span className="text-sm font-medium truncate max-w-[160px]">{agent.name}</span>
                  <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                    <span className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{agent.openCount}</span> abertas
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-medium text-green-600">{agent.resolvedCount}</span> resolvidas
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ⌀ {formatMinutes(agent.avgHandleMinutes)}
                    </span>
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
