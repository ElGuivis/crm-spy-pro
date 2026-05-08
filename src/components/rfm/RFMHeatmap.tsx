import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface HeatmapCell {
  r: number;
  f: number;
  count: number;
  avgM: number;
}

interface RFMHeatmapProps {
  data: HeatmapCell[];
  onCellClick: (r: number, f: number) => void;
  activeCell?: { r: number; f: number } | null;
}

// Classic RFM 5×5 segment grid — every cell mapped exactly once
// Index: segmentGrid[f][r] where f=1..5, r=1..5
const segmentGrid: Record<number, Record<number, string>> = {
  5: { 1: 'Não Perder',    2: 'Em Risco',       3: 'Fiéis',          4: 'Campeões',       5: 'Campeões' },
  4: { 1: 'Em Risco',      2: 'Precisam Atenção',3: 'Precisam Atenção',4: 'Campeões',      5: 'Campeões' },
  3: { 1: 'Hibernando',    2: 'Precisam Atenção',3: 'Potenciais Fiéis',4: 'Potenciais Fiéis',5: 'Fiéis' },
  2: { 1: 'Hibernando',    2: 'Prestes a Dormir',3: 'Prestes a Dormir',4: 'Promissores',   5: 'Promissores' },
  1: { 1: 'Perdidos',      2: 'Hibernando',      3: 'Prestes a Dormir',4: 'Novos Clientes', 5: 'Novos Clientes' },
};

interface SegmentStyle {
  bg: string;
  bgActive: string;
  text: string;
  label: string;
}

const segmentStyles: Record<string, SegmentStyle> = {
  'Campeões':        { bg: 'bg-yellow-500/80 dark:bg-yellow-600/70',   bgActive: 'bg-yellow-400 dark:bg-yellow-500',   text: 'text-yellow-950 dark:text-yellow-50', label: '🏆' },
  'Fiéis':           { bg: 'bg-pink-500/70 dark:bg-pink-600/60',       bgActive: 'bg-pink-400 dark:bg-pink-500',       text: 'text-pink-950 dark:text-pink-50',     label: '💎' },
  'Potenciais Fiéis':{ bg: 'bg-violet-500/70 dark:bg-violet-600/60',   bgActive: 'bg-violet-400 dark:bg-violet-500',   text: 'text-violet-950 dark:text-violet-50', label: '⭐' },
  'Promissores':     { bg: 'bg-blue-500/70 dark:bg-blue-600/60',       bgActive: 'bg-blue-400 dark:bg-blue-500',       text: 'text-blue-950 dark:text-blue-50',     label: '🚀' },
  'Novos Clientes':  { bg: 'bg-emerald-500/70 dark:bg-emerald-600/60', bgActive: 'bg-emerald-400 dark:bg-emerald-500', text: 'text-emerald-950 dark:text-emerald-50',label: '🌱' },
  'Precisam Atenção':{ bg: 'bg-amber-400/70 dark:bg-amber-600/60',     bgActive: 'bg-amber-300 dark:bg-amber-500',     text: 'text-amber-950 dark:text-amber-50',   label: '⚠️' },
  'Prestes a Dormir':{ bg: 'bg-orange-400/70 dark:bg-orange-600/60',   bgActive: 'bg-orange-300 dark:bg-orange-500',   text: 'text-orange-950 dark:text-orange-50', label: '😴' },
  'Em Risco':        { bg: 'bg-red-500/70 dark:bg-red-600/60',         bgActive: 'bg-red-400 dark:bg-red-500',         text: 'text-red-950 dark:text-red-50',       label: '🔥' },
  'Não Perder':      { bg: 'bg-rose-600/80 dark:bg-rose-700/70',       bgActive: 'bg-rose-500 dark:bg-rose-600',       text: 'text-rose-50',                        label: '🚨' },
  'Hibernando':      { bg: 'bg-slate-400/60 dark:bg-slate-600/50',     bgActive: 'bg-slate-300 dark:bg-slate-500',     text: 'text-slate-900 dark:text-slate-100',  label: '💤' },
  'Perdidos':        { bg: 'bg-gray-500/60 dark:bg-gray-700/50',       bgActive: 'bg-gray-400 dark:bg-gray-600',       text: 'text-gray-50',                        label: '👻' },
};

function getSegmentForCell(r: number, f: number): string {
  return segmentGrid[f]?.[r] || 'Outros';
}

const recencyLabels = [
  { score: 1, label: '241d+' },
  { score: 2, label: '121-240d' },
  { score: 3, label: '61-120d' },
  { score: 4, label: '31-60d' },
  { score: 5, label: '0-30d' },
];

const frequencyLabels = [
  { score: 1, label: '1 ped.' },
  { score: 2, label: '2 ped.' },
  { score: 3, label: '3-4 ped.' },
  { score: 4, label: '5-9 ped.' },
  { score: 5, label: '10+ ped.' },
];

export function RFMHeatmap({ data, onCellClick, activeCell }: RFMHeatmapProps) {
  const totalClients = data.reduce((sum, d) => sum + d.count, 0);

  // Aggregate counts per segment
  const segmentCounts: Record<string, number> = {};
  for (const cell of data) {
    if (cell.count === 0) continue;
    const seg = getSegmentForCell(cell.r, cell.f);
    segmentCounts[seg] = (segmentCounts[seg] || 0) + cell.count;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg">Matriz RFM</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em uma célula para filtrar os clientes daquele quadrante.
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-normal">
            {totalClients.toLocaleString('pt-BR')} clientes mapeados
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <div className="min-w-[480px] max-w-[680px] mx-auto">
            {/* Y-axis label */}
            <div className="flex items-center gap-2 mb-1">
              <div className="w-10 text-[11px] text-muted-foreground text-right font-semibold">
                Freq.
              </div>
              <div className="flex-1" />
            </div>

            {/* Grid rows (F=5 at top, F=1 at bottom) */}
            {[5, 4, 3, 2, 1].map(f => (
              <div key={f} className="flex items-center gap-2 mb-1.5">
                <div className="w-10 text-[10px] text-muted-foreground text-right font-semibold tabular-nums leading-tight">
                  <div>F{f}</div>
                  <div className="font-normal opacity-75">{frequencyLabels.find(l => l.score === f)?.label}</div>
                </div>
                <div className="flex-1 grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map(r => {
                    const cell = data.find(d => d.r === r && d.f === f);
                    const count = cell?.count || 0;
                    const avgM = cell?.avgM || 0;
                    const segment = getSegmentForCell(r, f);
                    const style = segmentStyles[segment];
                    const isActive = activeCell?.r === r && activeCell?.f === f;

                    return (
                      <Tooltip key={`${r}-${f}`}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => onCellClick(r, f)}
                            className={cn(
                              'relative rounded-lg flex flex-col items-center justify-center p-1.5',
                              'transition-all duration-150 hover:scale-105 hover:shadow-lg cursor-pointer',
                              'min-h-[72px]',
                              isActive ? style?.bgActive : style?.bg,
                              style?.text,
                              isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105 shadow-lg'
                            )}
                          >
                            {/* Segment label */}
                            <span className="text-[9px] font-bold leading-tight text-center opacity-90 line-clamp-2">
                              {style?.label} {segment}
                            </span>
                            {/* Client count */}
                            <span className="text-sm font-bold leading-none mt-1">
                              {count > 0 ? count.toLocaleString('pt-BR') : '—'}
                            </span>
                            {/* Avg revenue */}
                            {count > 0 && (
                              <span className="text-[9px] opacity-80 leading-none mt-0.5">
                                R${avgM >= 1000 ? `${(avgM / 1000).toFixed(1)}k` : avgM.toFixed(0)}
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px]">
                          <div className="text-xs space-y-1">
                            <p className="font-bold">{style?.label} {segment}</p>
                            <p className="text-muted-foreground">Recência: {r} | Frequência: {f}</p>
                            <p>{count} clientes</p>
                            {count > 0 && (
                              <p>Receita média: R$ {avgM.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* X-axis labels */}
            <div className="flex items-center gap-2 mt-2">
              <div className="w-10" />
              <div className="flex-1 grid grid-cols-5 gap-1.5">
                {recencyLabels.map(({ score, label }) => (
                  <div key={score} className="text-[10px] text-muted-foreground text-center font-semibold tabular-nums leading-tight">
                    <div>R{score}</div>
                    <div className="font-normal opacity-75">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-10" />
              <div className="text-[11px] text-muted-foreground text-center flex-1 italic">
                Recência → (1 = antigo · 5 = recente)
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Criteria */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Critérios de Pontuação</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground mb-1">Recência (dias)</p>
              <ul className="space-y-0.5">
                <li>R5: 0-30 dias</li>
                <li>R4: 31-60 dias</li>
                <li>R3: 61-120 dias</li>
                <li>R2: 121-240 dias</li>
                <li>R1: 241+ dias</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Frequência (pedidos)</p>
              <ul className="space-y-0.5">
                <li>F5: 10+ pedidos</li>
                <li>F4: 5-9 pedidos</li>
                <li>F3: 3-4 pedidos</li>
                <li>F2: 2 pedidos</li>
                <li>F1: 1 pedido</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Monetário (receita)</p>
              <ul className="space-y-0.5">
                <li>M5: R$2.000+</li>
                <li>M4: R$1.000-1.999</li>
                <li>M3: R$500-999</li>
                <li>M2: R$200-499</li>
                <li>M1: R$0-199</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Segment Legend */}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Segmentos</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {Object.entries(segmentStyles).map(([name, style]) => {
              const count = segmentCounts[name] || 0;
              return (
                <div key={name} className="flex items-center gap-1.5 text-xs">
                  <div className={cn('w-3 h-3 rounded-sm', style.bg)} />
                  <span className="text-muted-foreground">
                    {style.label} {name}
                    {count > 0 && <span className="ml-1 font-medium text-foreground">({count})</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Export for reuse in other components
export { getSegmentForCell, segmentStyles, segmentGrid };
