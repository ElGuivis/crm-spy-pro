import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import type { GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import type { Implementer } from "@/hooks/useGoogleAdsImplement";
import { brl, parseMoneyInput } from "@/lib/googleAds";

type Mode = "pause" | "enable" | "set_budget";

interface Props { campaign: GoogleAdsCampaign; impl: Implementer; suggestedBudgetBrl?: number | null }

/** Ações diretas numa campanha (pausar, ligar com orçamento, ajustar orçamento). Mesmas travas do servidor: teto, ordem, conferência e desfazer. */
export function QuickActions({ campaign, impl, suggestedBudgetBrl }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const currentBrl = campaign.daily_budget_micros ? campaign.daily_budget_micros / 1e6 : null;
  const initial = suggestedBudgetBrl ?? currentBrl ?? 20;
  const [text, setText] = useState("");
  const open = (m: Mode) => { setText(String(initial).replace(".", ",")); setMode(m); };
  const parsed = parseMoneyInput(text);
  const invalid = mode !== "pause" && (parsed === null || Number.isNaN(parsed) || parsed < 1 || parsed > 1000);

  if (campaign.status === "REMOVED") return <span className="text-xs text-muted-foreground">—</span>;
  const busy = impl.quick.isPending;
  const disabled = !impl.canApply || busy;

  const confirmText = mode === "pause" ? `Pausar "${campaign.name}"? Ela para de gastar na hora.`
    : mode === "enable" ? `Ligar "${campaign.name}" com orçamento diário de R$ ${text || "—"}? Ela começa a gastar se tiver anúncios aprovados e palavras-chave ativas.`
    : `Mudar o orçamento diário de "${campaign.name}" (hoje ${brl(campaign.daily_budget_micros)}) para R$ ${text || "—"}?`;

  return (
    <div className="flex flex-wrap gap-1" title={impl.blockedReason ?? undefined}>
      {campaign.status === "ENABLED" ? (
        <>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => open("pause")}>Pausar</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => open("set_budget")}>Orçamento</Button>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => open("enable")}>
          Ligar{suggestedBudgetBrl ? ` (${brl(suggestedBudgetBrl * 1e6)})` : "…"}
        </Button>
      )}
      <AlertDialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Implementar no Google Ads?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{confirmText}</p>
                {mode !== "pause" && (
                  <div className="space-y-1">
                    <Input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="max-w-[160px]" aria-invalid={invalid} />
                    {invalid && <p className="text-xs text-destructive">Informe de R$ 1 a R$ 1.000 por dia (ex.: 25,00).</p>}
                  </div>
                )}
                <p className="text-xs">O servidor recusa se a soma dos orçamentos passar do teto mensal. Fica na aba Atividade, com desfazer.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={invalid} onClick={() => mode && impl.quick.mutate({ campaignId: campaign.campaign_id, op: mode, dailyBudgetBrl: mode === "pause" ? undefined : (parsed as number) })}>
              Implementar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
