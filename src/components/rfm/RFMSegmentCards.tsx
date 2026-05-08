import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Heart, UserPlus, TrendingUp, AlertTriangle, ShieldAlert, Moon, Eye, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const segmentConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  'Campeões': { icon: Trophy, color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800' },
  'Fiéis': { icon: Heart, color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800' },
  'Novos Clientes': { icon: UserPlus, color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  'Promissores': { icon: TrendingUp, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  'Em Risco': { icon: AlertTriangle, color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  'Alto Valor em Risco': { icon: ShieldAlert, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' },
  'Hibernando/Perdidos': { icon: Moon, color: 'text-gray-500', bgColor: 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800' },
  'Outros': { icon: Eye, color: 'text-slate-500', bgColor: 'bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800' },
};

const segmentActions: Record<string, string> = {
  'Campeões': 'VIP, upsell premium, atendimento prioritário',
  'Fiéis': 'Programa de fidelidade, combo, assinatura',
  'Novos Clientes': 'Incentivar 2ª compra com cupom',
  'Promissores': 'Empurrar recorrência de compra',
  'Em Risco': 'Campanha de reativação + oferta personalizada',
  'Alto Valor em Risco': 'Contato humano/WhatsApp, oferta forte',
  'Hibernando/Perdidos': 'Win-back barato, remarketing leve',
  'Outros': 'Monitorar e engajar',
};

interface RFMSegmentCardsProps {
  segmentDistribution: Record<string, { count: number; revenue: number; totalAov: number }>;
  totalClients: number;
  activeSegment: string | null;
  onSegmentClick: (segment: string) => void;
}

export function RFMSegmentCards({ segmentDistribution, totalClients, activeSegment, onSegmentClick }: RFMSegmentCardsProps) {
  const navigate = useNavigate();
  const segments = Object.entries(segmentDistribution).sort((a, b) => b[1].count - a[1].count);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Distribuição por Segmento</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {segments.map(([name, data]) => {
          const config = segmentConfig[name] || segmentConfig['Outros'];
          const Icon = config.icon;
          const pct = totalClients > 0 ? ((data.count / totalClients) * 100).toFixed(1) : '0';
          const avgTicket = data.count > 0 ? data.totalAov / data.count : 0;
          const isActive = activeSegment === name;
          const action = segmentActions[name] || segmentActions['Outros'];

          return (
            <Card
              key={name}
              className={cn(
                'cursor-pointer transition-all border-2 hover:shadow-md',
                config.bgColor,
                isActive && 'ring-2 ring-primary shadow-md'
              )}
              onClick={() => onSegmentClick(name)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn('h-5 w-5', config.color)} />
                  <span className="font-semibold text-sm">{name}</span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clientes</span>
                    <span className="font-medium">{data.count} ({pct}%)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receita</span>
                    <span className="font-medium">R$ {data.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ticket Médio</span>
                    <span className="font-medium">R$ {avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-current/10">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">Ação:</span> {action}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 gap-1 text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/disparos?rfm_segment=${encodeURIComponent(name)}`);
                  }}
                >
                  <Send className="h-3 w-3" />
                  Criar Campanha
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
