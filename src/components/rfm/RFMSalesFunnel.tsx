import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GitMerge, ArrowDown } from 'lucide-react';
import type { RFMSnapshot } from '@/hooks/useRFMData';

interface RFMSalesFunnelProps {
  snapshots: RFMSnapshot[];
}

interface FunnelStage {
  label: string;
  description: string;
  count: number;
  color: string;
  bg: string;
}

export function RFMSalesFunnel({ snapshots }: RFMSalesFunnelProps) {
  if (snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <GitMerge className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold mb-1">Sem dados para o funil</h3>
          <p className="text-sm text-muted-foreground">
            Calcule o RFM para visualizar o funil de clientes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const total = snapshots.length;

  const stages: FunnelStage[] = [
    {
      label: 'Total de Clientes',
      description: 'Todos os clientes com histórico de compra',
      count: total,
      color: 'text-blue-700 dark:text-blue-400',
      bg: 'bg-blue-100 dark:bg-blue-950/50',
    },
    {
      label: 'Compraram 2x ou mais',
      description: 'Fizeram ao menos uma recompra (orders ≥ 2)',
      count: snapshots.filter((s) => (s.orders_count ?? 0) >= 2).length,
      color: 'text-indigo-700 dark:text-indigo-400',
      bg: 'bg-indigo-100 dark:bg-indigo-950/50',
    },
    {
      label: 'Clientes Fiéis',
      description: 'Compraram 5 vezes ou mais (orders ≥ 5)',
      count: snapshots.filter((s) => (s.orders_count ?? 0) >= 5).length,
      color: 'text-violet-700 dark:text-violet-400',
      bg: 'bg-violet-100 dark:bg-violet-950/50',
    },
    {
      label: 'Champions',
      description: 'Segmento Champions — alta frequência, recência e valor',
      count: snapshots.filter((s) => s.segment_name === 'Champions').length,
      color: 'text-yellow-700 dark:text-yellow-400',
      bg: 'bg-yellow-100 dark:bg-yellow-950/50',
    },
  ];

  const maxWidth = 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <GitMerge className="h-5 w-5" />
          Funil de Clientes
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Progressão dos clientes do 1º ao comportamento de campeão de compras
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-w-lg mx-auto">
          {stages.map((stage, i) => {
            const widthPct = total > 0 ? (stage.count / total) * maxWidth : 0;
            const conversionFromPrev =
              i > 0 && stages[i - 1].count > 0
                ? Math.round((stage.count / stages[i - 1].count) * 100)
                : null;
            const pctOfTotal = total > 0 ? Math.round((stage.count / total) * 100) : 0;

            return (
              <div key={stage.label}>
                {i > 0 && (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <ArrowDown className="h-4 w-4 text-muted-foreground" />
                    {conversionFromPrev !== null && (
                      <span className="text-xs text-muted-foreground">
                        {conversionFromPrev}% converteu
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-semibold ${stage.color}`}>{stage.label}</span>
                      <span className="text-sm font-bold">{stage.count.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-8 overflow-hidden">
                      <div
                        className={`h-full rounded-full flex items-center pl-3 transition-all duration-500 ${stage.bg}`}
                        style={{ width: `${Math.max(widthPct, stage.count > 0 ? 8 : 0)}%` }}
                      >
                        <span className={`text-xs font-medium ${stage.color} whitespace-nowrap`}>
                          {pctOfTotal}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{stage.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Churn risk callout */}
        {(() => {
          const atRisk = snapshots.filter((s) => (s.churn_probability ?? 0) >= 0.5).length;
          const atRiskPct = total > 0 ? Math.round((atRisk / total) * 100) : 0;
          if (atRisk === 0) return null;
          return (
            <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/30 p-3">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                ⚠️ {atRisk.toLocaleString('pt-BR')} clientes ({atRiskPct}%) com risco de churn ≥ 50%
              </p>
              <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                Configure uma campanha anti-churn na aba Automação para reconquistá-los.
              </p>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
