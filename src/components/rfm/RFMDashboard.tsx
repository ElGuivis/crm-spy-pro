import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRFMData } from '@/hooks/useRFMData';
import { RFMSegmentCards } from './RFMSegmentCards';
import { RFMHeatmap } from './RFMHeatmap';
import { RFMClientList } from './RFMClientList';
import { RFMTopOpportunities } from './RFMTopOpportunities';
import { RFMSegmentEvolution } from './RFMSegmentEvolution';
import { RFMSegmentMigration } from './RFMSegmentMigration';
import { RFMAudienceBuilder } from './RFMAudienceBuilder';
import { RFMCategoryDashboard } from './RFMCategoryDashboard';
import { RFMCohortAnalysis } from './RFMCohortAnalysis';
import { RFMPredictions } from './RFMPredictions';
import { RFMLtvChurn } from './RFMLtvChurn';
import { ChurnCampaignCard } from './ChurnCampaignCard';
import { Calculator, Users, DollarSign, Repeat, CalendarClock, Loader2, Layers, CalendarRange, TrendingUp, Activity, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RFMDashboardProps {
  integrationId: string;
  sourceType: string;
  integrationName: string;
}

export function RFMDashboard({ integrationId, sourceType, integrationName }: RFMDashboardProps) {
  const {
    snapshots,
    isLoading,
    calculateRFM,
    isCalculating,
    totalClients,
    avgTicket,
    repurchaseRate,
    lastCalculation,
    segmentDistribution,
    heatmapData,
    segmentHistory,
    segmentHistorySegments,
    migrations,
  } = useRFMData(integrationId);

  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);
  const [activeHeatmapCell, setActiveHeatmapCell] = useState<{ r: number; f: number } | null>(null);

  const filteredSnapshots = (() => {
    let result = snapshots;
    if (segmentFilter) result = result.filter(s => s.segment_name === segmentFilter);
    if (activeHeatmapCell) result = result.filter(s => s.r_score === activeHeatmapCell.r && s.f_score === activeHeatmapCell.f);
    return result;
  })();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Matriz RFM</h1>
          <p className="text-muted-foreground">{integrationName}</p>
        </div>
        <Button
          onClick={() => calculateRFM({ sourceType })}
          disabled={isCalculating}
          className="gap-2"
        >
          {isCalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          {isCalculating ? 'Calculando...' : 'Calcular RFM'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Médio</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Recompra</CardTitle>
            <Repeat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{repurchaseRate.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Último Cálculo</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastCalculation ? format(new Date(lastCalculation), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      {totalClients > 0 && (
        <Tabs defaultValue="global" className="w-full">
          <TabsList>
            <TabsTrigger value="global" className="gap-2">
              <Users className="h-4 w-4" />
              Visão Global
            </TabsTrigger>
            <TabsTrigger value="category" className="gap-2">
              <Layers className="h-4 w-4" />
              Por Categoria
            </TabsTrigger>
            <TabsTrigger value="cohort" className="gap-2">
              <CalendarRange className="h-4 w-4" />
              Coortes
            </TabsTrigger>
            <TabsTrigger value="predictions" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Previsões
            </TabsTrigger>
            <TabsTrigger value="ltv" className="gap-2">
              <Activity className="h-4 w-4" />
              LTV & Churn
            </TabsTrigger>
            <TabsTrigger value="automacao" className="gap-2">
              <Zap className="h-4 w-4" />
              Automação
            </TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="space-y-6 mt-4">
            {/* Segment Distribution */}
            <RFMSegmentCards
              segmentDistribution={segmentDistribution}
              totalClients={totalClients}
              activeSegment={segmentFilter}
              onSegmentClick={(seg) => {
                setSegmentFilter(seg === segmentFilter ? null : seg);
                setActiveHeatmapCell(null);
              }}
            />

            {/* Heatmap */}
            <RFMHeatmap
              data={heatmapData}
              activeCell={activeHeatmapCell}
              onCellClick={(r, f) => {
                if (activeHeatmapCell?.r === r && activeHeatmapCell?.f === f) {
                  setActiveHeatmapCell(null);
                } else {
                  setActiveHeatmapCell({ r, f });
                  setSegmentFilter(null);
                }
              }}
            />

            {/* Segment Evolution */}
            <RFMSegmentEvolution
              history={segmentHistory}
              segments={segmentHistorySegments}
            />

            {/* Segment Migration */}
            <RFMSegmentMigration migrations={migrations} />

            {/* Top Opportunities */}
            <RFMTopOpportunities snapshots={snapshots} />

            {/* Audiences */}
            <RFMAudienceBuilder
              integrationId={integrationId}
              allSegments={Object.keys(segmentDistribution)}
            />

            {/* Client List */}
            <RFMClientList
              snapshots={filteredSnapshots}
              segmentFilter={segmentFilter}
              onSegmentFilterChange={setSegmentFilter}
              allSegments={Object.keys(segmentDistribution)}
            />
          </TabsContent>

          <TabsContent value="category" className="mt-4">
            <RFMCategoryDashboard integrationId={integrationId} />
          </TabsContent>

          <TabsContent value="cohort" className="mt-4">
            <RFMCohortAnalysis integrationId={integrationId} sourceType={sourceType} />
          </TabsContent>

          <TabsContent value="predictions" className="mt-4">
            <RFMPredictions snapshots={snapshots} />
          </TabsContent>

          <TabsContent value="ltv" className="mt-4">
            <RFMLtvChurn snapshots={snapshots ?? []} />
          </TabsContent>

          <TabsContent value="automacao" className="mt-4">
            <div className="max-w-xl">
              <ChurnCampaignCard />
            </div>
          </TabsContent>
        </Tabs>
      )}

      {totalClients === 0 && !isLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum dado RFM disponível</h3>
            <p className="text-muted-foreground mb-4">
              Clique em "Calcular RFM" para analisar seus clientes com base em todo o histórico de pedidos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
