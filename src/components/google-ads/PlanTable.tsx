import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import type { RecommendationRow } from "@/hooks/useGoogleAdsInsights";
import { brl } from "@/lib/googleAds";

interface Payload { campaign_id: number; action: "set_budget" | "enable" | "pause"; daily_budget_micros: number | null }

const ACTION_LABEL: Record<Payload["action"], string> = { set_budget: "Ajustar orçamento", enable: "Reativar", pause: "Pausar" };
const ORDER: Record<Payload["action"], number> = { pause: 0, set_budget: 1, enable: 2 };

interface Props {
  plan: RecommendationRow[];
  campaigns: GoogleAdsCampaign[];
  canApply: boolean;
  blockedReason: string | null;
  applying: boolean;
  onApply: (ids: string[]) => void;
}

/** Linhas do plano com antes → depois. Aplica as selecionadas, depois de uma confirmação. O servidor revalida cada trava. */
export function PlanTable({ plan, campaigns, canApply, blockedReason, applying, onApply }: Props) {
  const rows = plan
    .map((r) => ({ rec: r, p: r.payload as unknown as Payload, c: campaigns.find((c) => c.campaign_id === (r.payload as unknown as Payload).campaign_id) }))
    .sort((a, b) => ORDER[a.p.action] - ORDER[b.p.action]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setSelected(new Set(rows.map((r) => r.rec.id))), [plan.map((r) => r.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows.length) return <p className="text-sm text-muted-foreground">Nenhuma mudança proposta no momento.</p>;
  const chosen = rows.filter((r) => selected.has(r.rec.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const after = (p: Payload) => (p.action === "pause" ? "Pausada" : `${brl(p.daily_budget_micros)}/dia`);

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" /><TableHead>Campanha</TableHead><TableHead>Mudança</TableHead>
            <TableHead>Antes</TableHead><TableHead /><TableHead>Depois</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ rec, p, c }) => (
            <TableRow key={rec.id}>
              <TableCell><Checkbox checked={selected.has(rec.id)} onCheckedChange={() => toggle(rec.id)} aria-label={`Selecionar ${c?.name ?? p.campaign_id}`} /></TableCell>
              <TableCell className="max-w-[240px]">
                <div className="truncate font-medium" title={c?.name}>{c?.name ?? p.campaign_id}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground" title={rec.rationale}>{rec.rationale}</div>
                {rec.status === "failed" && <div className="text-xs text-destructive">Falhou: {rec.error}</div>}
              </TableCell>
              <TableCell><Badge variant={p.action === "pause" ? "destructive" : "secondary"}>{ACTION_LABEL[p.action]}</Badge></TableCell>
              <TableCell className="whitespace-nowrap text-sm">{c ? `${c.status === "ENABLED" ? "Ligada" : "Pausada"} · ${brl(c.daily_budget_micros)}/dia` : "—"}</TableCell>
              <TableCell><ArrowRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              <TableCell className="whitespace-nowrap text-sm font-medium">{after(p)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canApply || applying || chosen.length === 0} onClick={() => setConfirm(true)}>
          {applying ? "Implementando no Google Ads…" : `Implementar ${chosen.length} mudança(s)`}
        </Button>
        {blockedReason && <span className="text-sm text-muted-foreground">{blockedReason}</span>}
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Implementar no Google Ads?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Estas mudanças serão feitas de verdade na conta, nesta ordem (pausas e reduções primeiro). Cada uma é conferida depois e fica no histórico, com botão de desfazer.</p>
                <ul className="list-disc space-y-1 pl-5 text-foreground">
                  {chosen.map(({ rec, p, c }) => (
                    <li key={rec.id}>{ACTION_LABEL[p.action]}: <strong>{c?.name ?? p.campaign_id}</strong> → {after(p)}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => onApply(chosen.map((r) => r.rec.id))}>Implementar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
