import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonthlyRow } from "@/hooks/useGoogleAdsInsights";
import { brl } from "@/lib/googleAds";
import { fmtMonth, fmtRoas } from "@/lib/googleAdsStrategy";

interface Props { monthly: MonthlyRow[] }

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Histórico completo da conta: gasto x receita por mês e ROAS (receita ÷ gasto), desde o primeiro dia com dados. */
export function HistoryCard({ monthly }: Props) {
  const { data, totals, years } = useMemo(() => {
    const rows = monthly.filter((m) => Number(m.cost_micros) > 0 || Number(m.conversions_value) > 0).map((m) => {
      const cost = Number(m.cost_micros) / 1e6;
      const revenue = Number(m.conversions_value);
      return { month: m.month as string, label: fmtMonth(m.month as string), cost: Math.round(cost), revenue: Math.round(revenue), roas: cost > 0 ? Math.round((revenue / cost) * 100) / 100 : null };
    });
    const t = rows.reduce((s, r) => ({ cost: s.cost + r.cost, revenue: s.revenue + r.revenue }), { cost: 0, revenue: 0 });
    const byYear = new Map<string, { cost: number; revenue: number }>();
    for (const r of rows) {
      const y = r.month.slice(0, 4);
      const e = byYear.get(y) ?? { cost: 0, revenue: 0 };
      e.cost += r.cost; e.revenue += r.revenue; byYear.set(y, e);
    }
    return { data: rows, totals: t, years: [...byYear.entries()].map(([year, e]) => ({ year, ...e, roas: e.cost > 0 ? e.revenue / e.cost : null })) };
  }, [monthly]);

  if (!data.length) return null;
  const first = data[0].label;
  const last = data[data.length - 1].label;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Histórico da conta <span className="text-sm font-normal text-muted-foreground">({first} a {last})</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Investido na vida" value={money(totals.cost)} />
          <Kpi label="Receita atribuída" value={money(totals.revenue)} />
          <Kpi label="ROAS da vida" value={fmtRoas(totals.cost > 0 ? totals.revenue / totals.cost : null)} />
          <Kpi label="Meses com gasto" value={String(data.length)} />
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis yAxisId="money" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={40} />
              <YAxis yAxisId="roas" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} width={36} />
              <Tooltip formatter={(v: number, name: string) => (name === "ROAS" ? fmtRoas(v) : money(v))}
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="money" dataKey="cost" name="Gasto" fill="hsl(var(--muted-foreground))" fillOpacity={0.55} />
              <Bar yAxisId="money" dataKey="revenue" name="Receita" fill="hsl(var(--primary))" />
              <Line yAxisId="roas" dataKey="roas" name="ROAS" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          {years.map((y) => (
            <span key={y.year} className="rounded-md bg-muted px-2 py-1">
              <strong>{y.year}</strong> · {brl(y.cost * 1e6)} → {brl(y.revenue * 1e6)} · ROAS {fmtRoas(y.roas)}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Receita = valor das conversões que o Google atribuiu aos anúncios (pode diferir das vendas reais da loja). ROAS = receita ÷ gasto.
        </p>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}
