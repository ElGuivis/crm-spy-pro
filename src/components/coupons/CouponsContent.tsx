import { useNavigate } from "react-router-dom";
import { Ticket, Search, RefreshCw, CheckCircle2, XCircle, Clock, Filter, Download, Gift, Loader2, Plus, Mail } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { discountLabel } from "@/hooks/couponsHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft } from "lucide-react";
import { CreateCouponDialog } from "./CreateCouponDialog";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { InitialSyncProgress } from "@/components/common/InitialSyncProgress";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";
import { CouponsStatsCards } from "./CouponsStatsCards";
import { CouponsSalesDialog } from "./CouponsSalesDialog";
import { useCouponsData } from "@/hooks/useCouponsData";

interface CouponsContentProps { integrationId: string; }

export const CouponsContent = ({ integrationId }: CouponsContentProps) => {
  const navigate = useNavigate();
  const {
    filteredCoupons, coupons, isLoading, isSyncing, syncProgress,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, sourceFilter, setSourceFilter,
    integrationName, integrationType, stats, usedCoupons,
    showSalesDialog, setShowSalesDialog, showCreateDialog, setShowCreateDialog,
    loadCoupons, handleSyncCoupons, toggleCoupon, getCouponStatus, getCouponSource,
    formatDate, formatPhone, formatCurrency,
  } = useCouponsData(integrationId);

  const sourceIconMap: Record<string, React.ReactNode> = {
    imported: <Download className="h-3 w-3" />,
    manual: <Ticket className="h-3 w-3" />,
    cashback: <Gift className="h-3 w-3" />,
    email: <Mail className="h-3 w-3" />,
  };
  const canToggle = integrationType === "loja_integrada";
  const statusIconMap: Record<string, React.ReactNode> = {
    check: <CheckCircle2 className="h-3 w-3" />,
    x: <XCircle className="h-3 w-3" />,
    clock: <Clock className="h-3 w-3" />,
  };

  const visibleCoupons = filteredCoupons.slice(0, 300); // a tela fica leve; use a busca para achar os demais

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/coupons")}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cupons {integrationName && `- ${integrationName}`}</h1>
            <p className="text-muted-foreground">Histórico de cupons da loja</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SyncStatusBadge integrationId={integrationId} syncType="coupons" />
          <DeleteIntegrationDataButton integrationId={integrationId} dataType="cupons" tablesToDelete={[{ table: "generated_coupons" }]} onDeleted={loadCoupons} />
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2"><Plus className="h-4 w-4" />Criar Cupom</Button>
          <Button onClick={() => handleSyncCoupons("full-sync")} variant="outline" className="gap-2" disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Sincronizar
          </Button>
          <Button onClick={loadCoupons} variant="ghost" size="icon" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <InitialSyncProgress integrationId={integrationId} onSyncComplete={loadCoupons} />

      {isSyncing && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Sincronizando cupons{integrationName ? ` de ${integrationName}` : ""}...</p>
                {syncProgress && (
                  <>
                    <Progress value={(syncProgress.synced / syncProgress.total) * 100} className="mt-2 h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{syncProgress.synced} de {syncProgress.total} processados</p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <CouponsStatsCards stats={stats} formatCurrency={formatCurrency} onClickValue={() => setShowSalesDialog(true)} />

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por código, nome, email, telefone ou pedido..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="campaign">Campanhas e manuais</SelectItem>
            <SelectItem value="cashback">Cashback (automáticos)</SelectItem>
            <SelectItem value="email">E-mail marketing</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="used">Utilizados</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
            <SelectItem value="expired">Expirados / Limite</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead><TableHead>Origem</TableHead><TableHead>Cliente</TableHead>
              <TableHead className="text-center">Desconto</TableHead><TableHead className="text-center">Usos</TableHead><TableHead>Validade</TableHead>
              <TableHead className="text-center">Status</TableHead><TableHead className="text-right">Valor Convertido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Carregando cupons...</p></TableCell></TableRow>
            ) : filteredCoupons.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-10"><Ticket className="h-10 w-10 mx-auto text-muted-foreground/50" /><p className="mt-2 text-sm text-muted-foreground">{searchTerm || statusFilter !== "all" || sourceFilter !== "all" ? "Nenhum cupom encontrado com os filtros aplicados" : "Nenhum cupom por aqui. Clique em \"Sincronizar\" para importar da loja."}</p></TableCell></TableRow>
            ) : visibleCoupons.map((coupon) => {
              const status = getCouponStatus(coupon);
              const source = getCouponSource(coupon.source);
              return (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <code className="px-2 py-1 rounded bg-muted font-mono text-sm font-semibold">{coupon.coupon_code}</code>
                    {coupon.coupon_description && coupon.coupon_description.toLowerCase() !== coupon.coupon_code.toLowerCase() && <p className="text-xs text-muted-foreground mt-1 max-w-[220px] truncate">{coupon.coupon_description}</p>}
                  </TableCell>
                  <TableCell><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${source.className}`}>{sourceIconMap[coupon.source || "cashback"] || sourceIconMap.cashback}{source.label}</span></TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      {coupon.customer_name && <span className="text-sm font-medium">{coupon.customer_name}</span>}
                      {coupon.customer_email && <span className="text-xs text-muted-foreground">{coupon.customer_email}</span>}
                      {coupon.customer_phone && <span className="text-xs text-muted-foreground">{formatPhone(coupon.customer_phone)}</span>}
                      {!coupon.customer_name && !coupon.customer_email && !coupon.customer_phone && <span className="text-sm text-muted-foreground">-</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{discountLabel(coupon)}</Badge>
                    {coupon.li_valor_minimo ? <p className="text-xs text-muted-foreground mt-0.5">mín. {formatCurrency(coupon.li_valor_minimo)}</p> : null}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {coupon.li_quantidade_usada ?? 0}<span className="text-muted-foreground"> / {coupon.li_quantidade_uso_maximo ?? "∞"}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(coupon.expires_at)}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Badge variant={status.variant} className="gap-1">{statusIconMap[status.icon]}{status.label}</Badge>
                      {canToggle && coupon.li_coupon_id && coupon.li_ativo != null && status.code !== "used" && (
                        <Switch checked={coupon.li_ativo} onCheckedChange={(v) => toggleCoupon(coupon, v)} aria-label={coupon.li_ativo ? "Desativar cupom" : "Ativar cupom"} />
                      )}
                    </div>
                    {coupon.used_at && status.code === "used" && <p className="text-xs text-muted-foreground mt-1">{formatDate(coupon.used_at)}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    {coupon.used_order_value ? <span className="text-sm font-semibold text-green-600">{formatCurrency(coupon.used_order_value)}</span> : <span className="text-sm text-muted-foreground">-</span>}
                    {coupon.used_in_order_id && <p className="text-xs text-muted-foreground">Pedido #{coupon.used_in_order_id}</p>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filteredCoupons.length > 0 && <p className="text-sm text-muted-foreground text-center">{filteredCoupons.length > visibleCoupons.length ? `Mostrando ${visibleCoupons.length} dos ${filteredCoupons.length} cupons deste filtro. Use a busca para achar os demais.` : `Mostrando ${filteredCoupons.length} de ${coupons.length} cupons`}</p>}

      <CouponsSalesDialog open={showSalesDialog} onOpenChange={setShowSalesDialog} usedCoupons={usedCoupons} totalGeneratedValue={stats.totalGeneratedValue} formatCurrency={formatCurrency} />

      <CreateCouponDialog integrationId={integrationId} integrationType={integrationType} open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={loadCoupons} />
    </div>
  );
};
