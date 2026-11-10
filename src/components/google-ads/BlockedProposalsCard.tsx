import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/** Propostas que o revisor barrou (conflito, mudança pequena, poucos dados, duplicata), com o motivo. Somem sozinhas se a situação mudar. */
export function BlockedProposalsCard({ accountId }: { accountId: string }) {
  const { data } = useQuery({
    queryKey: ["google-ads", "blocked", accountId],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("google_ads_recommendations").select("id, title, error")
        .eq("account_id", accountId).eq("status", "blocked").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return rows ?? [];
    },
  });
  if (!data?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5" /> Barradas pelo revisor ({data.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">O sistema descartou estas ideias antes de chegar a você, para não gerar ruído nem decisões contraditórias. Se os dados mudarem, elas voltam sozinhas.</p>
        <ul className="space-y-2 text-sm">
          {data.map((r) => (
            <li key={r.id}><p className="font-medium">{r.title}</p><p className="text-muted-foreground">{r.error}</p></li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
