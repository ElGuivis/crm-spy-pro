import { Separator } from "@/components/ui/separator";
import { CreditCard } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BlingOrderFull } from "./bling-order-types";
import { formatCurrency, formatDateShort, displayValue } from "./bling-order-helpers";

interface Props {
  order: BlingOrderFull;
  getPaymentDisplayName?: (code: string | null) => string | null;
}

export function BlingOrderFinanceiroTab({ order, getPaymentDisplayName }: Props) {
  const hasParcelas = order.parcelas && Array.isArray(order.parcelas) && order.parcelas.length > 0;

  const resolvedPaymentLabel = (() => {
    if (order.forma_pagamento) {
      return getPaymentDisplayName?.(order.forma_pagamento) || order.forma_pagamento;
    }
    if (hasParcelas && order.parcelas[0]?.formaPagamento) {
      const paymentId = String(order.parcelas[0].formaPagamento.id);
      const customName = getPaymentDisplayName?.(paymentId);
      if (customName) return customName;
      if (order.parcelas[0].formaPagamento.descricao) return order.parcelas[0].formaPagamento.descricao;
      return `ID: ${paymentId}`;
    }
    return "-";
  })();

  return (
    <div className="space-y-4">
      {/* Financial Summary */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="h-4 w-4" />
          Resumo Financeiro
        </div>
        <div className="p-4 border rounded-lg space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Produtos</span>
            <span>{formatCurrency(order.valor_produtos)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Frete</span>
            <span>{formatCurrency(order.valor_frete)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Outras Despesas</span>
            <span>{formatCurrency(order.outras_despesas)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>Desconto</span>
            <span>-{formatCurrency(order.valor_desconto)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span className="text-primary">{formatCurrency(order.valor_total)}</span>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="p-3 border rounded-lg">
        <p className="text-xs text-muted-foreground">Forma de Pagamento</p>
        <p className="font-medium">{resolvedPaymentLabel}</p>
      </div>

      {/* Installments */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Parcelas</p>
        {hasParcelas ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcela</TableHead>
                <TableHead>Forma de Pagamento</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.parcelas.map((parcela: any, idx: number) => {
                const paymentId = parcela.formaPagamento?.id ? String(parcela.formaPagamento.id) : null;
                const customPaymentName = paymentId ? getPaymentDisplayName?.(paymentId) : null;
                const displayPayment = customPaymentName ||
                  parcela.formaPagamento?.descricao ||
                  (paymentId ? `ID: ${paymentId}` : '-');
                return (
                  <TableRow key={idx}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>{displayPayment}</TableCell>
                    <TableCell>{formatDateShort(parcela.dataVencimento)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(parcela.valor)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {parcela.observacoes || parcela.observacao || '-'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="p-4 border rounded-lg text-center text-muted-foreground">
            <p>Nenhuma parcela informada</p>
          </div>
        )}
      </div>

      {/* Marketplace Fees */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Taxas do Marketplace</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
            <p className="text-xs text-muted-foreground">Comissão</p>
            <p className="font-medium text-red-600">
              {order.taxa_comissao && order.taxa_comissao > 0 ? `-${formatCurrency(order.taxa_comissao)}` : '-'}
            </p>
          </div>
          <div className="p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
            <p className="text-xs text-muted-foreground">Custo Frete</p>
            <p className="font-medium text-red-600">
              {order.custo_frete && order.custo_frete > 0 ? `-${formatCurrency(order.custo_frete)}` : '-'}
            </p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Valor Base</p>
            <p className="font-medium">{formatCurrency(order.valor_base)}</p>
          </div>
        </div>
      </div>

      {/* Taxes */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Tributos</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Total ICMS</p>
            <p className="font-medium">{formatCurrency(order.total_icms)}</p>
          </div>
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Total IPI</p>
            <p className="font-medium">{formatCurrency(order.total_ipi)}</p>
          </div>
        </div>
      </div>

      {/* Invoice */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 border rounded-lg">
          <p className="text-xs text-muted-foreground">Nota Fiscal Vinculada</p>
          <p className="font-medium">{order.nota_fiscal_id ? `ID: ${order.nota_fiscal_id}` : '-'}</p>
        </div>
        <div className="p-3 border rounded-lg">
          <p className="text-xs text-muted-foreground">ID Categoria</p>
          <p className="font-medium">{displayValue(order.categoria_id)}</p>
        </div>
      </div>
    </div>
  );
}
