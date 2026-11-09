import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ConversionActionRow, ConversionLifetimeRow } from "@/hooks/useGoogleAdsInsights";
import { brl } from "@/lib/googleAds";
import { fmtMonth } from "@/lib/googleAdsStrategy";

const CATEGORY_LABEL: Record<string, string> = {
  PURCHASE: "Compra", ADD_TO_CART: "Carrinho", BEGIN_CHECKOUT: "Início do checkout", DOWNLOAD: "Download de app",
  PHONE_CALL_LEAD: "Ligação", CONTACT: "Contato", GET_DIRECTIONS: "Rota no mapa", PAGE_VIEW: "Visualização de página",
  ENGAGEMENT: "Engajamento", DEFAULT: "Padrão",
};
/** Categorias que não são venda: se forem "principais", o Google otimiza os lances para elas. */
const NOT_SALE = new Set(["DOWNLOAD", "PHONE_CALL_LEAD", "CONTACT", "GET_DIRECTIONS", "PAGE_VIEW", "ENGAGEMENT"]);

interface Props { actions: ConversionActionRow[]; lifetime: ConversionLifetimeRow[] }

/** O que a conta conta como "conversão": se as conversões vêm de venda de verdade ou de ruído (ligações, instalações). */
export function ConversionsCard({ actions, lifetime }: Props) {
  const byName = new Map<string, ConversionActionRow[]>();
  for (const a of actions) byName.set(a.name, [...(byName.get(a.name) ?? []), a]);
  const rows = lifetime.filter((c) => Number(c.conversions) > 0 || Number(c.conversions_value) > 0).slice(0, 12);
  const noisy = actions.filter((a) => a.status === "ENABLED" && a.primary_for_goal && NOT_SALE.has(a.category ?? ""));
  const hidden = actions.filter((a) => a.status === "HIDDEN");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">De onde vêm as conversões <span className="text-sm font-normal text-muted-foreground">(vida inteira)</span></CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(noisy.length > 0 || hidden.length > 0) && (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Pontos de atenção na medição</div>
            {noisy.length > 0 && <p>Estas ações estão ativas e como <strong>principais</strong>, mas não são venda: {noisy.map((a) => a.name).join("; ")}. Elas podem fazer os lances otimizarem para o objetivo errado.</p>}
            {hidden.length > 0 && <p>{hidden.length} ação(ões) ocultas no Google Ads ({hidden.map((a) => a.name).join("; ")}).</p>}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ação de conversão</TableHead><TableHead>Tipo</TableHead><TableHead>Situação</TableHead>
              <TableHead className="text-right">Conversões</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Período</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const defs = byName.get(c.conversion_action_name) ?? [];
              const enabled = defs.some((d) => d.status === "ENABLED");
              const cat = defs[0]?.category ?? null;
              return (
                <TableRow key={c.conversion_action_name}>
                  <TableCell className="max-w-[260px] truncate font-medium" title={c.conversion_action_name}>{c.conversion_action_name}</TableCell>
                  <TableCell>{cat ? (CATEGORY_LABEL[cat] ?? cat) : "—"}</TableCell>
                  <TableCell><Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "Ativa" : defs[0]?.status === "HIDDEN" ? "Oculta" : "Removida"}</Badge></TableCell>
                  <TableCell className="text-right">{Number(c.conversions).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                  <TableCell className="text-right">{Number(c.conversions_value) > 0 ? brl(Number(c.conversions_value) * 1e6) : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtMonth(c.first_month as string)} a {fmtMonth(c.last_month as string)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">Carrinho e checkout aparecem aqui com valor zero: são etapas, não vendas. A receita real vem da ação de compra.</p>
      </CardContent>
    </Card>
  );
}
