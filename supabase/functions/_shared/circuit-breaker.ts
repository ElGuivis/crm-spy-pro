/**
 * Circuit Breaker for external API integrations.
 * States: closed (normal) → open (blocking) → half_open (testing)
 * 
 * Uses the circuit_breaker_state table for persistence across invocations.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface CircuitBreakerConfig {
  /** Provider key (e.g. 'evolution', 'meta', 'bling', 'melhor_envio') */
  provider: string;
  /** Tenant ID for per-tenant circuit isolation */
  tenantId: string;
  /** Number of consecutive failures to trip the circuit (default: 5) */
  failureThreshold?: number;
  /** Seconds to keep circuit open before half-open (default: 60) */
  resetTimeoutSeconds?: number;
}

export interface CircuitState {
  state: "closed" | "open" | "half_open";
  failure_count: number;
  last_failure_at: string | null;
  opened_at: string | null;
}

const DEFAULT_THRESHOLD = 5;
const DEFAULT_RESET_SECONDS = 60;

function getServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Get current circuit state. Returns closed state if no record exists. */
export async function getCircuitState(config: CircuitBreakerConfig): Promise<CircuitState> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("circuit_breaker_state")
    .select("state, failure_count, last_failure_at, opened_at")
    .eq("provider", config.provider)
    .eq("tenant_id", config.tenantId)
    .maybeSingle();

  if (!data) {
    return { state: "closed", failure_count: 0, last_failure_at: null, opened_at: null };
  }

  // Check if open circuit should transition to half_open
  if (data.state === "open" && data.opened_at) {
    const resetTimeout = (config.resetTimeoutSeconds || DEFAULT_RESET_SECONDS) * 1000;
    const elapsed = Date.now() - new Date(data.opened_at).getTime();
    if (elapsed >= resetTimeout) {
      return { ...data, state: "half_open" };
    }
  }

  return data;
}

/** Check if a request is allowed through the circuit. */
export async function isCircuitClosed(config: CircuitBreakerConfig): Promise<boolean> {
  const state = await getCircuitState(config);
  return state.state !== "open";
}

/** Record a successful call — resets circuit to closed. */
export async function recordSuccess(config: CircuitBreakerConfig): Promise<void> {
  const supabase = getServiceClient();
  await supabase
    .from("circuit_breaker_state")
    .upsert({
      provider: config.provider,
      tenant_id: config.tenantId,
      state: "closed",
      failure_count: 0,
      last_failure_at: null,
      opened_at: null,
      last_success_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,tenant_id" });
}

/** Record a failure — may trip the circuit to open. */
export async function recordFailure(config: CircuitBreakerConfig, error?: string): Promise<CircuitState> {
  const supabase = getServiceClient();
  const threshold = config.failureThreshold || DEFAULT_THRESHOLD;
  const now = new Date().toISOString();

  // Get current state
  const current = await getCircuitState(config);
  const newCount = current.failure_count + 1;
  const newState = newCount >= threshold ? "open" : current.state === "half_open" ? "open" : "closed";

  const record = {
    provider: config.provider,
    tenant_id: config.tenantId,
    state: newState,
    failure_count: newCount,
    last_failure_at: now,
    last_error: error?.slice(0, 500) || null,
    opened_at: newState === "open" ? now : current.opened_at,
    updated_at: now,
  };

  await supabase
    .from("circuit_breaker_state")
    .upsert(record, { onConflict: "provider,tenant_id" });

  return { state: newState as CircuitState["state"], failure_count: newCount, last_failure_at: now, opened_at: record.opened_at };
}
