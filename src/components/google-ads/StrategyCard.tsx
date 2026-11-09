import { useEffect, useState } from "react";
import { Compass, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PlanTable } from "@/components/google-ads/PlanTable";
import type { GoogleAdsAccount, GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import type { RecommendationRow } from "@/hooks/useGoogleAdsInsights";
import type { useGoogleAdsPlanActions } from "@/hooks/useGoogleAdsPlan";
import { brl, readMonthlyCapMicros } from "@/lib/googleAds";
import { fmtRoas, type StrategyReport } from "@/lib/googleAdsStrategy";

interface Props {
  account: GoogleAdsAccount;
  campaigns: GoogleAdsCampaign[];
  report: StrategyReport | null;
  plan: RecommendationRow[];
  canEdit: boolean;
  actions: ReturnType<typeof useGoogleAdsPlanActions>;
}

const asText = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

/** O consultor de estratégia: lê todo o histórico, diz o que reativar/manter desligado e propõe quanto gastar em cada campanha. */
export function StrategyCard({ account, campaigns, report, plan, canEdit, actions }: Props) {
  const { runStrategy, applyPlan, setMode, setMinRoas } = actions;
  const approvalOn = account.mode === "approval";
  const savedRoas = report && !report.min_roas_is_provisional ? report.min_roas : null;
  const [roasText, setRoasText] = useState(asText(savedRoas));
  useEffect(() => setRoasText(asText(savedRoas)), [savedRoas]);
  const roasNum = roasText.trim() === "" ? null : Number(roasText.replace(",", "."));
  const roasInvalid = roasNum !== null && !(roasNum >= 0.5 && roasNum <= 50);

  const capMicros = readMonthlyCapMicros(account.guardrails);
  const blocked = !canEdit ? "Somente administradores aplicam mudanças."
    : !approvalOn ? "Ative o modo “com aprovação” acima para poder aplicar."
    : !capMicros ? "Defina o teto mensal de gastos para poder aplicar." : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg"><Compass className="h-5 w-5" /> Estratégia recomendada</CardTitle>
          <p className="text-sm text-muted-foreground">
            Lê todo o histórico da conta e propõe o que religar, o que manter desligado e quanto gastar em cada campanha dentro do seu teto.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!canEdit || runStrategy.isPending} onClick={() => runStrategy.mutate()}>
          {runStrategy.isPending ? "Analisando…" : report ? "Refazer análise" : "Gerar análise"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div className="text-sm">
            <div className="font-medium">Modo da conta: {approvalOn ? "com aprovação" : "somente leitura"}</div>
            <div className="text-muted-foreground">
              {approvalOn ? "O sistema só altera o Google Ads quando você clica em Aplicar." : "Nada é alterado no Google Ads. Ative para poder aplicar o plano daqui."}
            </div>
          </div>
          <Switch checked={approvalOn} disabled={!canEdit || setMode.isPending}
            onCheckedChange={(on) => setMode.mutate(on ? "approval" : "read_only")} aria-label="Modo com aprovação" />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="min-roas">ROAS mínimo (retorno para não ter prejuízo)</Label>
            <Input id="min-roas" inputMode="decimal" placeholder="ex.: 2,5" className="w-40" value={roasText}
              disabled={!canEdit} onChange={(e) => setRoasText(e.target.value)} aria-invalid={roasInvalid} />
          </div>
          <Button variant="secondary" disabled={!canEdit || roasInvalid || setMinRoas.isPending || roasNum === savedRoas}
            onClick={() => setMinRoas.mutate(roasNum)}>Salvar e refazer plano</Button>
          <p className="max-w-md text-xs text-muted-foreground">
            É 1 ÷ margem de lucro: com 40% de margem, o mínimo é 2,5x (cada R$ 1 em anúncio precisa trazer R$ 2,50 em vendas só para empatar).
            {report?.min_roas_is_provisional && " Hoje o plano usa 3,0x provisório."}
          </p>
        </div>

        {!report ? (
          <p className="text-sm text-muted-foreground">Ainda não há análise. Clique em “Gerar análise”.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              {report.years.filter((y) => y.cost > 0).map((y) => (
                <span key={y.year} className="rounded-md bg-muted px-2 py-1">
                  <strong>{y.year}</strong> · gasto {brl(y.cost * 1e6)} · ROAS {fmtRoas(y.roas)}
                </span>
              ))}
            </div>
            {report.warnings.map((w) => (
              <Alert key={w}><ShieldAlert className="h-4 w-4" /><AlertDescription>{w}</AlertDescription></Alert>
            ))}
            <div className="text-sm text-muted-foreground">
              Verba diária disponível: <strong className="text-foreground">{report.daily_target == null ? "—" : brl(report.daily_target * 1e6)}</strong>
              {report.monthly_cap != null && ` (teto de ${brl(report.monthly_cap * 1e6)} por mês)`}.
            </div>
            <PlanTable plan={plan} campaigns={campaigns} canApply={!blocked} blockedReason={blocked}
              applying={applyPlan.isPending} onApply={(ids) => applyPlan.mutate(ids)} />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Premissas desta análise</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5">{report.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
