import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const LABEL: Record<string, string> = {
  cashback: "Cashback (pós-venda)", birthday: "Aniversário", reactivation: "Reativação", email_campaign: "Campanhas de e-mail", recovery: "Recuperação de carrinho",
  welcome: "Boas-vindas", manual: "Criados aqui", loyalty: "Fidelidade", imported: "Importados da loja (campanhas antigas)",
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Retorno dos cupons por origem (módulo que emitiu): quantos saíram, quantos foram usados e quanto renderam. */
export function CouponsByOrigin() {
  const { tenantId } = useAuth();
  const [days, setDays] = useState(90);
  const { data, isLoading } = useQuery({
    queryKey: ["coupon-performance", tenantId, days], enabled: !!tenantId, staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_coupon_performance", { p_tenant_id: tenantId!, p_days: days });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Retorno por origem</CardTitle>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Últimos 30 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem><SelectItem value="0">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : !data?.length ? (
          <p className="text-sm text-muted-foreground">Nenhum cupom no período. Sincronize os cupons da loja para ver o histórico.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Origem</TableHead><TableHead className="text-right">Emitidos</TableHead><TableHead className="text-right">Usados</TableHead><TableHead className="text-right">Uso</TableHead>
                <TableHead className="text-right">Receita</TableHead><TableHead className="text-right">Ticket médio</TableHead><TableHead className="text-right">Desconto dado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.origin_type}>
                    <TableCell className="font-medium">{LABEL[r.origin_type] ?? r.origin_type}</TableCell>
                    <TableCell className="text-right">{r.issued}</TableCell>
                    <TableCell className="text-right">{r.redeemed}</TableCell>
                    <TableCell className="text-right">{r.issued ? `${((r.redeemed / r.issued) * 100).toFixed(1)}%` : "–"}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.revenue))}</TableCell>
                    <TableCell className="text-right">{r.redeemed ? brl(Number(r.avg_ticket)) : "–"}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.discount_cost))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2">Uso e receita vêm dos pedidos da loja que trouxeram o código do cupom (pedidos cancelados não contam). "Desconto dado" é estimado pelo valor do cupom.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
