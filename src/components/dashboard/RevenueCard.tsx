import { TrendingUp, TrendingDown, DollarSign, Calendar } from "lucide-react";

interface RevenueCardProps {
  totalRevenue: number;
  revenueChange: number;
  totalOrders: number;
  totalRevenue30d?: number;
  totalOrders30d?: number;
  isLoading?: boolean;
}

export function RevenueCard({ totalRevenue, revenueChange, totalOrders, totalRevenue30d, totalOrders30d, isLoading }: RevenueCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="card-premium p-6">
        <div className="space-y-3">
          <div className="shimmer h-4 w-32 rounded-md" />
          <div className="shimmer h-10 w-48 rounded-md" />
          <div className="flex gap-4">
            <div className="shimmer h-4 w-28 rounded-md" />
            <div className="shimmer h-4 w-20 rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  // Show 30-day data as primary when current month has no revenue
  const showMonthly = totalRevenue > 0 || !totalRevenue30d;
  const primaryRevenue = showMonthly ? totalRevenue : totalRevenue30d || 0;
  const primaryOrders = showMonthly ? totalOrders : totalOrders30d || 0;
  const periodLabel = showMonthly ? "Receita Total (mês)" : "Receita (últimos 30 dias)";

  const isPositive = revenueChange >= 0;
  const avg30d = (totalOrders30d && totalOrders30d > 0) ? (totalRevenue30d || 0) / totalOrders30d : 0;

  return (
    <div className="card-premium group overflow-hidden">
      {/* Gradient background stripe */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/3" />
      <div className="absolute top-0 left-0 w-full h-1 gradient-whatsapp" />
      
      <div className="relative p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DollarSign className="h-4 w-4" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{periodLabel}</span>
          </div>
          {/* Show monthly alongside when displaying 30d */}
          {!showMonthly && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Mês atual: {formatCurrency(totalRevenue)} ({totalOrders} pedidos)</span>
            </div>
          )}
        </div>
        <div className="text-3xl md:text-4xl font-bold text-foreground mt-2 tracking-tight">
          {formatCurrency(primaryRevenue)}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-sm">
          {showMonthly && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${isPositive ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
              {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span className="font-medium text-xs">{isPositive ? '+' : ''}{revenueChange}% vs mês anterior</span>
            </div>
          )}
          <div className="flex items-center text-xs text-muted-foreground font-medium">
            {primaryOrders} pedidos
          </div>
          {!showMonthly && avg30d > 0 && (
            <div className="flex items-center text-xs text-muted-foreground font-medium">
              Ticket médio: {formatCurrency(avg30d)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}