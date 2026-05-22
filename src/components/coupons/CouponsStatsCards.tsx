import { Ticket, Clock, CheckCircle2, XCircle, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CouponStats } from "@/hooks/useCouponsData";

interface CouponsStatsCardsProps {
  stats: CouponStats;
  formatCurrency: (value: number) => string;
  onClickValue: () => void;
}

export function CouponsStatsCards({ stats, formatCurrency, onClickValue }: CouponsStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Gerados</CardTitle></CardHeader>
        <CardContent><div className="flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.total}</span></div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle></CardHeader>
        <CardContent><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /><span className="text-2xl font-bold">{stats.active}</span></div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Utilizados</CardTitle></CardHeader>
        <CardContent><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-2xl font-bold">{stats.used}</span></div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Expirados</CardTitle></CardHeader>
        <CardContent><div className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /><span className="text-2xl font-bold">{stats.expired}</span></div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxa Conversão</CardTitle></CardHeader>
        <CardContent><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-blue-500" /><span className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</span></div></CardContent>
      </Card>
      <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={onClickValue}>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Valor Gerado</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-green-600" /><span className="text-xl font-bold text-green-600">{formatCurrency(stats.totalGeneratedValue)}</span></div>
          <p className="text-xs text-muted-foreground mt-1">Clique para ver detalhes</p>
        </CardContent>
      </Card>
    </div>
  );
}
