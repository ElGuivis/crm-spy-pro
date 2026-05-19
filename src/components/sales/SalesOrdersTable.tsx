import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search, Eye, Truck, Tag } from "lucide-react";
import { OrderView } from "./sales-types";
import { formatCurrency, formatDate, getStatusColor } from "./sales-helpers";

interface SalesOrdersTableProps {
  orders: OrderView[];
  loading: boolean;
  totalOrders: number;
  searchTerm: string;
  currentPage: number;
  pageSize: number;
  syncIsActive: boolean;
  onSearchChange: (term: string) => void;
  onViewDetails: (order: OrderView) => void;
  onSync: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function SalesOrdersTable({
  orders, loading, totalOrders, searchTerm, currentPage, pageSize, syncIsActive,
  onSearchChange, onViewDetails, onSync, onPageChange, onPageSizeChange,
}: SalesOrdersTableProps) {
  const filteredOrders = orders.filter(order => {
    const s = searchTerm.toLowerCase();
    return (
      order.order_number.toLowerCase().includes(s) ||
      order.customer_name?.toLowerCase().includes(s) ||
      order.customer_email?.toLowerCase().includes(s)
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Pedidos ({totalOrders})</CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar pedidos..." value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {orders.length === 0 ? (
              <div>
                <p>Nenhum pedido sincronizado ainda.</p>
                <Button variant="outline" className="mt-4" onClick={onSync} disabled={syncIsActive}>
                  Sincronizar Pedidos
                </Button>
              </div>
            ) : (
              <p>Nenhum pedido encontrado com o termo "{searchTerm}"</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Frete</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">#{order.order_number}</span>
                        {order.codigo_rastreio && <span title="Com rastreio"><Truck className="h-3 w-3 text-blue-500" /></span>}
                        {order.cupom_desconto && <span title={`Cupom: ${order.cupom_desconto}`}><Tag className="h-3 w-3 text-green-500" /></span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{order.customer_name || 'N/A'}</p>
                        <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(order.status_name)}>{order.status_name || 'Desconhecido'}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatCurrency(order.valor_frete)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(order.valor_total)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(order.created_at_remote)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => onViewDetails(order)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Itens por página:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => onPageSizeChange(Number(v))}>
                  <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="75">75</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalOrders)} de {totalOrders}
                </span>
                <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>Anterior</Button>
                <Button variant="outline" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={(currentPage + 1) * pageSize >= totalOrders}>Próximo</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
