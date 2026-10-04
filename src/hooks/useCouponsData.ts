import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { createLogger } from "@/lib/logger";
import { type GeneratedCoupon, getCouponStatus, getCouponSource, matchesSource, formatDate, formatPhone, formatCurrency } from "@/hooks/couponsHelpers";

export type { GeneratedCoupon } from "@/hooks/couponsHelpers";
const log = createLogger("CouponsContent");

export interface CouponStats {
  total: number; used: number; expired: number; active: number; inactive: number;
  totalGeneratedValue: number; conversionRate: number; imported: number; cashback: number;
}
export interface UsedCouponInfo { coupon: GeneratedCoupon; orderValue: number; }

const COUPON_SELECT = "id, config_id, coupon_code, coupon_description, coupon_type, coupon_value, created_at, customer_cpf, customer_email, customer_name, customer_phone, discount_percentage, expires_at, integration_id, li_coupon_id, li_data_fim, li_data_inicio, li_quantidade_usada, li_quantidade_uso_maximo, li_quantidade_por_cliente, li_valor_minimo, li_ativo, order_id, source, tenant_id, used_at, used_in_order_id, used_order_value";
const PAGE = 1000; // o servidor entrega no máximo 1000 linhas por consulta

/** Traz todos os cupons da integração, página a página (a loja tem milhares). */
async function fetchAll(integrationId: string): Promise<GeneratedCoupon[]> {
  const all: GeneratedCoupon[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("generated_coupons").select(COUPON_SELECT).eq("integration_id", integrationId)
      .order("li_coupon_id", { ascending: false, nullsFirst: true }).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as GeneratedCoupon[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export function useCouponsData(integrationId: string) {
  const [coupons, setCoupons] = useState<GeneratedCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("campaign");
  const [integrationName, setIntegrationName] = useState("");
  const [integrationType, setIntegrationType] = useState("");
  const [stats, setStats] = useState<CouponStats>({ total: 0, used: 0, expired: 0, active: 0, inactive: 0, totalGeneratedValue: 0, conversionRate: 0, imported: 0, cashback: 0 });
  const [showSalesDialog, setShowSalesDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [usedCoupons, setUsedCoupons] = useState<UsedCouponInfo[]>([]);
  const { toast } = useToast();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculateStats = (data: GeneratedCoupon[]) => {
    const now = new Date();
    const codes = data.map((c) => getCouponStatus(c, now).code);
    const usedList = data.filter((c, i) => codes[i] === "used");
    const totalGeneratedValue = usedList.reduce((acc, c) => acc + (c.used_order_value || 0), 0);
    setStats({
      total: data.length, used: usedList.length,
      expired: codes.filter((c) => c === "expired" || c === "limit_reached").length,
      active: codes.filter((c) => c === "active").length,
      inactive: codes.filter((c) => c === "inactive").length,
      totalGeneratedValue, conversionRate: data.length > 0 ? (usedList.length / data.length) * 100 : 0,
      imported: data.filter((c) => c.source !== "cashback" && !!c.source).length,
      cashback: data.filter((c) => c.source === "cashback" || !c.source).length,
    });
    setUsedCoupons(usedList.map((c) => ({ coupon: c, orderValue: c.used_order_value || 0 })));
  };

  const apply = (data: GeneratedCoupon[]) => { setCoupons(data); calculateStats(data); };

  const loadCoupons = useCallback(async () => {
    setIsLoading(true);
    try { apply(await fetchAll(integrationId)); }
    catch (error) {
      log.error("Error loading coupons:", error);
      toast({ title: "Erro ao carregar cupons", description: "Não foi possível carregar o histórico de cupons.", variant: "destructive" });
    } finally { setIsLoading(false); }
  }, [integrationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const silentRefresh = useCallback(async () => {
    try { apply(await fetchAll(integrationId)); } catch (error) { log.error("Error in silent refresh:", error); }
  }, [integrationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from("integrations").select("name, type").eq("id", integrationId).single();
        if (cancelled) return;
        if (error) { log.error("Error loading integration info:", error); return; }
        if (data) { setIntegrationName(data.name); setIntegrationType(data.type || ""); }
      } catch (e) { if (!cancelled) log.error("Error loading integration info:", e); }
    })();
    loadCoupons();
    return () => { cancelled = true; };
  }, [integrationId, loadCoupons]);

  useEffect(() => {
    const channel = supabase.channel(`coupons-realtime-${integrationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "generated_coupons", filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => silentRefresh(), 1500);
      }).subscribe();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [integrationId, silentRefresh]);

  const handleSyncCoupons = async (action: "full-sync" | "check-new" = "full-sync") => {
    setIsSyncing(true);
    setSyncProgress(null);
    try {
      const syncFunction = integrationType === "bling" ? "bling-coupon-sync" : integrationType === "nuvemshop" ? "nuvemshop-coupon-sync" : "li-coupon-sync";
      const { data, error } = await supabase.functions.invoke(syncFunction, { body: { integrationId, action } });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error);
      const done = data.synced ?? data.new ?? 0;
      toast({
        title: data.partial ? "Sincronização parcial" : "Sincronização concluída",
        description: data.partial ? `${done} cupons atualizados de ${data.totalInApi}. Sincronize de novo para continuar.` : `${done} cupons atualizados${data.totalInApi ? ` (a loja tem ${data.totalInApi})` : ""}.`,
      });
      loadCoupons();
    } catch (error) {
      log.error("Error syncing coupons:", error);
      toast({ title: "Erro na sincronização", description: `Não foi possível sincronizar os cupons${integrationName ? ` de ${integrationName}` : ""}.`, variant: "destructive" });
    } finally { setIsSyncing(false); setSyncProgress(null); }
  };

  /** Ativa ou desativa o cupom na própria loja (só Loja Integrada). */
  const toggleCoupon = async (coupon: GeneratedCoupon, ativo: boolean) => {
    const { data, error } = await supabase.functions.invoke("li-coupon-update", { body: { integrationId, couponId: coupon.id, ativo } });
    if (error || data?.success === false) {
      toast({ title: "Não foi possível alterar o cupom", description: data?.error || "Tente de novo em instantes.", variant: "destructive" });
      return;
    }
    setCoupons((prev) => { const next = prev.map((c) => (c.id === coupon.id ? { ...c, li_ativo: ativo } : c)); calculateStats(next); return next; });
    toast({ title: ativo ? "Cupom ativado" : "Cupom desativado", description: `${coupon.coupon_code} agora está ${ativo ? "valendo" : "inativo"} na loja.` });
  };

  const search = searchTerm.toLowerCase();
  const filteredCoupons = coupons.filter((coupon) => {
    const matchesSearch = !search || coupon.coupon_code.toLowerCase().includes(search) || coupon.customer_name?.toLowerCase().includes(search) ||
      coupon.customer_email?.toLowerCase().includes(search) || coupon.customer_phone?.includes(searchTerm) || coupon.order_id?.toLowerCase().includes(search) ||
      coupon.coupon_description?.toLowerCase().includes(search);
    if (!matchesSearch || !matchesSource(coupon, sourceFilter)) return false;
    if (statusFilter !== "all") {
      const { code } = getCouponStatus(coupon);
      if (statusFilter === "expired") return code === "expired" || code === "limit_reached";
      return code === statusFilter;
    }
    return true;
  });

  return {
    coupons, filteredCoupons, isLoading, isSyncing, syncProgress,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, sourceFilter, setSourceFilter,
    integrationName, integrationType, stats, usedCoupons,
    showSalesDialog, setShowSalesDialog, showCreateDialog, setShowCreateDialog,
    loadCoupons, handleSyncCoupons, toggleCoupon, getCouponStatus, getCouponSource,
    formatDate, formatPhone, formatCurrency,
  };
}
