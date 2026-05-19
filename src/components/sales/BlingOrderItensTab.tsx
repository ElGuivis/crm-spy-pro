import { RefreshCw, Package } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BlingOrderItem } from "./bling-order-types";
import { formatCurrency, displayValue } from "./bling-order-helpers";

interface Props {
  orderItems: BlingOrderItem[];
  loadingItems: boolean;
}

export function BlingOrderItensTab({ orderItems, loadingItems }: Props) {
  if (loadingItems) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (orderItems.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>Nenhum item encontrado</p>
        <p className="text-xs mt-2">Os itens serão exibidos após a sincronização completa</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produto</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-center">Qtd</TableHead>
            <TableHead className="text-right">Custo</TableHead>
            <TableHead className="text-right">Unit.</TableHead>
            <TableHead className="text-right">Desc.</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{displayValue(item.produto_nome)}</p>
                  {item.descricao_detalhada && (
                    <p className="text-xs text-muted-foreground">{item.descricao_detalhada}</p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{displayValue(item.sku)}</TableCell>
              <TableCell className="text-center">
                {item.quantidade} {item.unidade || 'un'}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {item.preco_custo && item.preco_custo > 0 ? formatCurrency(item.preco_custo) : '-'}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(item.valor_unitario)}</TableCell>
              <TableCell className="text-right text-red-600">
                {item.desconto && item.desconto > 0 ? `-${formatCurrency(item.desconto)}` : '-'}
              </TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(item.valor_total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {orderItems.some(item => item.comissao_valor && item.comissao_valor > 0) && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Comissões dos Itens</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Alíquota</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems.filter(item => item.comissao_valor && item.comissao_valor > 0).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{displayValue(item.produto_nome)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.comissao_base)}</TableCell>
                  <TableCell className="text-right">{item.comissao_aliquota}%</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(item.comissao_valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
