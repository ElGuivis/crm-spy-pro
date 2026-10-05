import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { attributionConsumer, cashbackConsumer, recoveryConsumer, type DomainEvent } from "./consumers.ts";

const BATCH = 50;
const MAX_ATTEMPTS = 5;

/**
 * Cron (1 min): trata os eventos de dominio pendentes (hoje: order_ingested). Cada consumidor roda no maximo uma vez por evento
 * (domain_event_deliveries); se algum falhar o evento volta para a fila (ate 5 tentativas). Consumidores por pedido: cashback.
 * Consumidores por loja (uma vez por lote): recuperacao de abandono e atribuicao de campanhas.
 */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("domain-event-processor", getCorrelationId(req));

  try {
    await requireInternalAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: claimed, error } = await supabase.rpc("claim_domain_events", { p_limit: BATCH });
    if (error) throw error;
    const events = (claimed ?? []) as DomainEvent[];
    if (!events.length) return json({ ok: true, events: 0 });

    const ids = events.map((e) => e.id);
    const { data: delivered } = await supabase.from("domain_event_deliveries").select("event_id, consumer").in("event_id", ids);
    const done = new Set((delivered ?? []).map((d: { event_id: string; consumer: string }) => `${d.event_id}:${d.consumer}`));
    const failures = new Map<string, string>();
    const record = async (eventId: string, consumer: string, status: string, detail?: string) => {
      await supabase.from("domain_event_deliveries").upsert({ event_id: eventId, consumer, status, detail: detail ?? null }, { onConflict: "event_id,consumer" });
    };

    // 1) por pedido
    for (const ev of events) {
      if (ev.event_type !== "order_ingested" || done.has(`${ev.id}:cashback`)) continue;
      try {
        const out = await cashbackConsumer(supabase, ev);
        await record(ev.id, "cashback", out.status, out.detail);
      } catch (e) {
        failures.set(ev.id, `cashback: ${(e as Error).message}`);
        log.error(`[EVENTS] cashback falhou no evento ${ev.id}:`, (e as Error).message);
      }
    }

    // 2) por loja, uma vez por lote
    const orderEvents = events.filter((e) => e.event_type === "order_ingested");
    if (orderEvents.length) {
      let recoveryOk = true;
      try { await recoveryConsumer(supabase); } catch (e) { recoveryOk = false; log.error("[EVENTS]", (e as Error).message); }
      const byTenant = new Map<string, DomainEvent[]>();
      for (const ev of orderEvents) byTenant.set(ev.tenant_id, [...(byTenant.get(ev.tenant_id) ?? []), ev]);
      for (const [tenantId, list] of byTenant) {
        let attrOk = true;
        try { await attributionConsumer(supabase, tenantId); } catch (e) { attrOk = false; log.error("[EVENTS]", (e as Error).message); }
        for (const ev of list) {
          if (recoveryOk && !done.has(`${ev.id}:recovery`)) await record(ev.id, "recovery", "done");
          else if (!recoveryOk) failures.set(ev.id, failures.get(ev.id) ?? "recovery: falhou");
          if (attrOk && !done.has(`${ev.id}:attribution`)) await record(ev.id, "attribution", "done");
          else if (!attrOk) failures.set(ev.id, failures.get(ev.id) ?? "attribution: falhou");
        }
      }
    }

    // 3) fecha os que terminaram; os que falharam voltam para a fila (ou desistem apos MAX_ATTEMPTS)
    const nowIso = new Date().toISOString();
    let ok = 0, retry = 0, gaveUp = 0;
    for (const ev of events) {
      const err = failures.get(ev.id);
      if (!err) {
        await supabase.from("domain_events").update({ processed_at: nowIso, locked_until: null, last_error: null }).eq("id", ev.id);
        ok++;
      } else if (ev.attempts >= MAX_ATTEMPTS) {
        await supabase.from("domain_events").update({ processed_at: nowIso, locked_until: null, last_error: err }).eq("id", ev.id);
        gaveUp++;
      } else {
        await supabase.from("domain_events").update({ locked_until: new Date(Date.now() + 30_000 * ev.attempts).toISOString(), last_error: err }).eq("id", ev.id);
        retry++;
      }
    }
    log.info(`[EVENTS] ${events.length} eventos: ${ok} tratados, ${retry} para repetir, ${gaveUp} desistidos`);
    return json({ ok: true, events: events.length, handled: ok, retry, gaveUp });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("[EVENTS] erro:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
