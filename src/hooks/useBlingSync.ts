import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import {
  useBlingSyncRealtime,
  type BlingSyncStatus,
  type BlingSyncJob,
} from "./useBlingSyncRealtime";

const log = createLogger("useBlingSync");

export type { BlingSyncStatus };

interface UseBlingSync {
  syncStatus: BlingSyncStatus;
  currentJob: BlingSyncJob | null;
  startSync: (storeIds?: number[]) => Promise<void>;
  checkForNew: () => Promise<void>;
  updateStock: () => Promise<void>;
  cancelSync: () => Promise<void>;
  resumeSync: () => Promise<void>;
  syncLogId: string | null;
  isStuck: boolean;
  lastHeartbeatAgo: number | null;
}

export function useBlingSync(integrationId: string, syncType: string = "all"): UseBlingSync {
  const [syncStatus, setSyncStatus] = useState<BlingSyncStatus>("idle");
  const [currentJob, setCurrentJob] = useState<BlingSyncJob | null>(null);
  const [syncLogId, setSyncLogId] = useState<string | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [lastHeartbeatAgo, setLastHeartbeatAgo] = useState<number | null>(null);

  useBlingSyncRealtime(integrationId, syncType, currentJob, syncStatus, {
    setSyncStatus, setCurrentJob, setSyncLogId, setIsStuck, setLastHeartbeatAgo,
  });

  const resetBeforeStart = () => {
    setSyncStatus("syncing"); setCurrentJob(null); setSyncLogId(null); setIsStuck(false);
  };

  const startSync = useCallback(async (storeIds?: number[]) => {
    if (!integrationId) { log.error("[useBlingSync] No integrationId provided"); return; }
    resetBeforeStart();
    try {
      const { data, error } = await supabase.functions.invoke("bling-sync", {
        body: { integrationId, syncType, storeIds, incremental: false },
      });
      if (error) { log.error("[useBlingSync] Error starting sync:", error); setSyncStatus("failed"); return; }
      if (data?.syncLogId) setSyncLogId(data.syncLogId);
      log.info("[useBlingSync] Sync started:", data);
    } catch (err) {
      log.error("[useBlingSync] Error:", err); setSyncStatus("failed");
    }
  }, [integrationId, syncType]);

  const checkForNew = useCallback(async () => {
    if (!integrationId) { log.error("[useBlingSync] No integrationId provided"); return; }
    resetBeforeStart();
    try {
      if (syncType === "products") {
        const { data, error } = await supabase.functions.invoke("bling-job-processor", {
          body: { integrationId, syncType: "products", manual: true },
        });
        if (error) { log.error("[useBlingSync] Error checking for new products:", error); setSyncStatus("failed"); return; }
        log.info("[useBlingSync] New products check completed:", data);
        setSyncStatus("completed");
        setTimeout(() => setSyncStatus("idle"), 2000);
        return;
      }

      const { data: integration } = await supabase.from("integrations").select("id, metadata").eq("id", integrationId).single();
      const savedStoreIds = (integration as any)?.metadata?.bling_store_ids as number[] | null;

      const { data, error } = await supabase.functions.invoke("bling-sync", {
        body: { integrationId, syncType, storeIds: savedStoreIds, incremental: true },
      });
      if (error) { log.error("[useBlingSync] Error checking for new:", error); setSyncStatus("failed"); return; }
      if (data?.syncLogId) setSyncLogId(data.syncLogId);
      log.info("[useBlingSync] Incremental sync started:", data);
    } catch (err) {
      log.error("[useBlingSync] Error:", err); setSyncStatus("failed");
    }
  }, [integrationId, syncType]);

  const updateStock = useCallback(async () => {
    if (!integrationId) { log.error("[useBlingSync] No integrationId provided"); return; }
    resetBeforeStart();
    try {
      const { data, error } = await supabase.functions.invoke("bling-job-processor", {
        body: { integrationId, syncType: "products_stock", manual: true },
      });
      if (error) { log.error("[useBlingSync] Error updating stock:", error); setSyncStatus("failed"); return; }
      log.info("[useBlingSync] Stock update completed:", data);
      setSyncStatus("completed");
      setTimeout(() => setSyncStatus("idle"), 2000);
    } catch (err) {
      log.error("[useBlingSync] Error:", err); setSyncStatus("failed");
    }
  }, [integrationId]);

  const resumeSync = useCallback(async () => {
    if (!currentJob) { log.error("[useBlingSync] No current job to resume"); return; }
    log.info("[useBlingSync] Resuming job:", currentJob.id);
    setSyncStatus("syncing"); setIsStuck(false);
    try {
      const { data, error } = await supabase.functions.invoke("bling-products-job-processor", {
        body: { jobId: currentJob.id },
      });
      if (error) { log.error("[useBlingSync] Error resuming sync:", error); return; }
      log.info("[useBlingSync] Resume triggered:", data);
    } catch (err) {
      log.error("[useBlingSync] Error:", err);
    }
  }, [currentJob]);

  const cancelSync = useCallback(async () => {
    if (!integrationId) { log.error("[useBlingSync] No integrationId provided"); return; }
    try {
      const { error } = await supabase.functions.invoke("manage-sync-jobs", {
        body: { action: "cancel-bling", integration_id: integrationId, sync_log_id: syncLogId },
      });
      if (error) { log.error("[useBlingSync] Error cancelling sync:", error); return; }
      setSyncStatus("cancelled"); setIsStuck(false);
    } catch (err) {
      log.error("[useBlingSync] Error cancelling:", err);
    }
  }, [integrationId, syncLogId]);

  return {
    syncStatus, currentJob, startSync, checkForNew, updateStock,
    cancelSync, resumeSync, syncLogId, isStuck, lastHeartbeatAgo,
  };
}
