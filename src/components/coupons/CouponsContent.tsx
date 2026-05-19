import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Ticket, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Percent,
  Filter,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  ArrowLeft,
  Download,
  Gift,
  Loader2,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreateCouponDialog } from "./CreateCouponDialog";
import { DeleteIntegrationDataButton } from "@/components/common/DeleteIntegrationDataButton";
import { InitialSyncProgress } from "@/components/common/InitialSyncProgress";
import { SyncStatusBadge } from "@/components/common/SyncStatusBadge";

import { createLogger } from '@/lib/logger';
const log = createLogger('CouponsContent');

interface CouponsContentProps {
  integrationId: string;
}

interface GeneratedCoupon {
  id: string;
  coupon_code: string;
  discount_percentage: number;
  coupon_value: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  order_id: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_in_order_id: string | null;
  used_order_value: number | null;
  config_id: string | null;
  integration_id: string | null;
  source?: string;
  li_coupon_id?: number;
  coupon_type?: string;
  li_quantidade_usada?: number | null;
  li_quantidade_uso_maximo?: number | null;
}

interface CouponStats {
  total: number;
  used: number;
  expired: number;
  active: number;
  totalGeneratedValue: number;
  conversionRate: number;
  imported: number;
  cashback: number;
}

interface UsedCouponInfo {
  coupon: GeneratedCoupon;
  orderValue: number;
}

export const CouponsContent = ({ integrationId }: CouponsContentProps) => {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<GeneratedCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [integrationName, setIntegrationName] = useState<string>("");
  const [integrationType, setIntegrationType] = useState<string>("");
  const [stats, setStats] = useState<CouponStats>({ 
    total: 0, 
    used: 0, 
    expired: 0, 
    active: 0,
    totalGeneratedValue: 0,
    conversionRate: 0,
    imported: 0,
    cashback: 0
  });
  const [showSalesDialog, setShowSalesDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [usedCoupons, setUsedCoupons] = useState<UsedCouponInfo[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadIntegrationName();
    loadCoupons();
  }, [integrationId]);

  // Silent refresh function - updates data without loading spinner
  const silentRefresh = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('generated_coupons')
        .select('id, config_id, coupon_code, coupon_description, coupon_type, coupon_value, created_at, customer_cpf, customer_email, customer_name, customer_phone, discount_percentage, expires_at, integration_id, li_coupon_id, li_data_fim, li_data_inicio, li_quantidade_usada, li_quantidade_uso_maximo, order_id, source, tenant_id, used_at, used_in_order_id, used_order_value')
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCoupons(data);
        calculateStats(data);
      }
    } catch (error) {
      log.error('Error in silent refresh:', error);
    }
  }, [integrationId]);

  // Debounce ref for realtime updates
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to realtime changes with debounce
  useEffect(() => {
    const channel = supabase
      .channel(`coupons-realtime-${integrationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'generated_coupons',
          filter: `integration_id=eq.${integrationId}`
        },
        () => {
          // Debounce to avoid multiple refetches during batch syncs
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            silentRefresh();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [integrationId, silentRefresh]);

  const loadIntegrationName = async () => {
    const { data } = await supabase
      .from('integrations')
      .select('name, type')
      .eq('id', integrationId)
      .single();

    if (data) {
      setIntegrationName(data.name);
      setIntegrationType(data.type || '');
    }
  };

  const loadCoupons = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('generated_coupons')
        .select('id, config_id, coupon_code, coupon_description, coupon_type, coupon_value, created_at, customer_cpf, customer_email, customer_name, customer_phone, discount_percentage, expires_at, integration_id, li_coupon_id, li_data_fim, li_data_inicio, li_quantidade_usada, li_quantidade_uso_maximo, order_id, source, tenant_id, used_at, used_in_order_id, used_order_value')
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCoupons(data || []);
      calculateStats(data || []);
    } catch (error) {
      log.error('Error loading coupons:', error);
      toast({
        title: "Erro ao carregar cupons",
        description: "Não foi possível carregar o histórico de cupons.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStats = (data: GeneratedCoupon[]) => {
    const now = new Date();
    const usedCouponsList = data.filter(c => c.used_at !== null);
    const totalGeneratedValue = usedCouponsList.reduce((acc, c) => acc + (c.used_order_value || 0), 0);
    
    const stats: CouponStats = {
      total: data.length,
      used: usedCouponsList.length,
      expired: data.filter(c => !c.used_at && (new Date(c.expires_at) < now || (c.li_quantidade_uso_maximo != null && (c.li_quantidade_usada ?? 0) >= c.li_quantidade_uso_maximo))).length,
      active: data.filter(c => !c.used_at && new Date(c.expires_at) >= now && (c.li_quantidade_uso_maximo == null || (c.li_quantidade_usada ?? 0) < c.li_quantidade_uso_maximo)).length,
      totalGeneratedValue,
      conversionRate: data.length > 0 ? (usedCouponsList.length / data.length) * 100 : 0,
      imported: data.filter(c => c.source === 'imported').length,
      cashback: data.filter(c => c.source === 'cashback' || !c.source).length
    };
    setStats(stats);

    const usedCouponsInfo: UsedCouponInfo[] = usedCouponsList.map(c => ({
      coupon: c,
      orderValue: c.used_order_value || 0
    }));
    setUsedCoupons(usedCouponsInfo);
  };

  const handleSyncCoupons = async (action: 'full-sync' | 'check-new' = 'full-sync') => {
    setIsSyncing(true);
    setSyncProgress(null);
    
    try {
      const syncFunction = integrationType === 'bling' ? 'bling-coupon-sync' : integrationType === 'nuvem_shop' ? 'nuvemshop-coupon-sync' : 'li-coupon-sync';
      const { data, error } = await supabase.functions.invoke(syncFunction, {
        body: { integrationId, action }
      });

      if (error) throw error;

      const newCount = data.new ?? data.synced ?? 0;
      toast({
        title: "Sincronização concluída",
        description: `${newCount} cupons importados, ${data.updated ?? 0} atualizados`,
      });

      loadCoupons();
    } catch (error) {
      log.error('Error syncing coupons:', error);
      toast({
        title: "Erro na sincronização",
        description: `Não foi possível sincronizar os cupons${integrationName ? ` de ${integrationName}` : ''}.`,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  const getCouponSource = (source?: string): { label: string; icon: React.ReactNode; className: string } => {
    switch (source) {
      case 'imported':
        return { label: 'Importado', icon: <Download className="h-3 w-3" />, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' };
      case 'manual':
        return { label: 'Manual', icon: <Ticket className="h-3 w-3" />, className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
      default:
        return { label: 'Cashback', icon: <Gift className="h-3 w-3" />, className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' };
    }
  };

  const getCouponStatus = (coupon: GeneratedCoupon): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode } => {
    if (coupon.used_at) {
      return { label: "Utilizado", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> };
    }

    const now = new Date();
    const expiresAt = new Date(coupon.expires_at);

    if (expiresAt < now) {
      return { label: "Expirado", variant: "destructive", icon: <XCircle className="h-3 w-3" /> };
    }

    if (
      coupon.li_quantidade_uso_maximo != null &&
      (coupon.li_quantidade_usada ?? 0) >= coupon.li_quantidade_uso_maximo
    ) {
      return { label: "Limite atingido", variant: "destructive", icon: <XCircle className="h-3 w-3" /> };
    }

    return { label: "Ativo", variant: "secondary", icon: <Clock className="h-3 w-3" /> };
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = 
      coupon.coupon_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (coupon.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (coupon.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (coupon.customer_phone?.includes(searchTerm)) ||
      (coupon.order_id?.toLowerCase().includes(searchTerm.toLowerCase()));

    // Source filter
    if (sourceFilter !== "all") {
      const couponSource = coupon.source || 'cashback';
      if (sourceFilter !== couponSource) return false;
    }

    // Status filter
    if (statusFilter !== "all") {
      const status = getCouponStatus(coupon);
      if (statusFilter === "used" && status.label !== "Utilizado") return false;
      if (statusFilter === "expired" && !["Expirado", "Limite atingido"].includes(status.label)) return false;
      if (statusFilter === "active" && status.label !== "Ativo") return false;
    }
    
    return matchesSearch;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `(${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/coupons')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Cupons {integrationName && `- ${integrationName}`}
            </h1>
            <p className="text-muted-foreground">Histórico de cupons da loja</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SyncStatusBadge
            integrationId={integrationId}
            syncType="coupons"
          />
          <DeleteIntegrationDataButton
            integrationId={integrationId}
            dataType="cupons"
            tablesToDelete={[{ table: 'generated_coupons' }]}
            onDeleted={loadCoupons}
          />
          <Button 
            onClick={() => setShowCreateDialog(true)} 
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Criar Cupom
          </Button>
          <Button 
            onClick={() => handleSyncCoupons('full-sync')} 
            variant="outline" 
            className="gap-2" 
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Sincronizar
          </Button>
          <Button onClick={loadCoupons} variant="ghost" size="icon" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Initial Sync Progress */}
      <InitialSyncProgress 
        integrationId={integrationId}
        onSyncComplete={loadCoupons}
      />

      {/* Sync Progress */}
      {isSyncing && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Sincronizando cupons{integrationName ? ` de ${integrationName}` : ''}...</p>
                {syncProgress && (
                  <>
                    <Progress value={(syncProgress.synced / syncProgress.total) * 100} className="mt-2 h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {syncProgress.synced} de {syncProgress.total} processados
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Gerados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{stats.total}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <span className="text-2xl font-bold">{stats.active}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utilizados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{stats.used}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expirados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="text-2xl font-bold">{stats.expired}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
        <Card 
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => setShowSalesDialog(true)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Valor Gerado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <span className="text-xl font-bold text-green-600">
                {formatCurrency(stats.totalGeneratedValue)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Clique para ver detalhes</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código, nome, email, telefone ou pedido..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            <SelectItem value="cashback">Cashback</SelectItem>
            <SelectItem value="imported">Importado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="used">Utilizados</SelectItem>
            <SelectItem value="expired">Expirados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-center">Desconto</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Valor Convertido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">Carregando cupons...</p>
                </TableCell>
              </TableRow>
            ) : filteredCoupons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <Ticket className="h-10 w-10 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {searchTerm || statusFilter !== "all" || sourceFilter !== "all"
                      ? "Nenhum cupom encontrado com os filtros aplicados" 
                      : "Nenhum cupom gerado ainda. Clique em \"Sincronizar Cupons\" para importar."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredCoupons.map((coupon) => {
                const status = getCouponStatus(coupon);
                const source = getCouponSource(coupon.source);
                return (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <code className="px-2 py-1 rounded bg-muted font-mono text-sm font-semibold">
                        {coupon.coupon_code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${source.className}`}>
                        {source.icon}
                        {source.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {coupon.customer_name && (
                          <span className="text-sm font-medium">{coupon.customer_name}</span>
                        )}
                        {coupon.customer_email && (
                          <span className="text-xs text-muted-foreground">{coupon.customer_email}</span>
                        )}
                        {coupon.customer_phone && (
                          <span className="text-xs text-muted-foreground">
                            {formatPhone(coupon.customer_phone)}
                          </span>
                        )}
                        {!coupon.customer_name && !coupon.customer_email && !coupon.customer_phone && (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="gap-1">
                        <Percent className="h-3 w-3" />
                        {coupon.discount_percentage}%
                      </Badge>
                      {coupon.coupon_value && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatCurrency(coupon.coupon_value)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(coupon.expires_at)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={status.variant} className="gap-1">
                        {status.icon}
                        {status.label}
                      </Badge>
                      {coupon.used_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(coupon.used_at)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {coupon.used_order_value ? (
                        <span className="text-sm font-semibold text-green-600">
                          {formatCurrency(coupon.used_order_value)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                      {coupon.used_in_order_id && (
                        <p className="text-xs text-muted-foreground">
                          Pedido #{coupon.used_in_order_id}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      {filteredCoupons.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Mostrando {filteredCoupons.length} de {coupons.length} cupons
        </p>
      )}

      {/* Sales Dialog */}
      <Dialog open={showSalesDialog} onOpenChange={setShowSalesDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              Vendas Geradas com Cashback
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            {usedCoupons.length === 0 ? (
              <div className="text-center py-10">
                <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhum cupom utilizado ainda
                </p>
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
                      <TableCell>
                        <code className="px-2 py-1 rounded bg-muted font-mono text-sm">
                          {coupon.coupon_code}
                        </code>
                      </TableCell>
                      <TableCell>{coupon.customer_name || '-'}</TableCell>
                      <TableCell>#{coupon.used_in_order_id}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(orderValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="border-t pt-4 mt-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Total de vendas: {usedCoupons.length}
              </span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(stats.totalGeneratedValue)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Coupon Dialog */}
      <CreateCouponDialog
        integrationId={integrationId}
        integrationType={integrationType}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={loadCoupons}
      />
    </div>
  );
};
