import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Search, ShoppingCart, Eye, Clock, Zap, ArrowLeft, CheckCircle, XCircle, Store, Download, StopCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BlingOrderDetailsDialog } from "./BlingOrderDetailsDialog";
import { Progress } from "@/components/ui/progress";
import { BlingStoreSelectorDialog } from "@/components/integrations/BlingStoreSelectorDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { useBlingSalesData } from "./useBlingSalesData";
import { supabase } from "@/integrations/supabase/client";

interface BlingSalesContentProps {
  integrationId: string;
}

export function BlingSalesContent({ integrationId }: BlingSalesContentProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const d = useBlingSalesData(integrationId);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/sales')}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{d.integrationName || 'Vendas'}</h1>
              <Badge variant="outline" className="text-xs">Bling</Badge>
            </div>
            <p className="text-muted-foreground">Gerencie os pedidos desta loja</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" onClick={d.handleExportOrders} disabled={d.isExporting || d.totalOrders === 0}>
            <Download className={`h-4 w-4 mr-2 ${d.isExporting ? 'animate-pulse' : ''}`} />
            {d.isExporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
          <SyncStatusBadge integrationId={integrationId} syncType="orders" />
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="pedidos"
            tablesToDelete={[{ table: 'bling_orders', itemsTable: 'bling_order_items', itemsForeignKey: 'order_id' }]}
            onDeleted={() => { d.fetchOrders(); d.fetchStats(); }}
          />
          {d.isSyncing ? (
            <Button variant="destructive" onClick={async () => { await d.cancelSync(); toast({ title: "Sincronização cancelada", description: "A sincronização foi interrompida." }); }}>
              <StopCircle className="h-4 w-4 mr-2" />Cancelar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => d.checkForNew()} disabled={d.isSyncing}>
                <Zap className="h-4 w-4 mr-2" />Verificar Novos
              </Button>
              <Button variant="outline" onClick={d.handleSyncClick} disabled={d.isSyncing}>
                {d.syncStatus === 'completed' ? <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> :
                 d.syncStatus === 'failed' ? <XCircle className="h-4 w-4 mr-2 text-red-500" /> :
                 d.syncStatus === 'cancelled' ? <StopCircle className="h-4 w-4 mr-2 text-orange-500" /> :
                 <Download className="h-4 w-4 mr-2" />}
                {d.syncStatus === 'completed' ? 'Concluído!' : d.syncStatus === 'cancelled' ? 'Cancelado' : 'Sincronizar Tudo'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Sync Progress */}
      {d.isSyncing && d.currentJob && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                  <span className="font-medium">
                    Sincronizando {d.currentJob.job_type === 'orders' ? 'pedidos' : d.currentJob.job_type === 'customers' ? 'clientes' : 'produtos'}...
                  </span>
                </div>
                <Badge variant="outline" className="font-mono">Página {d.currentJob.current_page}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-2 bg-background rounded-lg"><p className="text-2xl font-bold text-primary">{d.currentJob.saved_count}</p><p className="text-xs text-muted-foreground">Salvos</p></div>
                <div className="p-2 bg-background rounded-lg"><p className="text-2xl font-bold">{d.currentJob.processed_count}</p><p className="text-xs text-muted-foreground">Processados</p></div>
                <div className="p-2 bg-background rounded-lg"><p className="text-2xl font-bold text-muted-foreground">{d.currentJob.current_page * 100}+</p><p className="text-xs text-muted-foreground">Estimativa</p></div>
              </div>
              <Progress value={Math.min((d.currentJob.current_page / 10) * 100, 90)} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">A sincronização pode demorar alguns minutos dependendo da quantidade de dados</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Pedidos</p><p className="text-2xl font-bold">{d.stats.orders}</p></div><ShoppingCart className="h-8 w-8 text-primary opacity-50" /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Última Sincronização</p><p className="text-sm font-medium">{d.formatLastSync(d.stats.lastOrdersSync)}</p></div><Clock className="h-8 w-8 text-muted-foreground opacity-50" /></div></CardContent></Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Pedidos Recentes</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar pedidos..." value={d.searchTerm} onChange={(e) => d.setSearchTerm(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {d.loading ? (
            <div className="flex items-center justify-center py-8"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : d.filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {d.orders.length === 0 ? (
                <div><p>Nenhum pedido sincronizado ainda.</p><Button variant="outline" className="mt-4" onClick={d.handleSyncClick} disabled={d.isSyncing}><Download className="h-4 w-4 mr-2" />Sincronizar Tudo</Button></div>
              ) : (<p>Nenhum pedido encontrado com o termo &ldquo;{d.searchTerm}&rdquo;</p>)}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Loja/Canal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Produtos</TableHead>
                      <TableHead className="text-right">Frete</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.displayedOrders.map((order) => (
                      <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => d.viewOrderDetails(order)}>
                        <TableCell><div><p className="font-medium">#{order.numero}</p>{order.numero_loja && <p className="text-xs text-muted-foreground">Loja: {order.numero_loja}</p>}</div></TableCell>
                        <TableCell><div><p className="font-medium">{order.cliente_nome || 'N/A'}</p><p className="text-xs text-muted-foreground">{order.cliente_email || order.cliente_telefone || ''}</p></div></TableCell>
                        <TableCell><div><p className="text-sm">{order.loja_nome || '-'}</p>{order.intermediador_nome_usuario && <p className="text-xs text-orange-600">{order.intermediador_nome_usuario}</p>}</div></TableCell>
                        <TableCell><Badge variant={d.getStatusColor(order.situacao_nome, order.situacao_id)}>{d.getStatusDisplayName(order.situacao_nome, order.situacao_id)}</Badge></TableCell>
                        <TableCell className="text-right text-sm">{d.formatCurrency(order.valor_produtos)}</TableCell>
                        <TableCell className="text-right text-sm text-blue-600">{order.valor_frete && order.valor_frete > 0 ? d.formatCurrency(order.valor_frete) : '-'}</TableCell>
                        <TableCell className="text-right font-semibold">{d.formatCurrency(order.valor_total)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{d.formatDate(order.data_criacao)}</TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); d.viewOrderDetails(order); }}><Eye className="h-4 w-4 mr-1" />Detalhes</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Exibindo</span>
                  <Select value={d.itemsPerPage.toString()} onValueChange={d.handleItemsPerPageChange}>
                    <SelectTrigger className="w-[70px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[25, 50, 75, 100].map(n => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span>de {d.searchTerm ? d.filteredOrders.length : d.totalOrders} pedidos</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => d.handlePageChange(d.currentPage - 1)} disabled={d.currentPage === 1}><ChevronLeft className="h-4 w-4" />Anterior</Button>
                  <div className="flex items-center gap-1">
                    {d.totalPages <= 7 ? (
                      Array.from({ length: d.totalPages }, (_, i) => i + 1).map((page) => (
                        <Button key={page} variant={d.currentPage === page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => d.handlePageChange(page)}>{page}</Button>
                      ))
                    ) : (
                      <>
                        <Button variant={d.currentPage === 1 ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => d.handlePageChange(1)}>1</Button>
                        {d.currentPage > 3 && <span className="px-1 text-muted-foreground">...</span>}
                        {Array.from({ length: 3 }, (_, i) => Math.max(2, Math.min(d.currentPage - 1 + i, d.totalPages - 1)))
                          .filter((page, idx, arr) => page > 1 && page < d.totalPages && arr.indexOf(page) === idx)
                          .map(page => <Button key={page} variant={d.currentPage === page ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => d.handlePageChange(page)}>{page}</Button>)}
                        {d.currentPage < d.totalPages - 2 && <span className="px-1 text-muted-foreground">...</span>}
                        <Button variant={d.currentPage === d.totalPages ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => d.handlePageChange(d.totalPages)}>{d.totalPages}</Button>
                      </>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => d.handlePageChange(d.currentPage + 1)} disabled={d.currentPage === d.totalPages || d.totalPages === 0}>Próximo<ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <BlingOrderDetailsDialog
        order={d.selectedOrder}
        orderItems={d.orderItems}
        loadingItems={d.loadingItems}
        open={!!d.selectedOrder}
        onOpenChange={(open) => !open && d.setSelectedOrder(null)}
        getStatusDisplayName={d.getStatusDisplayName}
        getPaymentDisplayName={d.getPaymentDisplayName}
      />
      <BlingStoreSelectorDialog
        open={d.storeSelectorOpen}
        onOpenChange={d.setStoreSelectorOpen}
        integrationId={integrationId}
        onConfirm={d.handleSyncWithStores}
      />
    </div>
  );
}
