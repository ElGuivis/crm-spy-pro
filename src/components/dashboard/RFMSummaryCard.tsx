import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface RFMSegment {
  segment_name: string;
  count: number;
}

interface RFMSummaryCardProps {
  segments: RFMSegment[];
  isLoading?: boolean;
}

const segmentColors: Record<string, string> = {
  'Campeões': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  'Fiéis': 'bg-green-500/15 text-green-700 dark:text-green-400',
  'Potenciais Fiéis': 'bg-lime-500/15 text-lime-700 dark:text-lime-400',
  'Novos Clientes': 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  'Promissores': 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  'Precisam Atenção': 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  'Prestes a Dormir': 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  'Em Risco': 'bg-red-500/15 text-red-700 dark:text-red-400',
  'Não Perder': 'bg-rose-500/15 text-rose-700 dark:text-rose-400',
  'Hibernando': 'bg-gray-500/15 text-gray-700 dark:text-gray-400',
  'Perdidos': 'bg-slate-500/15 text-slate-700 dark:text-slate-400',
};

export function RFMSummaryCard({ segments, isLoading }: RFMSummaryCardProps) {
  if (isLoading || segments.length === 0) return null;

  const total = segments.reduce((s, seg) => s + seg.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Segmentação RFM
          </CardTitle>
          <Link to="/rfm">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Ver matriz
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {segments.map((seg) => (
            <Badge
              key={seg.segment_name}
              variant="secondary"
              className={`${segmentColors[seg.segment_name] || 'bg-muted text-muted-foreground'} border-0 text-xs font-medium`}
            >
              {seg.segment_name}: {seg.count}
              <span className="ml-1 opacity-60">
                ({Math.round((seg.count / total) * 100)}%)
              </span>
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {total.toLocaleString('pt-BR')} clientes analisados
        </p>
      </CardContent>
    </Card>
  );
}
