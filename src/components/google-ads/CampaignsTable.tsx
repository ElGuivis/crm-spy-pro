import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampaignSpend, GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import { CAMPAIGN_STATUS_LABEL, CHANNEL_LABEL, SERVING_STATUS_LABEL, brl } from "@/lib/googleAds";

const STATUS_ORDER: Record<string, number> = { ENABLED: 0, PAUSED: 1, REMOVED: 2 };

interface Props {
  campaigns: GoogleAdsCampaign[];
  spend: Map<number, CampaignSpend>;
}

export function CampaignsTable({ campaigns, spend }: Props) {
  const [showRemoved, setShowRemoved] = useState(false);
  const removedCount = campaigns.filter((c) => c.status === "REMOVED").length;
  const rows = campaigns
    .filter((c) => showRemoved || c.status !== "REMOVED")
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
      || (spend.get(b.campaign_id)?.cost_micros ?? 0) - (spend.get(a.campaign_id)?.cost_micros ?? 0));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-lg">Campanhas <span className="text-sm font-normal text-muted-foreground">(gasto dos últimos 30 dias)</span></CardTitle>
        {removedCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowRemoved((v) => !v)}>
            {showRemoved ? "Ocultar removidas" : `Mostrar removidas (${removedCount})`}
          </Button>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campanha</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead>
              <TableHead>Entrega</TableHead><TableHead className="text-right">Orçamento/dia</TableHead>
              <TableHead className="text-right">Gasto 30d</TableHead><TableHead className="text-right">Cliques</TableHead>
              <TableHead className="text-right">Conversões</TableHead><TableHead className="text-right">ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const s = spend.get(c.campaign_id);
              const roas = s && s.cost_micros > 0 ? s.conversions_value / (s.cost_micros / 1e6) : null;
              const suspended = c.status === "ENABLED" && c.serving_status && c.serving_status !== "SERVING";
              return (
                <TableRow key={c.id}>
                  <TableCell className="max-w-[260px] truncate font-medium" title={c.name}>{c.name}</TableCell>
                  <TableCell>{CHANNEL_LABEL[c.channel_type ?? ""] ?? c.channel_type ?? "—"}</TableCell>
                  <TableCell><Badge variant={c.status === "ENABLED" ? "secondary" : "outline"}>{CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}</Badge></TableCell>
                  <TableCell>
                    {c.status === "ENABLED"
                      ? <Badge variant={suspended ? "destructive" : "outline"}>{SERVING_STATUS_LABEL[c.serving_status ?? ""] ?? c.serving_status ?? "—"}</Badge>
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">{brl(c.daily_budget_micros)}</TableCell>
                  <TableCell className="text-right">{s ? brl(s.cost_micros) : "—"}</TableCell>
                  <TableCell className="text-right">{s ? s.clicks.toLocaleString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-right">{s ? s.conversions.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</TableCell>
                  <TableCell className="text-right">{roas == null ? "—" : `${roas.toFixed(2)}x`}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
