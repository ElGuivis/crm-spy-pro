import { Target } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { AiAdvisorCard } from "@/components/google-ads/AiAdvisorCard";
import { AccountStatusCard } from "@/components/google-ads/AccountStatusCard";
import { ActivityCard } from "@/components/google-ads/ActivityCard";
import { AlertsCard } from "@/components/google-ads/AlertsCard";
import { BudgetCapCard } from "@/components/google-ads/BudgetCapCard";
import { CampaignsTable } from "@/components/google-ads/CampaignsTable";
import { ConversionsCard } from "@/components/google-ads/ConversionsCard";
import { HistoryCard } from "@/components/google-ads/HistoryCard";
import { StrategyCard } from "@/components/google-ads/StrategyCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAdsAccount, useGoogleAdsActions, useGoogleAdsData } from "@/hooks/useGoogleAds";
import { useGoogleAdsActivity, useGoogleAdsHistory, useGoogleAdsStrategy } from "@/hooks/useGoogleAdsInsights";
import { useGoogleAdsPlanActions } from "@/hooks/useGoogleAdsPlan";

/** Sistema → Google Ads: saldo, alertas, estratégia recomendada (com histórico completo), teto de gastos e campanhas. */
const GoogleAds = () => {
  const { isAdmin, isOwner } = useAuth();
  const canEdit = isAdmin || isOwner;
  const { data: account, isLoading: loadingAccount, error: accountError } = useGoogleAdsAccount();
  const accountId = account?.id;
  const { data, isLoading: loadingData, error: dataError } = useGoogleAdsData(accountId);
  const history = useGoogleAdsHistory(accountId);
  const strategy = useGoogleAdsStrategy(accountId);
  const activity = useGoogleAdsActivity(accountId);
  const { syncNow, saveMonthlyCap } = useGoogleAdsActions(accountId);
  const planActions = useGoogleAdsPlanActions(accountId);
  const error = accountError ?? dataError ?? history.error ?? strategy.error;

  return (
    <PageTransition>
      <div className="space-y-6 p-6">
        <PageHeader
          title="Google Ads"
          subtitle="Histórico completo, estratégia recomendada e controle de gastos. Mudanças no Google Ads só acontecem quando você aplica."
          icon={Target}
        />

        {error && <p className="text-sm text-destructive">Não foi possível carregar os dados: {(error as Error).message}</p>}
        {(loadingAccount || (!!account && loadingData)) && <Skeleton className="h-64 w-full" />}

        {!loadingAccount && !error && !account && (
          <p className="text-sm text-muted-foreground">Nenhuma conta do Google Ads cadastrada para esta loja.</p>
        )}

        {account && data && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="history">Histórico e campanhas</TabsTrigger>
              <TabsTrigger value="conversions">Conversões</TabsTrigger>
              <TabsTrigger value="activity">Atividade</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <AccountStatusCard account={account} budgets={data.budgets} syncing={syncNow.isPending} onSync={() => syncNow.mutate()} />
              <AlertsCard alerts={data.alerts} />
              <StrategyCard
                account={account} campaigns={data.campaigns} report={strategy.data?.report ?? null}
                plan={strategy.data?.plan ?? []} canEdit={canEdit} actions={planActions}
              />
              <AiAdvisorCard account={account} canEdit={canEdit} />
              <BudgetCapCard
                account={account} campaigns={data.campaigns} canEdit={canEdit}
                saving={saveMonthlyCap.isPending} onSave={(cap) => saveMonthlyCap.mutate(cap)}
              />
            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              {history.isLoading ? <Skeleton className="h-72 w-full" /> : (
                <>
                  <HistoryCard monthly={history.data?.monthly ?? []} />
                  <CampaignsTable
                    campaigns={data.campaigns} spend={data.spend} lifetime={history.data?.lifetime ?? new Map()}
                    analysis={strategy.data?.report?.campaigns ?? []}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="conversions">
              <ConversionsCard actions={history.data?.actions ?? []} lifetime={history.data?.conversions ?? []} />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityCard
                rows={activity.data ?? []} campaigns={data.campaigns} canEdit={canEdit}
                reverting={planActions.revert.isPending} onRevert={(id) => planActions.revert.mutate(id)}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageTransition>
  );
};

export default GoogleAds;
