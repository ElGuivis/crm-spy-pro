import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuickActions } from "@/components/google-ads/QuickActions";
import type { CampaignSpend, GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import type { Implementer } from "@/hooks/useGoogleAdsImplement";
import type { LifetimeRow } from "@/hooks/useGoogleAdsInsights";
import { CAMPAIGN_STATUS_LABEL, CHANNEL_LABEL, SERVING_STATUS_LABEL, brl } from "@/lib/googleAds";
import { VERDICT_LABEL, VERDICT_VARIANT, fmtRoas, type CampaignAnalysis } from "@/lib/googleAdsStrategy";

const STATUS_ORDER: Record<string, number> = { ENABLED: 0, PAUSED: 1, REMOVED: 2 };
const dt = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");

interface Props {
  campaigns: GoogleAdsCampaign[];
  spend: Map<number, CampaignSpend>;
  lifetime: Map<number, LifetimeRow>;
  analysis: CampaignAnalysis[];
  impl: Implementer;
}

/** Todas as campanhas com o histórico da vida inteira, o último dia que gastaram e o veredito do consultor. */
export function CampaignsTable({ campaigns, spend, lifetime, analysis, impl }: Props) {
  const [showRemoved, setShowRemoved] = useState(false);
  const [onlySpent, setOnlySpent] = useState(true);
  const byId = new Map(analysis.map((a) => [a.campaign_id, a]));
  const spentLife = (c: GoogleAdsCampaign) => Number(lifetime.get(c.campaign_id)?.cost_micros ?? 0);
  const removedCount = campaigns.filter((c) => c.status === "REMOVED").length;
  const rows = campaigns
    .filter((c) => (showRemoved || c.status !== "REMOVED") && (!onlySpent || spentLife(c) > 0 || c.status === "ENABLED"))
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3) || spentLife(b) - spentLife(a));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-lg">Campanhas <span className="text-sm font-normal text-muted-foreground">(vida inteira e últimos 30 dias)</span></CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOnlySpent((v) => !v)}>{onlySpent ? "Mostrar sem gasto" : "Ocultar sem gasto"}</Button>
          {removedCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowRemoved((v) => !v)}>
              {showRemoved ? "Ocultar removidas" : `Mostrar removidas (${removedCount})`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campanha</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Orçamento/dia</TableHead>
              <TableHead className="text-right">Gasto total</TableHead><TableHead className="text-right">ROAS vida</TableHead>
              <TableHead className="text-right">ROAS recente</TableHead><TableHead>Último gasto</TableHead>
              <TableHead className="text-right">Gasto 30d</TableHead><TableHead>Veredito</TableHead><TableHead>Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const l = lifetime.get(c.campaign_id);
              const a = byId.get(c.campaign_id);
              const s = spend.get(c.campaign_id);
              const cost = Number(l?.cost_micros ?? 0);
              const lifeRoas = cost > 0 ? Number(l?.conversions_value ?? 0) / (cost / 1e6) : null;
              const suspended = c.status === "ENABLED" && c.serving_status && c.serving_status !== "SERVING";
              return (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[260px]">
                    <div className="truncate font-medium" title={c.name}>{c.name}</div>
                    <div className="text-xs text-muted-foreground">{CHANNEL_LABEL[c.channel_type ?? ""] ?? c.channel_type ?? "—"}</div>
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    <Badge variant={c.status === "ENABLED" ? "secondary" : "outline"}>{CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}</Badge>
                    {suspended && <Badge variant="destructive">{SERVING_STATUS_LABEL[c.serving_status ?? ""] ?? c.serving_status}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{brl(c.daily_budget_micros)}</TableCell>
                  <TableCell className="text-right">{cost > 0 ? brl(cost) : "—"}</TableCell>
                  <TableCell className="text-right">{fmtRoas(lifeRoas)}</TableCell>
                  <TableCell className="text-right" title={a?.recent.months.join(", ")}>{fmtRoas(a?.recent.roas)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{dt(l?.last_spend_date as string | null)}</TableCell>
                  <TableCell className="text-right">{s ? brl(s.cost_micros) : "—"}</TableCell>
                  <TableCell className="max-w-[200px]">
                    {a ? <Badge variant={VERDICT_VARIANT[a.verdict]} title={a.reason}>{VERDICT_LABEL[a.verdict]}</Badge> : "—"}
                  </TableCell>
                  <TableCell>
                    <QuickActions campaign={c} impl={impl}
                      suggestedBudgetBrl={((impl.suggestions.find((x) => Number(x.payload.campaign_id) === c.campaign_id && (x.kind === "enable_campaign" || x.kind === "adjust_budget"))?.payload.daily_budget_micros as number | undefined) ?? 0) / 1e6 || null} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">ROAS recente = últimos 3 meses em que a campanha teve gasto. Passe o mouse no veredito para ver o motivo.</p>
      </CardContent>
    </Card>
  );
}
