import { useState, useEffect, useCallback, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { MelhorEnvioShipment, ShipmentFilters, GlobalShipmentStats, calculateAverageDeliveryDays } from "./melhor-envio-types";

const logger = createLogger("MelhorEnvio");
function getErrMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

const ME_SHIPMENT_SELECT = "id, integration_id, me_id, order_id, order_number, external_order_number, tracking_code, protocol, status, carrier, service_name, price, discount, weight, height, width, length, format, dimensions, insurance_value, receipt, own_hand, collect, from_address, to_address, tracking_events, receiver_name, receiver_phone, receiver_city, receiver_state, receiver_address, invoice, volumes, products, authorization_code, print_url, preview_url, delivery_min, delivery_max, estimated_delivery_at, paid_at, generated_at, posted_at, delivered_at, created_at, last_sync_at, sender_document, sender_email, sender_phone, receiver_email, receiver_document, receiver_note, agency_name, agency_address, cte_key, contract, billed_weight, non_commercial, conciliation, additional_info, service_details, financial_details, li_order_id, bling_order_id";

export type { MelhorEnvioShipment, ShipmentFilters, GlobalShipmentStats };

export function useMelhorEnvioShipments(filters: ShipmentFilters = {}) {
  const [shipments, setShipments] = useState<MelhorEnvioShipment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [globalStats, setGlobalStats] = useState<GlobalShipmentStats>({
    total: 0, pending: 0, posted: 0, inTransit: 0, delivered: 0, canceled: 0, returning: 0, delayed: 0, totalValue: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;

  const fetchGlobalStats = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      const iq = filters.integrationId ? (q: any) => q.eq("integration_id", filters.integrationId) : (q: any) => q;
      const base = () => supabase.from("me_shipments");
      const [total, pending, posted, inTransit, delivered, canceled, returning, delayed, values] = await Promise.all([
        iq(base().select("id", { count: "exact", head: true })),
        iq(base().select("id", { count: "exact", head: true }).eq("status", "pending")),
        iq(base().select("id", { count: "exact", head: true }).eq("status", "posted")),
        iq(base().select("id", { count: "exact", head: true }).eq("status", "in_transit")),
        iq(base().select("id", { count: "exact", head: true }).eq("status", "delivered")),
        iq(base().select("id", { count: "exact", head: true }).eq("status", "canceled")),
        iq(base().select("id", { count: "exact", head: true }).or("status.eq.returning,status.eq.returned")),
        iq(base().select("id", { count: "exact", head: true }).not("status", "in", '("delivered","canceled")').not("estimated_delivery_at", "is", null).lt("estimated_delivery_at", now)),
        iq(base().select("price")),
      ]);
      setGlobalStats({
        total: total.count || 0, pending: pending.count || 0, posted: posted.count || 0,
        inTransit: inTransit.count || 0, delivered: delivered.count || 0, canceled: canceled.count || 0,
        returning: returning.count || 0, delayed: delayed.count || 0,
        totalValue: (values.data || []).reduce((sum: number, s: any) => sum + (s.price || 0), 0),
      });
    } catch (err) { logger.error("Error fetching global stats", err); }
  }, [filters.integrationId]);

  const fetchShipments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const applyFilters = (query: any) => {
        if (filters.integrationId) query = query.eq("integration_id", filters.integrationId);
        if (filters.delayedOnly) {
          query = query.not("status", "in", '("delivered","canceled")').not("estimated_delivery_at", "is", null).lt("estimated_delivery_at", new Date().toISOString());
        } else if (filters.status && filters.status !== "all") {
          query = query.eq("status", filters.status);
        }
        if (filters.carrier && filters.carrier !== "all") query = query.eq("carrier", filters.carrier);
        if (filters.search) query = query.or(`tracking_code.ilike.%${filters.search}%,order_number.ilike.%${filters.search}%,external_order_number.ilike.%${filters.search}%,protocol.ilike.%${filters.search}%,receiver_name.ilike.%${filters.search}%`);
        if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
        if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
        if (filters.receiverCity) query = query.eq("receiver_city", filters.receiverCity);
        if (filters.receiverState) query = query.eq("receiver_state", filters.receiverState);
        return query;
      };

      const { count } = await applyFilters(supabase.from("me_shipments").select("id", { count: "exact", head: true }));
      setTotalCount(count || 0);

      const from = (page - 1) * pageSize;
      const { data, error: queryError } = await applyFilters(
        supabase.from("me_shipments").select(ME_SHIPMENT_SELECT).order("generated_at", { ascending: false, nullsFirst: false }).range(from, from + pageSize - 1)
      );
      if (queryError) throw queryError;
      setShipments(data || []);
    } catch (err: unknown) {
      logger.error("Error fetching shipments", err);
      setError(getErrMsg(err));
    } finally { setIsLoading(false); }
  }, [filters.status, filters.carrier, filters.search, filters.dateFrom, filters.dateTo, filters.receiverCity, filters.receiverState, filters.integrationId, filters.delayedOnly, page, pageSize]);

  useEffect(() => { fetchShipments(); fetchGlobalStats(); }, [fetchShipments, fetchGlobalStats]);

  const instanceId = useId();
  useEffect(() => {
    const channel = supabase.channel(`me_shipments_changes_${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "me_shipments" }, () => {
        fetchShipments();
        fetchGlobalStats();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [instanceId, fetchShipments, fetchGlobalStats]);

  const carriers = [...new Set(shipments.map((s) => s.carrier).filter(Boolean))];
  const cities = [...new Set(shipments.map((s) => s.receiver_city).filter(Boolean))];
  const states = [...new Set(shipments.map((s) => s.receiver_state).filter(Boolean))];

  const stats = {
    total: shipments.length,
    pending: shipments.filter((s) => s.status === "pending").length,
    posted: shipments.filter((s) => s.status === "posted").length,
    inTransit: shipments.filter((s) => s.status === "in_transit").length,
    delivered: shipments.filter((s) => s.status === "delivered").length,
    canceled: shipments.filter((s) => s.status === "canceled").length,
    returning: shipments.filter((s) => s.status === "returning" || s.status === "returned").length,
    delayed: shipments.filter((s) => s.estimated_delivery_at && !["delivered", "canceled"].includes(s.status || "") && new Date(s.estimated_delivery_at) < new Date()).length,
    totalValue: shipments.reduce((sum, s) => sum + (s.price || 0), 0),
    averageDeliveryDays: calculateAverageDeliveryDays(shipments),
  };

  return {
    shipments, isLoading, error, stats, globalStats, carriers, cities, states,
    totalCount, totalPages: Math.ceil(totalCount / pageSize), currentPage: page, pageSize,
    refetch: useCallback(() => { fetchShipments(); fetchGlobalStats(); }, [fetchShipments, fetchGlobalStats]),
  };
}
