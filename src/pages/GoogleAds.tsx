import { Target } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { AccountStatusCard } from "@/components/google-ads/AccountStatusCard";
import { AlertsCard } from "@/components/google-ads/AlertsCard";
import { BudgetCapCard } from "@/components/google-ads/BudgetCapCard";
import { CampaignsTable } from "@/components/google-ads/CampaignsTable";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useGoogleAdsAccount, useGoogleAdsActions, useGoogleAdsData } from "@/hooks/useGoogleAds";

/** Sistema → Google Ads: saldo, alertas do diagnóstico, teto mensal de gastos e campanhas (somente leitura no Google Ads). */
const GoogleAds = () => {
  const { isAdmin, isOwner } = useAuth();
  const { data: account, isLoading: loadingAccount, error: accountError } = useGoogleAdsAccount();
  const { data, isLoading: loadingData, error: dataError } = useGoogleAdsData(account?.id);
  const { syncNow, saveMonthlyCap } = useGoogleAdsActions(account?.id);
  const error = accountError ?? dataError;

  return (
    <PageTransition>
      <div className="space-y-6 p-6">
        <PageHeader
          title="Google Ads"
          subtitle="Saldo, alertas e teto de gastos. O sistema só lê a conta: nada é alterado no Google Ads."
          icon={Target}
        />

        {error && <p className="text-sm text-destructive">Não foi possível carregar os dados: {(error as Error).message}</p>}
        {(loadingAccount || (!!account && loadingData)) && <Skeleton className="h-64 w-full" />}

        {!loadingAccount && !error && !account && (
          <p className="text-sm text-muted-foreground">Nenhuma conta do Google Ads cadastrada para esta loja.</p>
        )}

        {account && data && (
          <>
            <AccountStatusCard account={account} budgets={data.budgets} syncing={syncNow.isPending} onSync={() => syncNow.mutate()} />
            <AlertsCard alerts={data.alerts} />
            <BudgetCapCard
              account={account} campaigns={data.campaigns} canEdit={isAdmin || isOwner}
              saving={saveMonthlyCap.isPending} onSave={(cap) => saveMonthlyCap.mutate(cap)}
            />
            <CampaignsTable campaigns={data.campaigns} spend={data.spend} />
          </>
        )}
      </div>
    </PageTransition>
  );
};

export default GoogleAds;
