import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SalesData {
  date: string;
  total: number;
  count: number;
}

interface SalesChartProps {
  data: SalesData[];
  isLoading?: boolean;
  title?: string;
  period?: '7d' | '30d';
}

export function SalesChart({ data, isLoading, title = "Vendas", period = '7d' }: SalesChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return format(date, period === '7d' ? 'EEE' : 'dd/MM', { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  const totalRevenue = data.reduce((sum, d) => sum + d.total, 0);
  const totalOrders = data.reduce((sum, d) => sum + d.count, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-semibold text-green-600">{formatCurrency(totalRevenue)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Pedidos: </span>
              <span className="font-semibold">{totalOrders}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            Nenhum dado disponível
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
              />
              <YAxis 
                tickFormatter={(v) => formatCurrency(v)}
                tick={{ fontSize: 10 }}
                className="text-muted-foreground"
                width={70}
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), 'Receita']}
                labelFormatter={(label) => {
                  try {
                    return format(new Date(label), "dd 'de' MMMM", { locale: ptBR });
                  } catch {
                    return label;
                  }
                }}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="total" 
                stroke="hsl(var(--primary))" 
                fill="url(#colorTotal)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
