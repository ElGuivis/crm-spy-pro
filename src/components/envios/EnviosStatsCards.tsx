import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, DollarSign, TrendingUp } from 'lucide-react';
import { formatCurrency, getCardFilterLabel } from './envios-helpers';

interface GlobalStats {
  total: number;
  pending: number;
  posted: number;
  inTransit: number;
  delivered: number;
  canceled: number;
  delayed: number;
  totalValue: number | null;
}

interface Props {
  globalStats: GlobalStats;
  stats: { averageDeliveryDays: number };
  cardFilter: string | null;
  onCardClick: (filter: string) => void;
  onClearCardFilter: () => void;
}

export function EnviosStatsCards({ globalStats, stats, cardFilter, onCardClick, onClearCardFilter }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
        <Card className={`cursor-pointer transition-all hover:border-primary ${!cardFilter ? 'border-primary bg-primary/5' : ''}`} onClick={() => onCardClick('all')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold">{globalStats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-yellow-500 ${cardFilter === 'pending' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : ''}`} onClick={() => onCardClick('pending')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-yellow-600">{globalStats.pending}</div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-blue-500 ${cardFilter === 'posted' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''}`} onClick={() => onCardClick('posted')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-blue-600">{globalStats.posted}</div>
            <p className="text-xs text-muted-foreground">Postados</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-purple-500 ${cardFilter === 'in_transit' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : ''}`} onClick={() => onCardClick('in_transit')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-purple-600">{globalStats.inTransit}</div>
            <p className="text-xs text-muted-foreground">Em Trânsito</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-green-500 ${cardFilter === 'delivered' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`} onClick={() => onCardClick('delivered')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-green-600">{globalStats.delivered}</div>
            <p className="text-xs text-muted-foreground">Entregues</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-red-500 ${cardFilter === 'canceled' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''}`} onClick={() => onCardClick('canceled')}>
          <CardContent className="pt-4 pb-3">
            <div className="text-2xl font-bold text-red-600">{globalStats.canceled}</div>
            <p className="text-xs text-muted-foreground">Cancelados</p>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer transition-all hover:border-orange-500 ${cardFilter === 'delayed' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : ''}`} onClick={() => onCardClick('delayed')}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <div>
                <div className="text-2xl font-bold text-orange-600">{globalStats.delayed}</div>
                <p className="text-xs text-muted-foreground">Atrasados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <div className="text-xl font-bold">{formatCurrency(globalStats.totalValue)}</div>
                <p className="text-xs text-muted-foreground">Valor Total em Fretes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {cardFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtrando por:</span>
          <Badge variant="secondary" className="gap-1">
            {getCardFilterLabel(cardFilter)}
            <button onClick={onClearCardFilter} className="ml-1 hover:text-destructive">✕</button>
          </Badge>
        </div>
      )}

      {stats.averageDeliveryDays > 0 && (
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tempo médio de entrega</p>
                <p className="text-xl font-bold">{stats.averageDeliveryDays} dias</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
