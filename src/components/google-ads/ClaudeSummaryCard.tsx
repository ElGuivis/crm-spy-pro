import { useMemo, useState } from "react";
import { ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignSpend, GoogleAdsAccount, GoogleAdsAccountBudget, GoogleAdsCampaign, GoogleAdsRecommendation } from "@/hooks/useGoogleAds";
import type { ConversionActionRow } from "@/hooks/useGoogleAdsInsights";
import { buildClaudeSummary, DEFAULT_CLAUDE_NOTES } from "@/lib/googleAdsSummary";

const NOTES_KEY = "google-ads-claude-notes";

function loadNotes(): string {
  try { return localStorage.getItem(NOTES_KEY) ?? DEFAULT_CLAUDE_NOTES; } catch { return DEFAULT_CLAUDE_NOTES; }
}

interface Props {
  account: GoogleAdsAccount;
  budgets: GoogleAdsAccountBudget[];
  campaigns: GoogleAdsCampaign[];
  spend: Map<number, CampaignSpend>;
  alerts: GoogleAdsRecommendation[];
  conversionActions: ConversionActionRow[];
}

/** Gera um resumo em texto da conta para colar numa conversa com o Claude (claude.ai). Só leitura: não envia nada a ninguém. */
export function ClaudeSummaryCard({ account, budgets, campaigns, spend, alerts, conversionActions }: Props) {
  const [notes, setNotes] = useState(loadNotes);
  const text = useMemo(
    () => buildClaudeSummary({ account, budgets, campaigns, spend, alerts, conversionActions, notes }),
    [account, budgets, campaigns, spend, alerts, conversionActions, notes],
  );

  const onNotes = (v: string) => {
    setNotes(v);
    try { localStorage.setItem(NOTES_KEY, v); } catch { /* sem armazenamento: as notas valem só nesta tela */ }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Resumo copiado. Cole na conversa com o Claude.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto abaixo e copie manualmente.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">Conversar com o Claude</CardTitle>
          <p className="text-sm text-muted-foreground">
            Copie o resumo da conta e cole numa conversa no claude.ai. O texto não inclui dados de clientes e nada é enviado daqui.
          </p>
        </div>
        <Button size="sm" onClick={copy}>
          <ClipboardCopy className="mr-2 h-4 w-4" />
          Copiar resumo
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="claude-notes" className="text-sm font-medium">Suas notas (entram no resumo)</label>
          <Textarea id="claude-notes" value={notes} onChange={(e) => onNotes(e.target.value)} rows={5} />
          <p className="text-xs text-muted-foreground">Fica salvo só neste navegador. Edite à vontade: ofertas, datas, decisões.</p>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Ver o texto que será copiado</summary>
          <Textarea readOnly value={text} rows={14} className="mt-2 font-mono text-xs" />
        </details>
      </CardContent>
    </Card>
  );
}
