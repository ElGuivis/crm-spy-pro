import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import { invokeGoogleAds } from "@/lib/googleAdsInvoke";
import { parseNumber, x } from "@/lib/googleAdsEconomics";

interface Props { accountId: string; campaigns: GoogleAdsCampaign[]; accountMinRoas: number; canEdit: boolean }

/** ROAS mínimo próprio por campanha. Vazio = vale o mínimo da conta. As regras de estratégia passam a usar esse valor. */
export function CampaignTargetsCard({ accountId, campaigns, accountMinRoas, canEdit }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<number, string>>({});
  const targets = useQuery({
    queryKey: ["google-ads", "campaign-targets", accountId],
    queryFn: async () => {
      const { data, error } = await supabase.from("google_ads_campaign_targets").select("campaign_id, target_value").eq("account_id", accountId).eq("target_type", "roas_min");
      if (error) throw error;
      return new Map((data ?? []).map((t) => [Number(t.campaign_id), Number(t.target_value)]));
    },
  });
  const save = useMutation({
    mutationFn: async (v: { campaignId: number; roas: number | null }) => {
      await invokeGoogleAds("google-ads-settings", { action: "set_campaign_target", account_id: accountId, campaign_id: v.campaignId, roas_min: v.roas });
      // Refaz a estratégia com a meta nova (sem esperar o horário automático).
      invokeGoogleAds("google-ads-strategist", { account_id: accountId }).catch((): void => undefined);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["google-ads"] });
      setDraft((d) => { const n = { ...d }; delete n[v.campaignId]; return n; });
      toast.success(v.roas === null ? "Meta da campanha removida (vale o mínimo da conta)" : "Meta da campanha salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = campaigns.filter((c) => c.status === "ENABLED");
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Target className="h-5 w-5" /> Meta de ROAS por campanha</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Deixe vazio para usar o mínimo da conta ({x(accountMinRoas)}). Defina um valor próprio quando uma campanha tiver outro papel (por exemplo, atrair clientes novos pode aceitar um ROAS menor, desde que fique acima do ponto de equilíbrio da aba Economia).
        </p>
        <Table>
          <TableHeader><TableRow><TableHead>Campanha</TableHead><TableHead className="text-right">Meta atual</TableHead><TableHead className="w-[220px]">Nova meta</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((c) => {
              const id = Number(c.campaign_id), cur = targets.data?.get(id) ?? null;
              const text = draft[id] ?? "";
              const v = parseNumber(text);
              const invalid = text !== "" && !(v >= 0.5 && v <= 50);
              return (
                <TableRow key={id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right">{cur == null ? `${x(accountMinRoas)} (conta)` : x(cur)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Input inputMode="decimal" placeholder="ex.: 3,5" value={text} disabled={!canEdit || save.isPending} aria-invalid={invalid}
                        onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))} className="h-8" />
                      <Button size="sm" disabled={!canEdit || save.isPending || text === "" || invalid} onClick={() => save.mutate({ campaignId: id, roas: v })}>Salvar</Button>
                      {cur != null && <Button size="sm" variant="outline" disabled={!canEdit || save.isPending} onClick={() => save.mutate({ campaignId: id, roas: null })}>Remover</Button>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!canEdit && <p className="text-xs text-muted-foreground">Somente administradores podem alterar.</p>}
      </CardContent>
    </Card>
  );
}
