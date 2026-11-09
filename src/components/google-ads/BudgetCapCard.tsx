import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GoogleAdsAccount, GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import { DAYS_PER_MONTH, brl, parseMoneyInput, readMonthlyCapMicros } from "@/lib/googleAds";

const MAX_CAP_BRL = 10_000_000;
const asInput = (micros: number | null) =>
  micros == null ? "" : (micros / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  account: GoogleAdsAccount;
  campaigns: GoogleAdsCampaign[];
  canEdit: boolean;
  saving: boolean;
  onSave: (capBrl: number | null) => void;
}

/** Teto de gastos por mês: o diagnóstico alerta quando os orçamentos diários das campanhas ativas o ultrapassam. */
export function BudgetCapCard({ account, campaigns, canEdit, saving, onSave }: Props) {
  const capMicros = readMonthlyCapMicros(account.guardrails);
  const [text, setText] = useState(asInput(capMicros));
  useEffect(() => setText(asInput(capMicros)), [capMicros]);

  const parsed = parseMoneyInput(text);
  const invalid = Number.isNaN(parsed) || (parsed !== null && (parsed <= 0 || parsed > MAX_CAP_BRL));
  const unchanged = parsed === (capMicros == null ? null : capMicros / 1e6);

  const dailySum = campaigns.filter((c) => c.status === "ENABLED").reduce((s, c) => s + (c.daily_budget_micros ?? 0), 0);
  const projected = dailySum * DAYS_PER_MONTH;
  const over = capMicros != null && projected > capMicros;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Wallet className="h-5 w-5" /> Teto de gastos por mês</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="monthly-cap">Quanto você quer gastar por mês em anúncios (R$)</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="monthly-cap" inputMode="decimal" placeholder="Ex.: 1.000,00" className="max-w-[220px]"
              value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit || saving}
              aria-invalid={invalid}
            />
            <Button onClick={() => onSave(parsed)} disabled={!canEdit || saving || invalid || unchanged}>
              {saving ? "Salvando…" : "Salvar teto"}
            </Button>
          </div>
          {invalid && <p className="text-xs text-destructive">Digite um valor entre R$ 0,01 e R$ 10.000.000,00 (ex.: 1.000,00), ou deixe vazio para remover o teto.</p>}
          {!canEdit && <p className="text-xs text-muted-foreground">Somente administradores podem alterar o teto.</p>}
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div><p className="text-muted-foreground">Teto atual</p><p className="font-semibold">{capMicros ? brl(capMicros) : "Sem teto"}</p></div>
          <div><p className="text-muted-foreground">Equivale a por dia</p><p className="font-semibold">{capMicros ? brl(capMicros / DAYS_PER_MONTH) : "—"}</p></div>
          <div><p className="text-muted-foreground">Orçamentos diários ativos</p><p className="font-semibold">{brl(dailySum)}/dia (~{brl(projected)}/mês)</p></div>
        </div>

        {over && (
          <Alert variant="destructive">
            <AlertDescription>
              Os orçamentos diários das campanhas ativas somam cerca de {brl(projected)} por mês, acima do teto de {brl(capMicros)}.
              O Google pode gastar até o dobro do orçamento diário em um dia, então a verba pode acabar em poucos dias.
              Reduza os orçamentos diários no Google Ads ou pause campanhas.
            </AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          O teto é um limite de segurança do sistema: ele gera alertas e, no futuro, impede que os agentes proponham gastar além dele.
          Ele não altera nada na sua conta do Google Ads.
        </p>
      </CardContent>
    </Card>
  );
}
