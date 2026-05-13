import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncProgressBanner } from "@/components/common/SyncProgressBanner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, RefreshCw, Search, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const log = createLogger("NuvemshopSalesContent");

interface Props { integrationId: string; }

type Json = Record<string, unknown>;

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open:      { label: "Aberto",     variant: "default" },
  closed:    { label: "Fechado",    variant: "secondary" },
  cancelled: { label: "Cancelado",  variant: "destructive" },
};

const PAYMENT_LABELS: Record<string, { label: string; color: string }> = {
  paid:                 { label: "Pago",            color: "text-green-600" },
  pending:              { label: "Pendente",         color: "text-yellow-600" },
  authorized:           { label: "Autorizado",       color: "text-blue-600" },
  voided:               { label: "Cancelado",        color: "text-red-600" },
  refunded:             { label: "Estornado",        color: "text-red-600" },
  partially_refunded:   { label: "Est. parcial",     color: "text-orange-600" },
  unpaid:               { label: "Não pago",         color: "text-red-600" },
};

const SHIPPING_LABELS: Record<string, { label: string; color: string }> = {
  fulfilled:   { label: "Enviado",     color: "text-green-600" },
  unfulfilled: { label: "Não enviado", color: "text-yellow-600" },
  unpacked:    { label: "Não embalado",color: "text-muted-foreground" },
};

const fmtCurrency = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return "—"; }
};

export function NuvemshopSalesContent({ integrationId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isSyncing, setIsSyncing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: integration } = useQuery({
    queryKey: ["integration-info", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("name, last_sync_at").eq("id", integrationId).single();
      return data;
    },
  });

  const { data: totalCount, refetch: refetchCount } = useQuery({
    queryKey: ["ns-orders-count", integrationId, search],
    queryFn: async () => {
      let q = supabase.from("nuvemshop_orders").select("id", { count: "exact", head: true }).eq("integration_id", integrationId);
      if (search.trim()) q = q.or(`order_number.ilike.%${search.trim()}%,status.ilike.%${search.trim()}%`);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const { data: orders, isLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["ns-orders", integrationId, page, pageSize, search],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("nuvemshop_orders")
        .select("id, order_number, status, payment_status, shipping_status, totals_json, raw_json, created_at_remote")
        .eq("integration_id", integrationId)
        .order("created_at_remote", { ascending: false })
        .range(from, to);
      if (search.trim()) q = q.or(`order_number.ilike.%${search.trim()}%,status.ilike.%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`ns-orders-${integrationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nuvemshop_orders", filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { refetchOrders(); refetchCount(); }, 600);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [integrationId, refetchOrders, refetchCount]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("nuvemshop-sync", { body: { integrationId, syncType: "orders" } });
      if (error) throw error;
      toast.success("Sincronização de pedidos iniciada");
      queryClient.invalidateQueries({ queryKey: ["integration-info", integrationId] });
    } catch (e) {
      log.error("sync error", e);
      toast.error("Erro ao iniciar sincronização");
    } finally {
      setIsSyncing(false);
    }
  };

  const totalPages = Math.ceil((totalCount ?? 0) / pageSize);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sales")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-sky-600" />
              {integration?.name ?? "Nuvemshop"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {totalCount?.toLocaleString("pt-BR") ?? "—"} pedidos
              {integration?.last_sync_at && ` · sync ${fmtDate(integration.last_sync_at)}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          Sincronizar
        </Button>
      </div>

      <SyncProgressBanner integrationId={integrationId} entityType="orders" nuvemshop />

      {/* Search + page size */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar nº pedido, status…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}/pág</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Envio</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : orders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  {search ? "Nenhum pedido encontrado para essa busca." : "Nenhum pedido sincronizado ainda."}
                </TableCell>
              </TableRow>
            ) : orders?.map(order => {
              const totals = order.totals_json as Json | null;
              const raw = order.raw_json as Json | null;
              const customer = raw?.customer as Json | null;
              const customerName = (customer?.name as string) || (customer?.email as string) || "—";
              const statusInfo = STATUS_LABELS[order.status ?? ""] ?? { label: order.status ?? "—", variant: "outline" as const };
              const payInfo = PAYMENT_LABELS[order.payment_status ?? ""];
              const shipInfo = SHIPPING_LABELS[order.shipping_status ?? ""];
              return (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm font-medium">#{order.order_number}</TableCell>
                  <TableCell><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></TableCell>
                  <TableCell><span className={`text-sm ${payInfo?.color ?? "text-muted-foreground"}`}>{payInfo?.label ?? order.payment_status ?? "—"}</span></TableCell>
                  <TableCell><span className={`text-sm ${shipInfo?.color ?? "text-muted-foreground"}`}>{shipInfo?.label ?? order.shipping_status ?? "—"}</span></TableCell>
                  <TableCell className="max-w-[160px] truncate text-sm">{customerName}</TableCell>
                  <TableCell className="text-right font-medium">{fmtCurrency((totals as any)?.total)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(order.created_at_remote)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
