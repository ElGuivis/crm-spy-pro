import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useRFMCohort } from '@/hooks/useRFMCohort';
import { CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RFMCohortAnalysisProps {
  integrationId: string;
  sourceType: string;
}

function getRetentionColor(pct: number): string {
  if (pct === 0) return '';
  if (pct >= 40) return 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300';
  if (pct >= 25) return 'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300';
  if (pct >= 15) return 'bg-yellow-100 dark:bg-yellow-950/50 text-yellow-800 dark:text-yellow-300';
  if (pct >= 5) return 'bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300';
  return 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300';
}

function formatCohortLabel(cohort: string): string {
  const [year, month] = cohort.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

export function RFMCohortAnalysis({ integrationId, sourceType }: RFMCohortAnalysisProps) {
  const { cohorts, isLoading, retentionWindows } = useRFMCohort(integrationId, sourceType);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Análise de Coortes</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (cohorts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarRange className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold mb-1">Sem dados de coorte</h3>
          <p className="text-sm text-muted-foreground">
            Dados de pedidos são necessários para calcular a retenção por coorte.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show only last 12 cohorts to keep it readable
  const displayCohorts = cohorts.slice(-12);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarRange className="h-5 w-5" />
          Análise de Coortes — Retenção por Mês de 1ª Compra
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          % de clientes que fizeram uma 2ª compra dentro do período indicado após a 1ª compra
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10">Coorte</TableHead>
                <TableHead className="text-center">Clientes</TableHead>
                {retentionWindows.map(w => (
                  <TableHead key={w.key} className="text-center">{w.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayCohorts.map(row => (
                <TableRow key={row.cohort}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium whitespace-nowrap">
                    {formatCohortLabel(row.cohort)}
                  </TableCell>
                  <TableCell className="text-center font-medium">{row.cohortSize}</TableCell>
                  {retentionWindows.map(w => {
                    const pct = row.retention[w.key] || 0;
                    return (
                      <TableCell
                        key={w.key}
                        className={cn('text-center font-medium', getRetentionColor(pct))}
                      >
                        {pct > 0 ? `${pct}%` : '—'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {cohorts.length > 12 && (
          <p className="text-xs text-muted-foreground mt-3">
            Exibindo os últimos 12 meses de {cohorts.length} coortes disponíveis.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
