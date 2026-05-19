import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncProgressBanner } from "@/components/common/SyncProgressBanner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, RefreshCw, Search, Users, ChevronLeft, ChevronRight, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";
import { NuvemshopClientDetailsDialog } from "./NuvemshopClientDetailsDialog";

const log = createLogger("NuvemshopClientsContent");

interface Props { integrationId: string; }

const fmtCurrency = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yy", { locale: ptBR }); } catch { return "—"; }
};

export function NuvemshopClientsContent({ integrationId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: integration } = useQuery({
    queryKey: ["integration-info", integrationId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("name, last_sync_at").eq("id", integrationId).single();
      return data;
    },
  });

  const { data: totalCount, refetch: refetchCount } = useQuery({
    queryKey: ["ns-clients-count", integrationId, search],
    queryFn: async () => {
      let q = supabase.from("nuvemshop_customers").select("id", { count: "exact", head: true }).eq("integration_id", integrationId);
      if (search.trim()) {
        const t = `%${search.trim()}%`;
        q = q.or(`name.ilike.${t},email.ilike.${t},phone.ilike.${t},doc.ilike.${t}`);
      }
      const { count } = await q;
      return count ?? 0;
    },
  });

  const { data: customers, isLoading, refetch: refetchCustomers } = useQuery({
    queryKey: ["ns-clients", integrationId, page, pageSize, search],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase
        .from("nuvemshop_customers")
        .select("id, name, email, phone, doc, total_spent, total_orders, updated_at_remote")
        .eq("integration_id", integrationId)
        .order("name", { ascending: true })
        .range(from, to);
      if (search.trim()) {
        const t = `%${search.trim()}%`;
        q = q.or(`name.ilike.${t},email.ilike.${t},phone.ilike.${t},doc.ilike.${t}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ns-customers-${integrationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nuvemshop_customers", filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { refetchCustomers(); refetchCount(); }, 600);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [integrationId, refetchCustomers, refetchCount]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("nuvemshop-sync", { body: { integrationId, syncType: "customers" } });
      if (error) throw error;
      toast.success("Sincronização de clientes iniciada");
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-600" />
              {integration?.name ?? "Nuvemshop"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {totalCount?.toLocaleString("pt-BR") ?? "—"} clientes
              {integration?.last_sync_at && ` · sync ${fmtDate(integration.last_sync_at)}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          Sincronizar
        </Button>
      </div>

      <SyncProgressBanner integrationId={integrationId} entityType="customers" nuvemshop />

      {/* Search + page size */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, e-mail, telefone…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[15, 30, 50].map(n => <SelectItem key={n} value={String(n)}>{n}/pág</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Total gasto</TableHead>
              <TableHead>Última atualização</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : customers?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                  {search ? "Nenhum cliente encontrado." : "Nenhum cliente sincronizado ainda."}
                </TableCell>
              </TableRow>
            ) : customers?.map(c => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedClient(c)}>
                <TableCell className="font-medium">{c.name ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {c.email && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{c.email}</span>}
                    {c.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{c.phone}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.doc ?? "—"}</TableCell>
                <TableCell className="text-right">{c.total_orders ?? 0}</TableCell>
                <TableCell className="text-right font-medium">{fmtCurrency(c.total_spent)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(c.updated_at_remote)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <NuvemshopClientDetailsDialog
        client={selectedClient}
        open={!!selectedClient}
        onOpenChange={(o) => { if (!o) setSelectedClient(null); }}
      />

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
