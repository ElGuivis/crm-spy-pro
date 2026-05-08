import { useState } from "react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { IntegrationCard } from "@/components/dashboard/IntegrationCard";
import { TokenBalance } from "@/components/tokens/TokenBalance";
import { TokenUsageCard } from "@/components/tokens/TokenUsageCard";
import { PlansCard } from "@/components/tokens/PlansCard";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { TopProductsCard } from "@/components/dashboard/TopProductsCard";
import { RevenueCard } from "@/components/dashboard/RevenueCard";
import { RFMSummaryCard } from "@/components/dashboard/RFMSummaryCard";
import { MessagingStatsCard } from "@/components/dashboard/MessagingStatsCard";
import { AttendanceDashboard } from "@/components/dashboard/AttendanceDashboard";
import { SalesAnalyticsDashboard } from "@/components/dashboard/SalesAnalyticsDashboard";
import { CampaignAnalyticsDashboard } from "@/components/dashboard/CampaignAnalyticsDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, 
  Users, 
  Zap, 
  TrendingUp,
  Loader2,
  PlugZap,
  Truck,
  Package,
  AlertTriangle,
  CheckCircle2,
  Megaphone,
  Bell,
  Gift,
  Receipt,
  LayoutDashboard,
  Headphones,
  ShoppingBag,
  BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboardStats, useDashboardIntegrations } from "@/hooks/useDashboardStats";
import { Link } from "react-router-dom";
import { SetupChecklist } from "@/components/onboarding/SetupChecklist";

const Index = () => {
  const { profile } = useAuth();
  const stats = useDashboardStats();
  const { integrations, isLoading: integrationsLoading } = useDashboardIntegrations();
  const [activeTab, setActiveTab] = useState("overview");

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace('.0', '') + 'k';
    }
    return num.toString();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const userName = profile?.company_name || 'Usuário';

  const statsData = [
    {
      title: "Conversas Ativas",
      value: stats.isLoading ? "..." : stats.activeConversations.toString(),
      change: stats.conversationChange !== 0 
        ? `${stats.conversationChange > 0 ? '+' : ''}${stats.conversationChange}% vs último mês` 
        : "Mesmo que mês anterior",
      changeType: stats.conversationChange > 0 ? "positive" as const : 
                  stats.conversationChange < 0 ? "negative" as const : "neutral" as const,
      icon: MessageSquare
    },
    {
      title: "Total de Contatos",
      value: stats.isLoading ? "..." : formatNumber(stats.totalContacts),
      change: stats.newContactsThisMonth > 0 
        ? `+${stats.newContactsThisMonth} novos este mês` 
        : "Nenhum novo este mês",
      changeType: stats.newContactsThisMonth > 0 ? "positive" as const : "neutral" as const,
      icon: Users
    },
    {
      title: "Ticket Médio",
      value: stats.isLoading ? "..." : formatCurrency(
        stats.avgTicket > 0 ? stats.avgTicket : 
        (stats.totalOrders30d > 0 ? stats.totalRevenue30d / stats.totalOrders30d : 0)
      ),
      change: stats.totalOrdersThisMonth > 0 
        ? `${stats.totalOrdersThisMonth} pedidos este mês` 
        : stats.totalOrders30d > 0 
          ? `${stats.totalOrders30d} pedidos (30 dias)` 
          : "Sem pedidos recentes",
      changeType: (stats.totalOrdersThisMonth > 0 || stats.totalOrders30d > 0) ? "positive" as const : "neutral" as const,
      icon: Receipt
    },
    {
      title: "Taxa de Sucesso IA",
      value: stats.isLoading ? "..." : `${stats.aiResponseRate}%`,
      change: stats.aiResponseRate >= 90 ? "Excelente" : 
              stats.aiResponseRate >= 70 ? "Bom" : "Precisa atenção",
      changeType: stats.aiResponseRate >= 90 ? "positive" as const : 
                  stats.aiResponseRate >= 70 ? "neutral" as const : "negative" as const,
      icon: TrendingUp
    }
  ];

  const shipmentStats = [
    {
      title: "Total de Envios",
      value: stats.isLoading ? "..." : formatNumber(stats.totalShipments),
      change: "Todos os envios sincronizados",
      changeType: "neutral" as const,
      icon: Package
    },
    {
      title: "Em Trânsito",
      value: stats.isLoading ? "..." : stats.shipmentsInTransit.toString(),
      change: "Postados e em transporte",
      changeType: stats.shipmentsInTransit > 0 ? "positive" as const : "neutral" as const,
      icon: Truck
    },
    {
      title: "Entregues (mês)",
      value: stats.isLoading ? "..." : (
        stats.shipmentsDeliveredThisMonth > 0 
          ? stats.shipmentsDeliveredThisMonth.toString()
          : stats.shipmentsDelivered30d.toString()
      ),
      change: stats.shipmentsDeliveredThisMonth > 0 
        ? "Entregas concluídas este mês" 
        : stats.shipmentsDelivered30d > 0 
          ? "Entregas nos últimos 30 dias"
          : "Nenhuma entrega recente",
      changeType: (stats.shipmentsDeliveredThisMonth > 0 || stats.shipmentsDelivered30d > 0) ? "positive" as const : "neutral" as const,
      icon: CheckCircle2
    },
    {
      title: "Atrasados",
      value: stats.isLoading ? "..." : stats.shipmentsDelayed.toString(),
      change: stats.shipmentsDelayed > 0 ? "Precisam atenção" : "Tudo em dia",
      changeType: stats.shipmentsDelayed > 0 ? "negative" as const : "positive" as const,
      icon: AlertTriangle,
      href: "/envios-atrasados"
    }
  ];

  const hasSalesData = stats.salesData7d.some(d => d.total > 0) || stats.totalRevenueThisMonth > 0 || stats.totalRevenue30d > 0;
  const hasBulkCampaigns = stats.bulkCampaignStats.totalCampaigns > 0;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Welcome Section */}
      <div className="animate-fade-in">
        <h2 className="text-xl md:text-2xl font-bold text-foreground">
          Bem-vindo de volta, {userName}! 👋
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Aqui está um resumo do seu atendimento de hoje
        </p>
      </div>

      {/* Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start bg-muted/50 p-1 h-auto flex-wrap gap-1 overflow-x-auto">
          <TabsTrigger value="overview" className="gap-1.5 text-xs data-[state=active]:bg-background">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5 text-xs data-[state=active]:bg-background">
            <Headphones className="h-3.5 w-3.5" />
            Atendimento
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5 text-xs data-[state=active]:bg-background">
            <ShoppingBag className="h-3.5 w-3.5" />
            Vendas
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="gap-1.5 text-xs data-[state=active]:bg-background">
            <BarChart3 className="h-3.5 w-3.5" />
            Campanhas
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab (existing dashboard) */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Setup Checklist */}
          <SetupChecklist />
          
          {/* Revenue Card (prominent) */}
          {hasSalesData && (
            <div className="animate-slide-up">
              <RevenueCard
                totalRevenue={stats.totalRevenueThisMonth}
                revenueChange={stats.revenueChange}
                totalOrders={stats.totalOrdersThisMonth}
                totalRevenue30d={stats.totalRevenue30d}
                totalOrders30d={stats.totalOrders30d}
                isLoading={stats.isLoading}
              />
            </div>
          )}

          {/* Token Balance and Stats Grid */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
            <TokenBalance variant="card" className="lg:col-span-1" />
            <div className="lg:col-span-3 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
              {statsData.map((stat) => (
                <StatsCard key={stat.title} {...stat} />
              ))}
            </div>
          </div>

          {/* Sales Charts Row */}
          {hasSalesData && (
            <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2 animate-slide-up" style={{ animationDelay: "150ms" }}>
              <SalesChart 
                data={stats.salesData7d} 
                isLoading={stats.isLoading}
                title="📈 Vendas (últimos 7 dias)"
                period="7d"
              />
              <TopProductsCard 
                products={stats.topProducts.length > 0 ? stats.topProducts : stats.topProducts30d}
                isLoading={stats.isLoading}
                period={stats.topProducts.length > 0 ? 'month' : '30d'}
              />
            </div>
          )}

          {/* RFM Summary + Messaging Stats */}
          {(stats.rfmSummary.length > 0 || stats.msgsSent30d > 0 || stats.msgsReceived30d > 0) && (
            <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2 animate-slide-up" style={{ animationDelay: "175ms" }}>
              <RFMSummaryCard segments={stats.rfmSummary} isLoading={stats.isLoading} />
              <MessagingStatsCard sent={stats.msgsSent30d} received={stats.msgsReceived30d} isLoading={stats.isLoading} />
            </div>
          )}

          {/* Shipment Stats */}
          {stats.totalShipments > 0 && (
            <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
              <div className="section-divider">
                <h3>📦 Envios</h3>
              </div>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {shipmentStats.map((stat) => {
                  const { href, ...statProps } = stat;
                  return href ? (
                    <Link key={stat.title} to={href}>
                      <StatsCard {...statProps} className={stat.changeType === 'negative' ? 'border-destructive/50 hover:border-destructive' : ''} />
                    </Link>
                  ) : (
                    <StatsCard key={stat.title} {...statProps} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Automations Breakdown + Bulk Campaigns */}
          <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2 animate-slide-up" style={{ animationDelay: "250ms" }}>
            {stats.activeAutomations > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Automações Ativas
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stats.automationBreakdown.orderNotifications > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">Notificações de Pedido</span>
                      </div>
                      <span className="text-sm font-medium text-foreground">{stats.automationBreakdown.orderNotifications}</span>
                    </div>
                  )}
                  {stats.automationBreakdown.cashback > 0 && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Gift className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">Cashback</span>
                      </div>
                      <span className="text-sm font-medium text-foreground">{stats.automationBreakdown.cashback}</span>
                    </div>
                  )}
                  <Link to="/automations">
                    <Button variant="ghost" size="sm" className="w-full mt-2 text-muted-foreground hover:text-foreground">
                      Ver automações
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {hasBulkCampaigns && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-primary" />
                      Disparos em Massa (mês)
                    </CardTitle>
                    <Link to="/disparos">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                        Ver todos
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.bulkCampaignStats.totalCampaigns}</p>
                      <p className="text-xs text-muted-foreground">Campanhas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{formatNumber(stats.bulkCampaignStats.totalSent)}</p>
                      <p className="text-xs text-muted-foreground">Enviadas</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{stats.bulkCampaignStats.successRate}%</p>
                      <p className="text-xs text-muted-foreground">Taxa Entrega</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Three Column Layout */}
          <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2">
            <section className="animate-slide-up" style={{ animationDelay: "350ms" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Uso de Tokens</h3>
              </div>
              <div className="space-y-4">
                <TokenUsageCard limit={4} />
                <PlansCard />
              </div>
            </section>

            <section className="animate-slide-up" style={{ animationDelay: "400ms" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">Integrações</h3>
                <Link to="/integrations">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                    Gerenciar
                  </Button>
                </Link>
              </div>
              <div className="space-y-3">
                {integrationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : integrations.length > 0 ? (
                  integrations.slice(0, 4).map((integration) => (
                    <IntegrationCard 
                      key={integration.id} 
                      name={integration.name}
                      type={integration.type}
                      description={integration.description}
                      logo={integration.logo}
                      status={integration.status}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <PlugZap className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhuma integração configurada</p>
                    <Link to="/integrations">
                      <Button variant="outline" size="sm" className="mt-3">
                        Configurar integrações
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        {/* Attendance Dashboard Tab */}
        <TabsContent value="attendance" className="mt-4">
          <AttendanceDashboard />
        </TabsContent>

        {/* Sales Analytics Tab */}
        <TabsContent value="sales" className="mt-4">
          <SalesAnalyticsDashboard />
        </TabsContent>

        {/* Campaigns Analytics Tab */}
        <TabsContent value="campaigns" className="mt-4">
          <CampaignAnalyticsDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
