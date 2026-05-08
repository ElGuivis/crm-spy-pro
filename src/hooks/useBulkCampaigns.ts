import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/lib/logger";
import type { Campaign, WhatsAppIntegration, CampaignContact } from "@/components/bulk-campaigns/types";

const logger = createLogger("BulkCampaigns");

export function useBulkCampaigns() {
  const { toast } = useToast();
  const { tenantId } = useAuth();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [integrations, setIntegrations] = useState<WhatsAppIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  // Details dialog state
  const [detailsCampaign, setDetailsCampaign] = useState<Campaign | null>(null);
  const [detailsContacts, setDetailsContacts] = useState<CampaignContact[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Delete dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bulk_campaigns")
        .select("id, name, message_template, whatsapp_integration_id, delay_seconds, status, total_contacts, sent_count, delivered_count, read_count, failed_count, tokens_per_message, total_tokens_used, scheduled_at, started_at, completed_at, created_at, media_url, media_type, timezone")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCampaigns((data || []) as Campaign[]);
    } catch (e) {
      logger.error("Error loading campaigns", e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadIntegrations = useCallback(async () => {
    const { data } = await supabase
      .from("integrations")
      .select("id, name, metadata")
      .eq("type", "evolution_whatsapp")
      .eq("status", "connected");
    setIntegrations((data || []) as WhatsAppIntegration[]);
  }, []);

  const startCampaign = async (id: string) => {
    try {
      const { error } = await supabase.from("bulk_campaigns").update({ status: "processing", started_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      supabase.functions.invoke("bulk-campaign-processor", { body: { campaign_id: id } }).catch((err: unknown) => logger.error("Processor invoke failed", err));
      toast({ title: "Campanha iniciada!", description: "Os disparos começarão em instantes." });
      loadCampaigns();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro", description: message, variant: "destructive" });
    }
  };

  const retryFailed = async (id: string) => {
    try {
      // Find failed contacts
      const { data: failedContacts, error: selErr } = await supabase
        .from("campaign_contacts")
        .select("id")
        .eq("campaign_id", id)
        .eq("status", "failed");
      if (selErr) throw selErr;

      const count = failedContacts?.length ?? 0;
      if (count === 0) {
        toast({ title: "Nada para reenviar", description: "Não há mensagens com falha nesta campanha." });
        return;
      }

      const ids = failedContacts!.map((c) => c.id);

      // Reset failed contacts to pending
      const { error: updErr } = await supabase
        .from("campaign_contacts")
        .update({ status: "pending", error_message: null, sent_at: null })
        .in("id", ids);
      if (updErr) throw updErr;

      // Reset campaign counters & status so the processor will pick it up
      const { data: current } = await supabase
        .from("bulk_campaigns")
        .select("failed_count")
        .eq("id", id)
        .maybeSingle();
      const newFailed = Math.max(0, (current?.failed_count ?? 0) - count);

      const { error: campErr } = await supabase
        .from("bulk_campaigns")
        .update({
          status: "processing",
          failed_count: newFailed,
          completed_at: null,
          processing_lock_until: null,
          next_send_at: null,
        })
        .eq("id", id);
      if (campErr) throw campErr;

      supabase.functions
        .invoke("bulk-campaign-processor", { body: { campaign_id: id } })
        .catch((err: unknown) => logger.error("Processor invoke failed", err));

      toast({ title: "Reenvio iniciado", description: `${count} mensagem(ns) na fila para nova tentativa.` });
      loadCampaigns();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro ao reenviar", description: message, variant: "destructive" });
    }
  };

  const pauseCampaign = async (id: string) => {
    const { error } = await supabase.from("bulk_campaigns").update({ status: "paused" }).eq("id", id);
    if (!error) {
      toast({ title: "Campanha pausada" });
      loadCampaigns();
    }
  };

  const deleteCampaign = async () => {
    if (!deleteId) return;
    try {
      await supabase.from("campaign_contacts").delete().eq("campaign_id", deleteId);
      await supabase.from("bulk_campaigns").delete().eq("id", deleteId);
      toast({ title: "Campanha excluída" });
      loadCampaigns();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const viewDetails = async (campaign: Campaign) => {
    setDetailsCampaign(campaign);
    setDetailsLoading(true);
    try {
      const { data } = await supabase
        .from("campaign_contacts")
        .select("id, name, phone, status, sent_at")
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: true })
        .limit(200);
      setDetailsContacts((data || []) as CampaignContact[]);
    } catch (e) {
      logger.error("Error loading campaign details", e);
    } finally {
      setDetailsLoading(false);
    }
  };

  return {
    campaigns,
    integrations,
    loading,
    loadCampaigns,
    loadIntegrations,
    startCampaign,
    pauseCampaign,
    retryFailed,
    deleteCampaign,
    viewDetails,
    detailsCampaign,
    setDetailsCampaign,
    detailsContacts,
    detailsLoading,
    deleteId,
    setDeleteId,
  };
}
