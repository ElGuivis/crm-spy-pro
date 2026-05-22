import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart } from "lucide-react";
import { UsedCouponInfo } from "@/hooks/useCouponsData";

interface CouponsSalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usedCoupons: UsedCouponInfo[];
  totalGeneratedValue: number;
  formatCurrency: (value: number) => string;
}

export function CouponsSalesDialog({ open, onOpenChange, usedCoupons, totalGeneratedValue, formatCurrency }: CouponsSalesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-green-600" />Vendas Geradas com Cashback
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {usedCoupons.length === 0 ? (
            <div className="text-center py-10">
              <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">Nenhum cupom utilizado ainda</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cupom</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usedCoupons.map(({ coupon, orderValue }) => (
                  <TableRow key={coupon.id}>
                    <TableCell><code className="px-2 py-1 rounded bg-muted font-mono text-sm">{coupon.coupon_code}</code></TableCell>
                    <TableCell>{coupon.customer_name || "-"}</TableCell>
                    <TableCell>#{coupon.used_in_order_id}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">{formatCurrency(orderValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="border-t pt-4 mt-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Total de vendas: {usedCoupons.length}</span>
          <span className="text-lg font-bold text-green-600">{formatCurrency(totalGeneratedValue)}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
