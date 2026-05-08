/**
 * Function metrics recording helper.
 * Records execution metrics for edge functions to enable dashboards and alerting.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface MetricsRecord {
  functionName: string;
  tenantId?: string;
  correlationId?: string;
  status: "ok" | "error";
  durationMs: number;
  itemsProcessed?: number;
  itemsFailed?: number;
  itemsDead?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/** Record function execution metrics. Fire-and-forget — never throws. */
export async function recordMetrics(record: MetricsRecord): Promise<void> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    await supabase.from("function_metrics").insert({
      function_name: record.functionName,
      tenant_id: record.tenantId || null,
      correlation_id: record.correlationId || null,
      status: record.status,
      duration_ms: record.durationMs,
      items_processed: record.itemsProcessed || 0,
      items_failed: record.itemsFailed || 0,
      items_dead: record.itemsDead || 0,
      error_message: record.errorMessage?.slice(0, 1000) || null,
      metadata: record.metadata || null,
    });
  } catch {
    // Metrics recording should never fail the main function
  }
}

/** Helper to measure execution time */
export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}
