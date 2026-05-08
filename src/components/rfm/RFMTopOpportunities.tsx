import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldAlert, UserPlus, TrendingUp, Send, MessageCircle, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { RFMSnapshot } from '@/hooks/useRFMData';

interface RFMTopOpportunitiesProps {
  snapshots: RFMSnapshot[];
}

interface OpportunityGroup {
  title: string;
  icon: React.ReactNode;
  badgeColor: string;
  items: RFMSnapshot[];
  action: string;
  urgency: 'alta' | 'média' | 'baixa';
  segmentFilter: string;
}

const urgencyColors = {
  'alta': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'média': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'baixa': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

export function RFMTopOpportunities({ snapshots }: RFMTopOpportunitiesProps) {
  const navigate = useNavigate();

  const highValueAtRisk = snapshots
    .filter(s => s.segment_name === 'Alto Valor em Risco')
    .sort((a, b) => Number(b.revenue_total || 0) - Number(a.revenue_total || 0))
    .slice(0, 10);

  const newWithPotential = snapshots
    .filter(s => s.segment_name === 'Novos Clientes')
    .sort((a, b) => Number(b.revenue_total || 0) - Number(a.revenue_total || 0))
    .slice(0, 10);

  const upsellCandidates = snapshots
    .filter(s => s.segment_name === 'Campeões' || s.segment_name === 'Fiéis')
    .sort((a, b) => Number(b.revenue_total || 0) - Number(a.revenue_total || 0))
    .slice(0, 10);

  const atRiskAll = snapshots.filter(s => s.segment_name === 'Alto Valor em Risco');
  const newAll = snapshots.filter(s => s.segment_name === 'Novos Clientes');
  const upsellAll = snapshots.filter(s => s.segment_name === 'Campeões' || s.segment_name === 'Fiéis');

  const groups: OpportunityGroup[] = [];

  if (highValueAtRisk.length > 0) {
    const totalRevenue = atRiskAll.reduce((s, c) => s + Number(c.aov || 0), 0);
    groups.push({
      title: 'Alto Valor em Risco',
      icon: <ShieldAlert className="h-4 w-4 text-red-500" />,
      badgeColor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      items: highValueAtRisk,
      action: 'Contato humano/WhatsApp, oferta forte',
      urgency: 'alta',
      segmentFilter: 'Alto Valor em Risco',
    });
  }

  if (newWithPotential.length > 0) {
    groups.push({
      title: 'Novos — Converter 2ª Compra',
      icon: <UserPlus className="h-4 w-4 text-green-500" />,
      badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      items: newWithPotential,
      action: 'Incentivar 2ª compra com cupom',
      urgency: 'alta',
      segmentFilter: 'Novos Clientes',
    });
  }

  if (upsellCandidates.length > 0) {
    groups.push({
      title: 'Upsell / VIP',
      icon: <TrendingUp className="h-4 w-4 text-yellow-500" />,
      badgeColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      items: upsellCandidates,
      action: 'VIP, pré-lançamento, upsell premium',
      urgency: 'baixa',
      segmentFilter: 'Campeões',
    });
  }

  if (groups.length === 0) return null;

  const handleCreateCampaign = (segmentName: string) => {
    navigate(`/disparos?rfm_segment=${encodeURIComponent(segmentName)}`);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Top Oportunidades</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {groups.map((group) => {
          const groupAll = group.segmentFilter === 'Campeões'
            ? upsellAll
            : group.segmentFilter === 'Novos Clientes'
              ? newAll
              : atRiskAll;
          const potentialRevenue = groupAll.reduce((s, c) => s + Number(c.aov || 0), 0);

          return (
            <Card key={group.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {group.icon} {group.title}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className={urgencyColors[group.urgency]}>
                    <Zap className="h-3 w-3 mr-1" />
                    Urgência {group.urgency}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {groupAll.length} clientes
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Potential revenue */}
                <div className="p-2 rounded bg-muted/50 text-sm">
                  <span className="text-muted-foreground">Potencial: </span>
                  <span className="font-semibold">
                    R$ {potentialRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Action */}
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold">Ação:</span> {group.action}
                </p>

                {/* Top clients */}
                <div className="space-y-1">
                  {group.items.slice(0, 5).map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground text-xs w-4">{i + 1}.</span>
                        <span className="truncate">{s.customer_name || 'Sem nome'}</span>
                      </div>
                      <Badge variant="secondary" className={group.badgeColor}>
                        R$ {Number(s.revenue_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </Badge>
                    </div>
                  ))}
                </div>

                {/* Create campaign button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleCreateCampaign(group.segmentFilter)}
                >
                  <Send className="h-3.5 w-3.5" />
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
