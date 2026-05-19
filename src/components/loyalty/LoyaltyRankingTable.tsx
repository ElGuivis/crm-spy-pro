import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Gift, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LoyaltyRankingTableProps {
  integrationId: string;
  minRedeem: number;
  pointsToBrl: number;
}

interface CustomerBalance {
  customer_external_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  balance: number;
}

export function LoyaltyRankingTable({ integrationId, minRedeem, pointsToBrl }: LoyaltyRankingTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [redeemCustomer, setRedeemCustomer] = useState<CustomerBalance | null>(null);
  const [pointsInput, setPointsInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const { data: ranking = [], isLoading, refetch } = useQuery({
    queryKey: ["loyalty-ranking", integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_points")
        .select("customer_external_id, customer_name, customer_phone, points")
        .eq("integration_id", integrationId)
        .limit(5000);

      const map = new Map<string, CustomerBalance>();
      for (const row of data || []) {
        const key = row.customer_external_id;
        if (!map.has(key)) {
          map.set(key, {
            customer_external_id: key,
            customer_name: row.customer_name,
            customer_phone: row.customer_phone,
            balance: 0,
          });
        }
        map.get(key)!.balance += row.points;
      }
      return Array.from(map.values())
        .filter((c) => c.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 100);
    },
    enabled: !!integrationId,
  });

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke("loyalty-calculator", {
        body: { integrationId },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Erro desconhecido");
      toast({ title: `${data.credited} pedidos creditados (${data.scanned} escaneados)` });
      refetch();
    } catch (err) {
      toast({ title: "Erro ao calcular pontos", description: String(err), variant: "destructive" });
    } finally {
      setCalculating(false);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCustomer) return;
    const pts = parseInt(pointsInput, 10);
    if (isNaN(pts) || pts <= 0) return;
    setRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("loyalty-redeem", {
        body: { integrationId, customerExternalId: redeemCustomer.customer_external_id, pointsToRedeem: pts },
      });
      if (error || !data.success) throw new Error(data?.error || error?.message);
      toast({
        title: `Cupom gerado: ${data.couponCode}`,
        description: `Valor: R$${data.couponValue.toFixed(2)} — Novo saldo: ${data.newBalance} pts`,
      });
      setRedeemCustomer(null);
      setPointsInput("");
      queryClient.invalidateQueries({ queryKey: ["loyalty-ranking", integrationId] });
    } catch (err: unknown) {
      toast({ title: "Erro ao resgatar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setRedeeming(false);
    }
  };

  const couponPreview = (() => {
    const pts = parseInt(pointsInput, 10);
    if (isNaN(pts) || pts <= 0) return null;
    return (pts * pointsToBrl).toFixed(2);
  })();

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Ranking de Clientes
            </CardTitle>
            <Button size="sm" variant="outline" onClick={handleCalculate} disabled={calculating}>
              {calculating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              {calculating ? "Calculando..." : "Calcular Pontos"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : ranking.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Gift className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum cliente com pontos ainda.</p>
              <p className="text-xs mt-1">Clique em "Calcular Pontos" para processar pedidos recentes.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ranking.map((customer, i) => (
                <div key={customer.customer_external_id} className="flex items-center justify-between rounded-lg border p-3 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-6 text-center shrink-0">#{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{customer.customer_name || customer.customer_external_id}</p>
                      {customer.customer_phone && (
                        <p className="text-xs text-muted-foreground">{customer.customer_phone}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="font-bold">{customer.balance} pts</Badge>
                    {customer.balance >= minRedeem && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setRedeemCustomer(customer); setPointsInput(String(customer.balance)); }}
                      >
                        <Gift className="h-3 w-3 mr-1" />
                        Resgatar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!redeemCustomer} onOpenChange={(o) => { if (!o) { setRedeemCustomer(null); setPointsInput(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Resgatar Pontos
            </DialogTitle>
          </DialogHeader>
          {redeemCustomer && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">{redeemCustomer.customer_name || redeemCustomer.customer_external_id}</p>
                <p className="text-xs text-muted-foreground">Saldo: {redeemCustomer.balance} pontos</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Pontos a resgatar (mín. {minRedeem})</Label>
                <Input
                  type="number" min={minRedeem} max={redeemCustomer.balance}
                  value={pointsInput} onChange={(e) => setPointsInput(e.target.value)}
                  className="mt-1 h-8 text-sm"
                  autoFocus
                />
                {couponPreview && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Cupom de desconto: <span className="font-semibold text-green-600">R${couponPreview}</span>
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setRedeemCustomer(null); setPointsInput(""); }}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleRedeem} disabled={redeeming || parseInt(pointsInput, 10) < minRedeem}>
              {redeeming ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Gerando...</> : "Gerar Cupom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
