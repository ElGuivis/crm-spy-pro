import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

type EntityType = "customers" | "products" | "orders";

interface Props {
  integrationId: string | null | undefined;
  /** LI entity type. Omit for ME (use `melhorEnvio` instead). */
  entityType?: EntityType;
  /** When true, polls `me_sync_jobs` instead of `li_sync_state`. */
  melhorEnvio?: boolean;
  tenantId?: string | null;
}

const labels: Record<EntityType, string> = {
  customers: "clientes",
  products: "produtos",
  orders: "pedidos",
};

type Status = "running" | "done" | "idle";

/**
 * Banner that shows sync progress at the top of a data page.
 * Polls every 5s. Shows progress while running and a completed
 * count after the sync finishes.
 */
export function SyncProgressBanner({ integrationId, entityType, melhorEnvio, tenantId }: Props) {
  const [synced, setSynced] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    if (!integrationId) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      if (cancelled) return;
      try {
        if (melhorEnvio && tenantId) {
          const { data } = await supabase
            .from("me_sync_jobs")
            .select("status, items_saved, items_total, updated_at")
            .eq("tenant_id", tenantId)
            .eq("integration_id", integrationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const saved = typeof data?.items_saved === "number" ? data.items_saved : null;
          const itemsTotal = typeof data?.items_total === "number" ? data.items_total : null;
          const isRunning = data?.status === "running" || data?.status === "pending";
          const isDone = data?.status === "completed";

          setStatus(isRunning ? "running" : isDone ? "done" : "idle");
          setSynced(saved);
          setTotal(itemsTotal);
          setLabel("envios");
        } else if (entityType) {
          const { data } = await supabase
            .from("li_sync_state")
            .select("last_offset, total_count, records_synced, updated_at")
            .eq("integration_id", integrationId)
            .eq("entity_type", entityType)
            .maybeSingle();

          const offset = data?.last_offset ?? 0;
          const totalCount = data?.total_count ?? null;
          const records = data?.records_synced ?? 0;
          const updatedAt = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
          const recentlyActive = Date.now() - updatedAt < 5 * 60_000;
          const isRunning = offset > 0 && recentlyActive;
          const isDone = offset === 0 && totalCount !== null && totalCount > 0;
          const doneCount = records > 0 ? records : totalCount;

          setStatus(isRunning ? "running" : isDone ? "done" : "idle");
          setSynced(isRunning ? offset : doneCount);
          setTotal(totalCount);
          setLabel(labels[entityType]);
        }
      } catch {
        // ignore — next tick will retry
      }
      timer = window.setTimeout(poll, 5000);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [integrationId, entityType, melhorEnvio, tenantId]);

  if (status === "idle" || synced === null) return null;

  const pct = total && total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : null;
  const isRunning = status === "running";

  return (
    <div className="rounded-md border bg-card px-4 py-3 mb-4 flex items-center gap-3">
      {isRunning ? (
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium mb-1">
          {isRunning ? `Sincronizando ${label}…` : `${label.charAt(0).toUpperCase()}${label.slice(1)} sincronizados`}{" "}
          <span className="text-muted-foreground font-normal">
            {synced.toLocaleString("pt-BR")}
            {total ? ` / ${total.toLocaleString("pt-BR")}` : ""}
            {pct !== null ? ` (${pct}%)` : ""}
          </span>
        </div>
        <Progress value={pct ?? (isRunning ? 5 : 100)} className="h-1.5" />
      </div>
    </div>
  );
}
