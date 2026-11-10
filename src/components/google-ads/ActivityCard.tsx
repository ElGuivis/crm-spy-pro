import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import type { AuditRow } from "@/hooks/useGoogleAdsInsights";
import { brl } from "@/lib/googleAds";

type State = { status?: string; daily_budget_micros?: number | null; confirmed?: boolean; mode?: string; monthly_budget_cap_micros?: number; min_roas?: number };
const ACTION_LABEL: Record<string, string> = { apply: "Aplicado no Google Ads", revert: "Desfeito", guardrails_change: "Regra alterada", mode_change: "Modo alterado" };

const describe = (s: State | null) => (s ? `${s.status === "ENABLED" ? "Ligada" : s.status === "PAUSED" ? "Pausada" : (s.status ?? "—")} · ${brl(s.daily_budget_micros)}/dia` : "—");

function summary(r: AuditRow, campaigns: GoogleAdsCampaign[]): string {
  const b = r.before_state as State | null;
  const a = r.after_state as State | null;
  const build = /^(negatives|rebuild):(\d+)$/.exec(r.entity ?? "");
  if (build && (r.action === "apply" || r.action === "revert")) {
    const camp = campaigns.find((c) => c.campaign_id === Number(build[2]))?.name ?? build[2];
    const st = (r.after_state ?? {}) as { terms?: string[]; keyword_texts?: string[]; enabled_ads?: number[]; new_ad?: string | null; reverted?: boolean };
    if (r.action === "revert" || st.reverted) return `${build[1] === "negatives" ? "Negativas" : "Reconstrução"} desfeita em ${camp}`;
    return build[1] === "negatives"
      ? `Negativas (exatas) em ${camp}: ${(st.terms ?? []).slice(0, 6).join(", ")}${(st.terms?.length ?? 0) > 6 ? "…" : ""}`
      : `Reconstrução de ${camp}: ${st.keyword_texts?.length ?? 0} palavras-chave, ${st.enabled_ads?.length ?? 0} anúncio(s) religado(s)${st.new_ad ? ", 1 anúncio novo" : ""}`;
  }
  if (r.action === "apply" || r.action === "revert") {
    const id = Number(String(r.entity ?? "").replace("campaign:", ""));
    return `${campaigns.find((c) => c.campaign_id === id)?.name ?? r.entity}: ${describe(b)} → ${describe(a)}`;
  }
  if (r.entity === "mode") return `${b?.mode ?? "—"} → ${a?.mode ?? "—"}`;
  if (r.entity === "min_roas") return `ROAS mínimo ${b?.min_roas ?? "—"} → ${a?.min_roas ?? "—"}`;
  return `Teto mensal ${b?.monthly_budget_cap_micros ? brl(b.monthly_budget_cap_micros) : "—"} → ${a?.monthly_budget_cap_micros ? brl(a.monthly_budget_cap_micros) : "—"}`;
}

interface Props { rows: AuditRow[]; campaigns: GoogleAdsCampaign[]; canEdit: boolean; reverting: boolean; onRevert: (id: string) => void }

/** Tudo que o sistema mudou (e você mudou) na conta, com o antes e o depois. Aplicações podem ser desfeitas. */
export function ActivityCard({ rows, campaigns, canEdit, reverting, onRevert }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-lg">Atividade e histórico de mudanças</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mudança registrada ainda.</p>}
        {rows.map((r) => {
          // Linhas vêm da mais nova para a mais antiga: só a última mudança da campanha pode ser desfeita (se não foi desfeita já).
          const canUndo = r.action === "apply" && rows.find((x) => (x.action === "apply" || x.action === "revert") && x.entity === r.entity)?.id === r.id;
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <Badge variant={r.action === "apply" ? "default" : "outline"}>{ACTION_LABEL[r.action] ?? r.action}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")} · {r.actor.startsWith("user:") ? "você" : r.actor}</span>
                </div>
                <div className="truncate" title={summary(r, campaigns)}>{summary(r, campaigns)}</div>
              </div>
              {canUndo && canEdit && (
                <Button size="sm" variant="outline" disabled={reverting} onClick={() => onRevert(r.id)}>
                  <Undo2 className="mr-1 h-4 w-4" /> Desfazer
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
