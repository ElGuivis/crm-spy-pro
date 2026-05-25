import { useEffect, useId } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BlingSyncStatus = "idle" | "syncing" | "pending" | "completed" | "failed" | "cancelled";

export interface BlingSyncJob {
  id: string;
  status: string;
  job_type: string;
  current_page: number;
  resume_page: number;
  processed_count: number;
  saved_count: number;
  total_count: number;
  error_message: string | null;
  sync_log_id: string;
  last_heartbeat_at: string | null;
  updated_at: string;
  attempts: number;
}

const STUCK_THRESHOLD_MS = 2 * 60 * 1000;

interface Handlers {
  setSyncStatus: (s: BlingSyncStatus) => void;
  setCurrentJob: (j: BlingSyncJob | null) => void;
  setSyncLogId: (id: string | null) => void;
  setIsStuck: (v: boolean) => void;
  setLastHeartbeatAgo: (ms: number | null) => void;
}

/**
 * Wires up the 3 side-effects of bling sync tracking:
 * 1. mount check for active jobs, 2. realtime subscription, 3. heartbeat staleness poller.
 */
export function useBlingSyncRealtime(
  integrationId: string,
  syncType: string,
  currentJob: BlingSyncJob | null,
  syncStatus: BlingSyncStatus,
  h: Handlers,
) {
  const channelInstanceId = useId();

  // Mount: check for active jobs
  useEffect(() => {
    if (!integrationId) return;
    const checkActiveJobs = async () => {
      let query = supabase
        .from("bling_sync_jobs")
        .select("id, integration_id, tenant_id, job_type, sync_log_id, status, current_page, resume_page, max_pages_per_run, processed_count, saved_count, total_count, started_at, completed_at, error_message, attempts, last_heartbeat_at, locked_at, locked_by, created_at, updated_at")
        .eq("integration_id", integrationId)
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (syncType !== "all") query = query.eq("job_type", syncType);

      const { data: activeJobs } = await query;
      if (activeJobs && activeJobs.length > 0) {
        const job = activeJobs[0] as BlingSyncJob;
        h.setSyncStatus(job.status === "pending" ? "pending" : "syncing");
        h.setCurrentJob(job);
        h.setSyncLogId(job.sync_log_id);
        if (job.last_heartbeat_at) {
          const heartbeatAge = Date.now() - new Date(job.last_heartbeat_at).getTime();
          h.setLastHeartbeatAgo(heartbeatAge);
          h.setIsStuck(heartbeatAge > STUCK_THRESHOLD_MS);
        }
      }
    };
    checkActiveJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId, syncType]);

  // Realtime subscription
  useEffect(() => {
    if (!integrationId) return;
    const channel = supabase
      .channel(`bling-sync-${integrationId}-${syncType}-${channelInstanceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "bling_sync_jobs", filter: `integration_id=eq.${integrationId}` },
        (payload) => {
          const job = payload.new as BlingSyncJob;
          if (syncType !== "all" && job.job_type !== syncType) return;

          if (job.status === "running") {
            h.setSyncStatus("syncing"); h.setCurrentJob(job); h.setSyncLogId(job.sync_log_id); h.setIsStuck(false);
            if (job.last_heartbeat_at) h.setLastHeartbeatAgo(Date.now() - new Date(job.last_heartbeat_at).getTime());
          } else if (job.status === "pending") {
            h.setSyncStatus("pending"); h.setCurrentJob(job); h.setSyncLogId(job.sync_log_id);
            if (job.last_heartbeat_at) {
              const heartbeatAge = Date.now() - new Date(job.last_heartbeat_at).getTime();
              h.setLastHeartbeatAgo(heartbeatAge);
              h.setIsStuck(heartbeatAge > STUCK_THRESHOLD_MS);
            }
          } else if (job.status === "completed") {
            h.setSyncStatus("completed"); h.setCurrentJob(job); h.setIsStuck(false);
            setTimeout(() => { h.setSyncStatus("idle"); h.setCurrentJob(null); }, 2000);
          } else if (job.status === "cancelled") {
            h.setSyncStatus("cancelled"); h.setCurrentJob(job); h.setIsStuck(false);
            setTimeout(() => { h.setSyncStatus("idle"); h.setCurrentJob(null); }, 2000);
          } else if (job.status === "failed") {
            h.setSyncStatus("failed"); h.setCurrentJob(job); h.setIsStuck(false);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId, syncType, channelInstanceId]);

  // Heartbeat staleness poller
  useEffect(() => {
    if (!currentJob || (syncStatus !== "syncing" && syncStatus !== "pending")) return;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("bling_sync_jobs").select("last_heartbeat_at, status").eq("id", currentJob.id).single();
      if (data?.last_heartbeat_at) {
        const heartbeatAge = Date.now() - new Date(data.last_heartbeat_at).getTime();
        h.setLastHeartbeatAgo(heartbeatAge);
        h.setIsStuck(heartbeatAge > STUCK_THRESHOLD_MS && (data.status === "running" || data.status === "pending"));
      }
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob?.id, syncStatus]);
}
