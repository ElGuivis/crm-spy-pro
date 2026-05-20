import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, AlertTriangle } from "lucide-react";
import type { RFMSnapshot } from "@/hooks/useRFMData";

const CHURN_COLOR: Record<string, string> = {
  saudavel: "bg-green-500",
  atencao:  "bg-yellow-500",
  risco:    "bg-orange-500",
  critico:  "bg-red-500",
};
const CHURN_BADGE: Record<string, string> = {
  saudavel: "bg-green-100 text-green-700",
  atencao:  "bg-yellow-100 text-yellow-700",
  risco:    "bg-orange-100 text-orange-700",
  critico:  "bg-red-100 text-red-700",
};
const CHURN_LABEL: Record<string, string> = {
  saudavel: "Saudável",
  atencao:  "Atenção",
  risco:    "Risco",
  critico:  "Crítico",
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  snapshots: RFMSnapshot[];
}

export function RFMLtvChurn({ snapshots }: Props) {
  const [view, setView] = useState<"ltv" | "churn">("ltv");

  const byLtv = [...snapshots]
    .sort((a, b) => (b.revenue_total ?? 0) - (a.revenue_total ?? 0))
    .slice(0, 50);

  const byChurn = [...snapshots]
    .filter((s) => (s.churn_probability ?? 0) > 0)
    .sort((a, b) => (b.churn_probability ?? 0) - (a.churn_probability ?? 0))
    .slice(0, 50);

  const validPredicted = snapshots.filter((s) => (s.ltv_predicted_12m ?? 0) > 0);
  const avgLtv = snapshots.length
    ? snapshots.reduce((s, c) => s + (c.revenue_total ?? 0), 0) / snapshots.length
    : 0;
  const avgPredicted = validPredicted.length
    ? validPredicted.reduce((s, c) => s + (c.ltv_predicted_12m ?? 0), 0) / validPredicted.length
    : 0;
  const criticalCount = snapshots.filter((s) => s.churn_risk === "critico").length;
  const riskCount = snapshots.filter(
    (s) => s.churn_risk === "risco" || s.churn_risk === "critico",
  ).length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "LTV Médio (histórico)", value: brl(avgLtv), color: "" },
          { label: "LTV Projetado (12m)",   value: brl(avgPredicted), color: "text-blue-600" },
          { label: "Em Risco de Churn",      value: String(riskCount),   color: "text-orange-500" },
          { label: "Churn Crítico",          value: String(criticalCount), color: "text-red-500" },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toggle */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={view === "ltv" ? "default" : "outline"}
          onClick={() => setView("ltv")}
          className="gap-1.5"
        >
          <TrendingUp className="h-3.5 w-3.5" />
          LTV por Cliente
        </Button>
        <Button
          size="sm"
          variant={view === "churn" ? "default" : "outline"}
          onClick={() => setView("churn")}
          className="gap-1.5"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Risco de Churn
        </Button>
      </div>

      {view === "ltv" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top 50 Clientes por LTV</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left px-4 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2">Cliente</th>
                    <th className="text-right px-2 py-2">LTV Histórico</th>
                    <th className="text-right px-2 py-2">Projeção 12m</th>
                    <th className="text-right px-2 py-2">Pedidos</th>
                    <th className="text-right px-4 py-2">Ticket Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {byLtv.map((s, i) => (
                    <tr
                      key={s.customer_id}
                      className="border-b border-border/40 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-2 py-2">
                        <p className="font-medium truncate max-w-[160px]">
                          {s.customer_name || s.customer_id}
                        </p>
                        {s.customer_phone && (
                          <p className="text-xs text-muted-foreground">{s.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold">
                        {brl(s.revenue_total ?? 0)}
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-blue-600">
                        {(s.ltv_predicted_12m ?? 0) > 0 ? brl(s.ltv_predicted_12m!) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right">{s.orders_count ?? 0}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {brl(s.aov ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "churn" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clientes em Maior Risco de Churn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byChurn.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum dado de churn calculado. Execute o cálculo RFM primeiro.
              </p>
            ) : (
              byChurn.map((s) => {
                const prob = Math.round((s.churn_probability ?? 0) * 100);
                const risk = s.churn_risk ?? "saudavel";
                return (
                  <div
                    key={s.customer_id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {s.customer_name || s.customer_id}
                        </p>
                        <Badge variant="secondary" className="text-[10px] h-4">
                          {s.segment_name}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.recency_days}d sem comprar · LTV {brl(s.revenue_total ?? 0)}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${CHURN_COLOR[risk] ?? "bg-gray-400"}`}
                            style={{ width: `${prob}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium tabular-nums w-8 text-right">
                          {prob}%
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-5 shrink-0 border-0 ${CHURN_BADGE[risk] ?? ""}`}
                    >
                      {CHURN_LABEL[risk] ?? risk}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
