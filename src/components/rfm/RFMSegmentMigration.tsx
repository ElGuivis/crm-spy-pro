import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';

interface MigrationFlow {
  from: string;
  to: string;
  count: number;
  revenue: number;
}

interface RFMSegmentMigrationProps {
  migrations: MigrationFlow[];
}

const positiveTransitions = new Set([
  'Hibernando/Perdidos→Em Risco',
  'Hibernando/Perdidos→Promissores',
  'Hibernando/Perdidos→Novos Clientes',
  'Em Risco→Promissores',
  'Em Risco→Fiéis',
  'Alto Valor em Risco→Fiéis',
  'Alto Valor em Risco→Campeões',
  'Promissores→Fiéis',
  'Promissores→Campeões',
  'Fiéis→Campeões',
  'Novos Clientes→Promissores',
  'Novos Clientes→Fiéis',
  'Outros→Promissores',
  'Outros→Fiéis',
  'Outros→Campeões',
]);

function isPositive(from: string, to: string): boolean {
  return positiveTransitions.has(`${from}→${to}`);
}

export function RFMSegmentMigration({ migrations }: RFMSegmentMigrationProps) {
  if (migrations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Migração entre Segmentos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            É necessário ter pelo menos 2 snapshots RFM para comparar migrações.
          </p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...migrations].sort((a, b) => b.count - a.count);
  const totalPositive = sorted.filter(m => isPositive(m.from, m.to)).reduce((s, m) => s + m.count, 0);
  const totalNegative = sorted.filter(m => !isPositive(m.from, m.to)).reduce((s, m) => s + m.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Migração entre Segmentos</CardTitle>
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <TrendingUp className="h-4 w-4" /> {totalPositive} subiram
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <TrendingDown className="h-4 w-4" /> {totalNegative} caíram
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>De</TableHead>
                <TableHead></TableHead>
                <TableHead>Para</TableHead>
                <TableHead className="text-center">Clientes</TableHead>
                <TableHead className="text-right">Receita Impactada</TableHead>
                <TableHead className="text-center">Tendência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.slice(0, 15).map((m, i) => {
                const positive = isPositive(m.from, m.to);
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{m.from}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground inline" />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{m.to}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-medium">{m.count}</TableCell>
                    <TableCell className="text-right text-sm">
                      R$ {m.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell className="text-center">
                      {positive ? (
                        <TrendingUp className="h-4 w-4 text-green-600 inline" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600 inline" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
