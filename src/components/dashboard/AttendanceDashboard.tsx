import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MessageSquare, Timer, CheckCircle, Users, AlertTriangle, Download, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAttendanceStats } from "@/hooks/useAttendanceStats";
import { useExport } from "@/hooks/useExport";

const STATUS_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function AttendanceDashboard() {
  const { data: stats, isLoading } = useAttendanceStats();
  const { exportToPDF, exportToCSV, isExporting } = useExport();

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  };

  const handleExportPDF = () => {
    if (!stats) return;
    const headers = ["Métrica", "Valor"];
    const data: (string | number)[][] = [
      ["Primeira Resposta (média)", formatTime(stats.avgFirstResponseMin)],
      ["Primeira Resposta (P50)", formatTime(stats.p50FirstResponseMin)],
      ["Primeira Resposta (P90)", formatTime(stats.p90FirstResponseMin)],
      ["Resolução (média)", formatTime(stats.avgResolutionMin)],
      ["Conversas Abertas", stats.openConversations],
      ["Resolvidas (30d)", stats.closedLast30d],
      ["Quebras de SLA", stats.slaBreaches],
    ];
    stats.byAgent.forEach(a => {
      data.push([`Atendente: ${a.name}`, `${a.conversations} conversas, ${a.closedCount} resolvidas, ${formatTime(a.avgResponseMin)} resp.`]);
    });
    exportToPDF({ filename: "relatorio-atendimento", headers, data, title: "Relatório de Atendimento" });
  };

  const handleExportCSV = () => {
    if (!stats) return;
    const headers = ["Data", "Abertas", "Resolvidas"];
    const data = stats.byDay.map(d => [d.date, d.opened, d.closed]);
    exportToCSV({ filename: "atendimento-por-dia", headers, data });
  };

  if (isLoading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Export buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={isExporting}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={isExporting}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Timer className="h-4 w-4" />
              <span className="text-xs font-medium">1ª Resposta</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatTime(stats.avgFirstResponseMin)}</p>
            <div className="flex gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px]">P50: {formatTime(stats.p50FirstResponseMin)}</Badge>
              <Badge variant="secondary" className="text-[10px]">P90: {formatTime(stats.p90FirstResponseMin)}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium">Resolução</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatTime(stats.avgResolutionMin)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tempo médio (30d)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-medium">Abertas</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.openConversations}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ativas agora</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs font-medium">Resolvidas</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.closedLast30d}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Últimos 30 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium">Quebras SLA</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.slaBreaches}</p>
            <p className="text-xs text-muted-foreground mt-0.5">&gt;30min 1ª resposta</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Este mês</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.closedThisMonth}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resolvidas</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Abertas vs Resolvidas (7 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.byDay} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
                <Bar dataKey="closed" name="Resolvidas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={stats.byStatus} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {stats.byStatus.map((_, i) => (
                      <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {stats.byStatus.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[i % STATUS_COLORS.length] }} />
                    <span className="text-xs text-muted-foreground">{s.name}</span>
                    <span className="text-xs font-semibold text-foreground ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2: Hour heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Volume de Mensagens por Hora</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={stats.byHour} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                labelFormatter={(h) => `${h}:00`}
              />
              <Area type="monotone" dataKey="count" name="Mensagens" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Agent performance */}
      {stats.byAgent.length > 0 && stats.byAgent[0].name !== "Não atribuído" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Performance por Atendente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.byAgent.map((agent) => (
                <div key={agent.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      {agent.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground">{agent.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">{formatTime(agent.avgResponseMin)} resp.</Badge>
                    <Badge variant="outline" className="text-[10px]">{agent.closedCount} resolvidas</Badge>
                    <Badge className="text-[10px]">{agent.conversations} total</Badge>
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
