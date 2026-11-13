import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { GoogleAdsAccount, GoogleAdsAccountBudget } from "@/hooks/useGoogleAds";
import { activeBudget, brl } from "@/lib/googleAds";

const MODE_LABEL: Record<string, string> = {
  read_only: "Somente leitura",
  approval: "Com aprovação",
  auto: "Automático",
};

const fmtId = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

interface Props {
  account: GoogleAdsAccount;
  budgets: GoogleAdsAccountBudget[];
  syncing: boolean;
  onSync: () => void;
}

export function AccountStatusCard({ account, budgets, syncing, onSync }: Props) {
  const budget = activeBudget(budgets);
  const limit = budget ? (budget.adjusted_spending_limit_micros ?? budget.approved_spending_limit_micros ?? 0) : 0;
  const served = budget?.amount_served_micros ?? 0;
  const remaining = Math.max(limit - served, 0);
  const usedPct = limit > 0 ? Math.min((served / limit) * 100, 100) : 0;
  const exhausted = !!budget && remaining <= 1_000_000;
  const accountOk = account.customer_status === "ENABLED";
  const billingOk = account.billing_status === "APPROVED";

  return (
    <Card>
      <CardHeader className="flex flex-col items-start justify-between gap-3 space-y-0 sm:flex-row sm:gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">{account.descriptive_name ?? "Conta Google Ads"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            ID {fmtId(account.customer_id)} · {account.currency_code ?? "—"} · {account.time_zone ?? "—"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Atualizando…" : "Atualizar agora"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={accountOk ? "secondary" : "destructive"}>Conta: {accountOk ? "ativa" : (account.customer_status ?? "desconhecida")}</Badge>
          <Badge variant={billingOk ? "secondary" : "destructive"}>Faturamento: {billingOk ? "aprovado" : (account.billing_status ?? "desconhecido")}</Badge>
          <Badge variant="outline">Modo: {MODE_LABEL[account.mode] ?? account.mode}</Badge>
        </div>

        {budget ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm text-muted-foreground">Saldo restante (limite de gastos da conta)</span>
              <span className={`text-2xl font-bold ${exhausted ? "text-destructive" : ""}`}>{brl(remaining)}</span>
            </div>
            <Progress value={usedPct} className={exhausted ? "[&>div]:bg-destructive" : ""} />
            <p className="text-xs text-muted-foreground">
              Gasto {brl(served)} de {brl(limit)}. {exhausted && "O saldo acabou: os anúncios não são entregues até repor o saldo no Google Ads."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta conta não tem limite de gastos por saldo (ou ele ainda não foi sincronizado), então o saldo não é calculado aqui.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Última atualização: {account.last_synced_at ? new Date(account.last_synced_at).toLocaleString("pt-BR") : "nunca"}
          {account.last_error && <span className="text-destructive"> · Último erro: {account.last_error}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
