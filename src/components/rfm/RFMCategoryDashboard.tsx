import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRFMCategoryData } from '@/hooks/useRFMCategoryData';
import { RFMHeatmap } from './RFMHeatmap';
import { RFMSegmentCards } from './RFMSegmentCards';
import { RFMCategoryClientList } from './RFMCategoryClientList';
import { Layers, Search, TrendingUp, Users, DollarSign, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const segmentColors: Record<string, string> = {
  'Campeões': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300',
  'Fiéis': 'bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-300',
  'Novos Clientes': 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300',
  'Promissores': 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  'Em Risco': 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300',
  'Alto Valor em Risco': 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  'Hibernando/Perdidos': 'bg-gray-100 text-gray-800 dark:bg-gray-950/50 dark:text-gray-300',
  'Outros': 'bg-slate-100 text-slate-800 dark:bg-slate-950/50 dark:text-slate-300',
};

interface RFMCategoryDashboardProps {
  integrationId: string;
}

export function RFMCategoryDashboard({ integrationId }: RFMCategoryDashboardProps) {
  const {
    snapshots,
    isLoading,
    categories,
    categorySummary,
    getCategoryHeatmap,
    getCategorySegmentDistribution,
  } = useRFMCategoryData(integrationId);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);

  const filteredSummary = categorySummary.filter(cat =>
    cat.category_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCategories = categories.length;
  const totalRecords = snapshots.length;
  const totalRevenue = categorySummary.reduce((sum, c) => sum + c.total_revenue, 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded" />)}
        </div>
      </div>
    );
  }

  if (totalRecords === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Layers className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum dado por categoria disponível</h3>
          <p className="text-muted-foreground">
            Clique em "Calcular RFM" na aba principal para gerar a análise por categoria automaticamente.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Categorias</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCategories}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registros Cliente×Categoria</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRecords.toLocaleString('pt-BR')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Categorias</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categoria..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredSummary.map(cat => (
            <Card
              key={cat.category_name}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md border-2',
                selectedCategory === cat.category_name
                  ? 'ring-2 ring-primary border-primary'
                  : 'border-border hover:border-primary/40'
              )}
              onClick={() => setSelectedCategory(
                selectedCategory === cat.category_name ? null : cat.category_name
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm truncate" title={cat.category_name}>
                    {cat.category_name}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clientes</span>
                    <span className="font-medium">{cat.total_clients}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receita</span>
                    <span className="font-medium">
                      R$ {cat.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ticket Médio</span>
                    <span className="font-medium">
                      R$ {cat.avg_ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t">
                  <Badge variant="secondary" className={cn('text-xs', segmentColors[cat.dominant_segment] || segmentColors['Outros'])}>
                    {cat.dominant_segment}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Detail view for selected category */}
      {selectedCategory && (
        <div className="space-y-6 border-t pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Detalhes: {selectedCategory}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setSelectedCategory(null)}>
              Fechar detalhes
            </Button>
          </div>

          {/* Segment Cards for selected category */}
          <RFMSegmentCards
            segmentDistribution={getCategorySegmentDistribution(selectedCategory)}
            totalClients={snapshots.filter(s => s.category_name === selectedCategory).length}
            activeSegment={segmentFilter}
            onSegmentClick={(seg) => setSegmentFilter(seg === segmentFilter ? null : seg)}
          />

          {/* Heatmap for selected category */}
          <RFMHeatmap
            data={getCategoryHeatmap(selectedCategory)}
            onCellClick={() => {}}
          />

          {/* Client list for selected category */}
          <RFMCategoryClientList
            snapshots={snapshots.filter(s => {
              const matchesCat = s.category_name === selectedCategory;
              const matchesSeg = segmentFilter ? s.segment_name === segmentFilter : true;
              return matchesCat && matchesSeg;
            })}
            segmentFilter={segmentFilter}
            onSegmentFilterChange={setSegmentFilter}
            allSegments={Object.keys(getCategorySegmentDistribution(selectedCategory))}
          />
        </div>
      )}
    </div>
  );
}
