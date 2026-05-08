import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const segmentLineColors: Record<string, string> = {
  'Campeões': '#eab308',
  'Fiéis': '#ec4899',
  'Novos Clientes': '#22c55e',
  'Promissores': '#3b82f6',
  'Em Risco': '#f97316',
  'Alto Valor em Risco': '#ef4444',
  'Hibernando/Perdidos': '#6b7280',
  'Outros': '#94a3b8',
};

interface SegmentHistoryEntry {
  reference_date: string;
  [segment: string]: string | number;
}

interface RFMSegmentEvolutionProps {
  history: SegmentHistoryEntry[];
  segments: string[];
}

export function RFMSegmentEvolution({ history, segments }: RFMSegmentEvolutionProps) {
  if (history.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolução dos Segmentos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            É necessário ter pelo menos 2 cálculos RFM em datas diferentes para exibir a evolução.
            Execute o cálculo em dias diferentes para acompanhar as mudanças.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Evolução dos Segmentos</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="reference_date"
              tickFormatter={(val) => {
                try { return format(new Date(val), 'dd/MM', { locale: ptBR }); } catch { return val; }
              }}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip
              labelFormatter={(val) => {
                try { return format(new Date(val as string), 'dd/MM/yyyy', { locale: ptBR }); } catch { return String(val); }
              }}
            />
            <Legend />
            {segments.map(seg => (
              <Line
                key={seg}
                type="monotone"
                dataKey={seg}
                stroke={segmentLineColors[seg] || '#94a3b8'}
                strokeWidth={2}
                dot={{ r: 3 }}
                name={seg}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
