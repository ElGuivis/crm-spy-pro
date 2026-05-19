import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Star, TrendingUp, Gift } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientLoyaltyPanelProps {
  integrationId: string;
  customerExternalId: string;
}

export function ClientLoyaltyPanel({ integrationId, customerExternalId }: ClientLoyaltyPanelProps) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["client-loyalty-history", integrationId, customerExternalId],
    queryFn: async () => {
      if (!customerExternalId) return [];
      const { data } = await supabase
        .from("loyalty_points" as any)
        .select("id, points, type, description, coupon_code, created_at")
        .eq("integration_id", integrationId)
        .eq("customer_external_id", customerExternalId)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data as any[]) || [];
    },
    enabled: !!customerExternalId && !!integrationId,
  });

  if (!customerExternalId) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Cliente sem telefone ou nome para identificar pontos.
      </p>
    );
  }

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  const balance = rows.reduce((s: number, r: any) => s + r.points, 0);
  const earned = rows
    .filter((r: any) => r.type === "earn" || r.type === "bonus")
    .reduce((s: number, r: any) => s + r.points, 0);
  const redeemed = rows
    .filter((r: any) => r.type === "redeem")
    .reduce((s: number, r: any) => s + Math.abs(r.points), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <Star className="h-4 w-4 mx-auto mb-1 text-yellow-500" />
          <p className="text-xl font-bold">{balance}</p>
          <p className="text-xs text-muted-foreground">Saldo</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto mb-1 text-green-500" />
          <p className="text-xl font-bold">{earned}</p>
          <p className="text-xs text-muted-foreground">Acumulado</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <Gift className="h-4 w-4 mx-auto mb-1 text-purple-500" />
          <p className="text-xl font-bold">{redeemed}</p>
          <p className="text-xs text-muted-foreground">Resgatado</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhuma movimentação ainda.
        </p>
      ) : (
        <div className="space-y-1">
          {rows.map((row: any) => (
            <div
              key={row.id}
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">{row.description || row.type}</p>
                {row.coupon_code && (
                  <p className="text-[10px] text-muted-foreground font-mono">{row.coupon_code}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(row.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              <span
                className={`font-semibold shrink-0 ml-3 text-sm ${
                  row.points > 0 ? "text-green-600" : "text-red-500"
                }`}
              >
                {row.points > 0 ? `+${row.points}` : row.points} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
