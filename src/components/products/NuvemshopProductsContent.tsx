import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncProgressBanner } from "@/components/common/SyncProgressBanner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, RefreshCw, Search, Package, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const log = createLogger("NuvemshopProductsContent");

interface Props { integrationId: string; }

const fmtCurrency = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export function NuvemshopProductsContent({ integrationId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [isSyncing, setIsSyncing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: integration } = useQuery({
    queryKey: ["integration-info", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("name, last_sync_at").eq("id", integrationId).single();
      return data;
    },
  });

  const buildBaseQuery = () => {
    let q = supabase.from("nuvemshop_products").select("id, name, sku, price, promotional_price, stock, active, image_url, updated_at_remote").eq("integration_id", integrationId);
    if (filterActive === "active") q = q.eq("active", true);
    if (filterActive === "inactive") q = q.eq("active", false);
    if (search.trim()) q = q.or(`name.ilike.%${search.trim()}%,sku.ilike.%${search.trim()}%`);
    return q;
  };

  const { data: totalCount, refetch: refetchCount } = useQuery({
    queryKey: ["ns-products-count", integrationId, search, filterActive],
    queryFn: async () => {
      const { count } = await buildBaseQuery().select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: products, isLoading, refetch: refetchProducts } = useQuery({
    queryKey: ["ns-products", integrationId, page, pageSize, search, filterActive],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await buildBaseQuery().order("name", { ascending: true }).range(from, to);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ns-products-${integrationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nuvemshop_products", filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { refetchProducts(); refetchCount(); }, 600);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [integrationId, refetchProducts, refetchCount]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("nuvemshop-sync", { body: { integrationId, syncType: "products" } });
      if (error) throw error;
      toast.success("Sincronização de produtos iniciada");
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Package className="h-5 w-5 text-sky-600" />
              {integration?.name ?? "Nuvemshop"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {totalCount?.toLocaleString("pt-BR") ?? "—"} produtos
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          Sincronizar
        </Button>
      </div>

      <SyncProgressBanner integrationId={integrationId} entityType="products" nuvemshop />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, SKU…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={filterActive} onValueChange={v => { setFilterActive(v as typeof filterActive); setPage(1); }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[12, 24, 48].map(n => <SelectItem key={n} value={String(n)}>{n}/pág</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: pageSize }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : products?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mb-3 opacity-30" />
          <p>{search ? "Nenhum produto encontrado." : "Nenhum produto sincronizado ainda."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {products?.map(p => (
            <div key={p.id} className="rounded-lg border bg-card overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name ?? ""} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <ImageOff className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>
              <div className="p-2 flex flex-col gap-1 flex-1">
                <p className="text-xs font-medium line-clamp-2 leading-tight">{p.name ?? "—"}</p>
                {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                <div className="mt-auto flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold">
                    {p.promotional_price && p.promotional_price < (p.price ?? Infinity)
                      ? fmtCurrency(p.promotional_price)
                      : fmtCurrency(p.price)}
                  </span>
                  <Badge variant={p.active ? "default" : "secondary"} className="text-[10px] px-1 py-0">
                    {p.active ? `Est: ${p.stock ?? 0}` : "Inativo"}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
