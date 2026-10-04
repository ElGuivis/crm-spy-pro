import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CampaignPerformance } from "@/hooks/useEmailCampaignPerformance";

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

/** Comparativo das últimas campanhas: pessoas que abriram, clicaram e pedidos atribuídos. */
export function PerformanceChart({ rows }: { rows: CampaignPerformance[] }) {
  const data = [...rows]
    .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
    .slice(-8)
    .map((r) => ({ name: short(r.internal_name), Abriram: r.unique_opens, Clicaram: r.unique_clicks, Pedidos: r.orders }));
  if (data.length < 2) return null; // com uma campanha só não há o que comparar
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Comparativo das últimas campanhas</CardTitle></CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -10, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Abriram" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Clicaram" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Pedidos" fill="#16a34a" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
