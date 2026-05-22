import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { createLogger } from "@/lib/logger";

const log = createLogger("CouponsContent");

export interface GeneratedCoupon {
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

export interface CouponStats {
  total: number; used: number; expired: number; active: number;
  totalGeneratedValue: number; conversionRate: number; imported: number; cashback: number;
}

export interface UsedCouponInfo { coupon: GeneratedCoupon; orderValue: number; }

const COUPON_SELECT = "id, config_id, coupon_code, coupon_description, coupon_type, coupon_value, created_at, customer_cpf, customer_email, customer_name, customer_phone, discount_percentage, expires_at, integration_id, li_coupon_id, li_data_fim, li_data_inicio, li_quantidade_usada, li_quantidade_uso_maximo, order_id, source, tenant_id, used_at, used_in_order_id, used_order_value";

export function useCouponsData(integrationId: string) {
  const [coupons, setCoupons] = useState<GeneratedCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ synced: number; total: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [integrationName, setIntegrationName] = useState("");
  const [integrationType, setIntegrationType] = useState("");
  const [stats, setStats] = useState<CouponStats>({ total: 0, used: 0, expired: 0, active: 0, totalGeneratedValue: 0, conversionRate: 0, imported: 0, cashback: 0 });
  const [showSalesDialog, setShowSalesDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [usedCoupons, setUsedCoupons] = useState<UsedCouponInfo[]>([]);
  const { toast } = useToast();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const calculateStats = (data: GeneratedCoupon[]) => {
    const now = new Date();
    const usedList = data.filter((c) => c.used_at !== null);
    const totalGeneratedValue = usedList.reduce((acc, c) => acc + (c.used_order_value || 0), 0);
    setStats({
      total: data.length, used: usedList.length,
      expired: data.filter((c) => !c.used_at && (new Date(c.expires_at) < now || (c.li_quantidade_uso_maximo != null && (c.li_quantidade_usada ?? 0) >= c.li_quantidade_uso_maximo))).length,
      active: data.filter((c) => !c.used_at && new Date(c.expires_at) >= now && (c.li_quantidade_uso_maximo == null || (c.li_quantidade_usada ?? 0) < c.li_quantidade_uso_maximo)).length,
      totalGeneratedValue, conversionRate: data.length > 0 ? (usedList.length / data.length) * 100 : 0,
      imported: data.filter((c) => c.source === "imported").length,
      cashback: data.filter((c) => c.source === "cashback" || !c.source).length,
    });
    setUsedCoupons(usedList.map((c) => ({ coupon: c, orderValue: c.used_order_value || 0 })));
  };

  const loadCoupons = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("generated_coupons").select(COUPON_SELECT).eq("integration_id", integrationId).order("created_at", { ascending: false });
      if (error) throw error;
      setCoupons(data || []);
      calculateStats(data || []);
    } catch (error) {
      log.error("Error loading coupons:", error);
      toast({ title: "Erro ao carregar cupons", description: "Não foi possível carregar o histórico de cupons.", variant: "destructive" });
    } finally { setIsLoading(false); }
  }, [integrationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const silentRefresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("generated_coupons").select(COUPON_SELECT).eq("integration_id", integrationId).order("created_at", { ascending: false });
      if (!error && data) { setCoupons(data); calculateStats(data); }
    } catch (error) { log.error("Error in silent refresh:", error); }
  }, [integrationId]);

  useEffect(() => {
    const { data: integData } = supabase.from("integrations").select("name, type").eq("id", integrationId).single().then(({ data }) => {
      if (data) { setIntegrationName(data.name); setIntegrationType(data.type || ""); }
      return { data };
    });
    loadCoupons();
  }, [integrationId, loadCoupons]);

  useEffect(() => {
    const channel = supabase.channel(`coupons-realtime-${integrationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "generated_coupons", filter: `integration_id=eq.${integrationId}` }, () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => silentRefresh(), 500);
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
      const newCount = data.new ?? data.synced ?? 0;
      toast({ title: "Sincronização concluída", description: `${newCount} cupons importados, ${data.updated ?? 0} atualizados` });
      loadCoupons();
    } catch (error) {
      log.error("Error syncing coupons:", error);
      toast({ title: "Erro na sincronização", description: `Não foi possível sincronizar os cupons${integrationName ? ` de ${integrationName}` : ""}.`, variant: "destructive" });
    } finally { setIsSyncing(false); setSyncProgress(null); }
  };

  const getCouponStatus = (coupon: GeneratedCoupon): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: string } => {
    if (coupon.used_at) return { label: "Utilizado", variant: "default", icon: "check" };
    const now = new Date();
    if (new Date(coupon.expires_at) < now) return { label: "Expirado", variant: "destructive", icon: "x" };
    if (coupon.li_quantidade_uso_maximo != null && (coupon.li_quantidade_usada ?? 0) >= coupon.li_quantidade_uso_maximo) return { label: "Limite atingido", variant: "destructive", icon: "x" };
    return { label: "Ativo", variant: "secondary", icon: "clock" };
  };

  const getCouponSource = (source?: string): { label: string; className: string } => {
    switch (source) {
      case "imported": return { label: "Importado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" };
      case "manual": return { label: "Manual", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
      default: return { label: "Cashback", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
    }
  };

  const filteredCoupons = coupons.filter((coupon) => {
    const matchesSearch = coupon.coupon_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (coupon.customer_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (coupon.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (coupon.customer_phone?.includes(searchTerm)) ||
      (coupon.order_id?.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchesSearch) return false;
    if (sourceFilter !== "all" && (coupon.source || "cashback") !== sourceFilter) return false;
    if (statusFilter !== "all") {
      const status = getCouponStatus(coupon);
      if (statusFilter === "used" && status.label !== "Utilizado") return false;
      if (statusFilter === "expired" && !["Expirado", "Limite atingido"].includes(status.label)) return false;
      if (statusFilter === "active" && status.label !== "Ativo") return false;
    }
    return true;
  });

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const formatPhone = (phone: string | null) => { if (!phone) return "-"; const c = phone.replace(/\D/g, ""); return c.length === 13 ? `(${c.slice(2, 4)}) ${c.slice(4, 9)}-${c.slice(9)}` : phone; };
  const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return {
    coupons, filteredCoupons, isLoading, isSyncing, syncProgress,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, sourceFilter, setSourceFilter,
    integrationName, integrationType, stats, usedCoupons,
    showSalesDialog, setShowSalesDialog, showCreateDialog, setShowCreateDialog,
    loadCoupons, handleSyncCoupons, getCouponStatus, getCouponSource,
    formatDate, formatPhone, formatCurrency,
  };
}
