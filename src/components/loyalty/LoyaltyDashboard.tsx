import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Star, Gift, Users, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LoyaltyConfigCard } from "./LoyaltyConfigCard";
import { LoyaltyRankingTable } from "./LoyaltyRankingTable";

interface LoyaltyDashboardProps {
  integrationId: string;
}

export function LoyaltyDashboard({ integrationId }: LoyaltyDashboardProps) {
  const navigate = useNavigate();

  const { data: integration } = useQuery({
    queryKey: ["integration-info-loyalty", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("name, type").eq("id", integrationId).single();
      return data;
    },
  });

  const { data: program } = useQuery({
    queryKey: ["loyalty-program", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("loyalty_programs").select("*").eq("integration_id", integrationId).maybeSingle();
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["loyalty-stats", integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_points")
        .select("points, type")
        .eq("integration_id", integrationId);

      const rows = data || [];
      const totalEarned = rows.filter((r) => r.type === "earn" || r.type === "bonus").reduce((s, r) => s + r.points, 0);
      const totalRedeemed = rows.filter((r) => r.type === "redeem").reduce((s, r) => s + Math.abs(r.points), 0);

      const map = new Map<string, number>();
      // Recount all rows grouped by customer in a separate query for balance
      const { data: allRows } = await supabase
        .from("loyalty_points")
        .select("customer_external_id, points")
        .eq("integration_id", integrationId);
      for (const r of allRows || []) {
        map.set(r.customer_external_id, (map.get(r.customer_external_id) || 0) + r.points);
      }
      const activeCustomers = Array.from(map.values()).filter((b) => b > 0).length;
      const totalBalance = Array.from(map.values()).reduce((s, b) => s + Math.max(0, b), 0);

      return { totalEarned, totalRedeemed, activeCustomers, totalBalance };
    },
  });

  if (!integration) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/fidelidade")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{program?.name || "Programa de Pontos"}</h1>
          <p className="text-muted-foreground text-sm">{integration.name}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Star className="h-4 w-4" />
              <span className="text-xs font-medium">Pontos Emitidos</span>
            </div>
            <p className="text-2xl font-bold">{stats?.totalEarned?.toLocaleString("pt-BR") ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Gift className="h-4 w-4" />
              <span className="text-xs font-medium">Pontos Resgatados</span>
            </div>
            <p className="text-2xl font-bold">{stats?.totalRedeemed?.toLocaleString("pt-BR") ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs font-medium">Clientes Ativos</span>
            </div>
            <p className="text-2xl font-bold">{stats?.activeCustomers ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium">Saldo Total em Circulação</span>
            </div>
            <p className="text-2xl font-bold">{stats?.totalBalance?.toLocaleString("pt-BR") ?? "—"} pts</p>
          </CardContent>
        </Card>
      </div>

      <LoyaltyConfigCard integrationId={integrationId} />
      <LoyaltyRankingTable
        integrationId={integrationId}
        minRedeem={program?.min_points_redeem ?? 100}
        pointsToBrl={Number(program?.points_to_brl ?? 0.01)}
      />
    </div>
  );
}
