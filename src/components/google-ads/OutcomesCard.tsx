import { useQuery } from "@tanstack/react-query";
import { LineChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const KIND: Record<string, string> = { budget: "Verba", enable: "Religar", pause: "Pausar", rebuild: "Reconstruir", negatives: "Negativas", goal: "Meta de conversão" };
const VERDICT: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  improved: { label: "Melhorou", variant: "default" }, neutral: { label: "Sem mudança", variant: "secondary" }, worsened: { label: "Piorou", variant: "destructive" },
  insufficient: { label: "Poucos dados", variant: "outline" }, expected: { label: "Efeito esperado", variant: "outline" },
};

/** Resultado medido de cada mudança aplicada (7 e 14 dias depois) e taxa de acerto por tipo de ação. */
export function OutcomesCard({ accountId }: { accountId: string }) {
  const { data } = useQuery({
    queryKey: ["google-ads", "outcomes", accountId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("google_ads_action_outcomes").select("id, action_kind, entity, applied_at, horizon_days, verdict, note")
        .eq("account_id", accountId).order("applied_at", { ascending: false }).limit(100);
      if (error) throw error;
      return rows ?? [];
    },
  });
  const rows = data ?? [];
  const measured = rows.filter((r) => r.verdict !== "insufficient" && r.verdict !== "expected");
  const byKind = new Map<string, { ok: number; total: number }>();
  for (const r of measured) {
    const e = byKind.get(r.action_kind) ?? { ok: 0, total: 0 };
    e.total++; if (r.verdict !== "worsened") e.ok++;
    byKind.set(r.action_kind, e);
  }
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><LineChart className="h-5 w-5" /> Resultado das mudanças aplicadas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Sete e quatorze dias depois de cada mudança, o sistema compara o ROAS com os 7 dias anteriores. É assim que ele aprende o que funciona na sua conta.
          A automação só poderá ser liberada depois de pelo menos 20 mudanças medidas com 70% de acerto.
        </p>
        {byKind.size > 0 && (
          <div className="flex flex-wrap gap-2 text-sm">
            {[...byKind.entries()].map(([k, v]) => (
              <Badge key={k} variant="secondary">{KIND[k] ?? k}: {Math.round((v.ok / v.total) * 100)}% de acerto ({v.total} medidas)</Badge>
            ))}
            <Badge variant="outline">Total medido: {measured.length} de 20</Badge>
          </div>
        )}
        {!rows.length && <p className="text-sm text-muted-foreground">Ainda não há mudanças com tempo suficiente para medir (precisa de 9 dias depois da mudança).</p>}
        <ul className="space-y-2 text-sm">
          {rows.slice(0, 15).map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-2">
              <Badge variant={VERDICT[r.verdict]?.variant ?? "outline"}>{VERDICT[r.verdict]?.label ?? r.verdict}</Badge>
              <span className="font-medium">{KIND[r.action_kind] ?? r.action_kind}</span>
              <span className="text-muted-foreground">{new Date(r.applied_at).toLocaleDateString("pt-BR")} · {r.horizon_days} dias — {r.note}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
