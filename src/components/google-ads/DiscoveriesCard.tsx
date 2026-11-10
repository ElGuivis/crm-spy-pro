import { useEffect, useState } from "react";
import { Lightbulb, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ImplementButton } from "@/components/google-ads/ImplementButton";
import type { GoogleAdsAccount } from "@/hooks/useGoogleAds";
import type { Implementer } from "@/hooks/useGoogleAdsImplement";
import { MANUAL_REASON, recsForFinding } from "@/lib/googleAdsImplement";
import type { useGoogleAdsDiscoveryActions } from "@/hooks/useGoogleAdsDiscoveries";
import { FINDING_LABEL, FINDING_VARIANT, money, pct, type InsightsReport } from "@/lib/googleAdsInsights";
import { fmtRoas } from "@/lib/googleAdsStrategy";

interface Props {
  account: GoogleAdsAccount;
  report: InsightsReport | null;
  canEdit: boolean;
  actions: ReturnType<typeof useGoogleAdsDiscoveryActions>;
  impl: Implementer;
}

const parseTerms = (text: string) => [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

/** O que os dados detalhados do Google revelam (calculado por regras, sem IA): achados, marca x demais buscas e o que fazer. */
export function DiscoveriesCard({ account, report, canEdit, actions, impl }: Props) {
  const { syncAll, recalc, saveBrandTerms } = actions;
  const saved = report?.brand_terms ?? [];
  const [terms, setTerms] = useState(saved.join(", "));
  useEffect(() => setTerms(saved.join(", ")), [saved.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const parsed = parseTerms(terms);
  const invalid = parsed.some((t) => t.length < 2 || t.length > 40) || parsed.length > 10;
  const unchanged = parsed.join(",") === saved.join(",");
  const b = report?.brand;
  const lastSync = (account as { deep_synced_at?: string | null }).deep_synced_at;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg"><Lightbulb className="h-5 w-5" /> Descobertas dos dados do Google</CardTitle>
          <p className="text-sm text-muted-foreground">
            Termos de pesquisa, palavras-chave, anúncios, dispositivos, horários, regiões, produtos e posição no leilão, de toda a história da conta.
            {lastSync && ` Última coleta: ${new Date(lastSync).toLocaleString("pt-BR")}.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!canEdit || recalc.isPending || syncAll.isPending} onClick={() => recalc.mutate()}>Recalcular</Button>
          <Button size="sm" disabled={!canEdit || syncAll.isPending} onClick={() => syncAll.mutate()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncAll.isPending ? "animate-spin" : ""}`} />
            {syncAll.isPending ? "Buscando no Google…" : "Buscar todos os dados"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!report ? (
          <p className="text-sm text-muted-foreground">Ainda não há descobertas. Clique em “Buscar todos os dados”.</p>
        ) : (
          <>
            <div className="space-y-2">
              {report.findings.length === 0 && <p className="text-sm text-muted-foreground">Nenhum achado relevante com os limites atuais.</p>}
              {report.findings.map((f) => (
                <div key={f.id} className="rounded-md border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant={FINDING_VARIANT[f.severity]}>{FINDING_LABEL[f.severity]}</Badge>
                    <span className="font-medium">{f.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{f.detail}</p>
                  <div className="mt-2"><ImplementButton impl={impl} recs={recsForFinding(f.id, impl.suggestions)} manual={MANUAL_REASON[f.id]} /></div>
                </div>
              ))}
            </div>

            {b && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-sm font-medium">Buscas com o nome da marca × demais buscas</div>
                <Progress value={Math.round((b.share_of_revenue ?? 0) * 100)} />
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <div>Marca: gasto <strong>{money(b.cost)}</strong> · receita <strong>{money(b.revenue)}</strong> · ROAS <strong>{fmtRoas(b.roas)}</strong> ({pct(b.share_of_revenue)} da receita)</div>
                  <div>Sem a marca: gasto <strong>{money(b.non_brand_cost)}</strong> · receita <strong>{money(b.non_brand_revenue)}</strong> · ROAS <strong>{fmtRoas(b.non_brand_roas)}</strong></div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="brand-terms">Termos da marca (separe por vírgula)</Label>
            <Input id="brand-terms" className="w-80" placeholder="ex.: chronic, cronic" value={terms} disabled={!canEdit} onChange={(e) => setTerms(e.target.value)} aria-invalid={invalid} />
          </div>
          <Button variant="secondary" disabled={!canEdit || invalid || unchanged || saveBrandTerms.isPending} onClick={() => saveBrandTerms.mutate(parsed)}>
            Salvar e recalcular
          </Button>
          <p className="max-w-md text-xs text-muted-foreground">
            Inclua grafias erradas comuns do nome. Uma busca que contém qualquer um desses termos conta como “marca”.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
