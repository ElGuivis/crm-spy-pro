/**
 * Sincroniza as vendas do CRM com a conversao offline "Compra paga (CRM)" do Google Ads.
 *  1) le pedidos recentes que tem gclid no utm_campaign e registra em google_ads_offline_conversions;
 *  2) pedido PAGO ainda nao enviado -> uploadClickConversions;
 *  3) pedido ja enviado que depois foi cancelado/devolvido -> RETRACTION.
 * Idempotente (orderId no Google + unique por pedido). Sem offline_conversion_action_id na conta, nao faz nada.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { loadCredentials } from "./google-ads-api.ts";
import { uploadClickConversions, uploadConversionAdjustments } from "./google-ads-offline-api.ts";
import {
  buildClickConversion, buildRetraction, classifyUploadError, conversionValue, orderKind, parsePartialFailure, parseUtmCampaign,
} from "./google-ads-offline-core.ts";

const LOOKBACK_DAYS = 85;       // o gclid vale 90 dias
const MAX_ATTEMPTS = 6;
const BATCH = 100;

interface OrderRow { order_number: string; status_name: string | null; created_at_remote: string; totals_json: { total?: unknown; shipping?: unknown } | null; utm: string | null }
interface TrackRow { id: string; order_number: string; gclid: string; value: number; conversion_time: string; li_status: string | null; status: string; attempts: number }

export interface OfflineResult { ok: boolean; skipped?: string; ingested?: number; uploaded?: number; retried?: number; failed?: number; retracted?: number; error?: string }

export async function syncOfflineConversions(supabase: SupabaseClient, accountId: string, opts: { validateOnly?: boolean; now?: Date } = {}): Promise<OfflineResult> {
  const now = opts.now ?? new Date();
  try {
    const { data: acc, error: accErr } = await supabase.from("google_ads_accounts")
      .select("tenant_id, customer_id, login_customer_id, offline_conversion_action_id").eq("id", accountId).maybeSingle();
    if (accErr || !acc) throw new Error(accErr?.message ?? "conta nao encontrada");
    if (!acc.offline_conversion_action_id) return { ok: true, skipped: "conta sem offline_conversion_action_id" };

    const creds = { ...loadCredentials(), ...(acc.login_customer_id ? { loginCustomerId: acc.login_customer_id as string } : {}) };
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();

    // 1) pedidos com gclid -> tabela de controle
    const { data: orders, error: oErr } = await supabase.from("li_orders")
      .select("order_number, status_name, created_at_remote, totals_json, utm:raw_json->>utm_campaign")
      .eq("tenant_id", acc.tenant_id).gte("created_at_remote", since).not("raw_json->>utm_campaign", "is", null).limit(2000);
    if (oErr) throw new Error(oErr.message);

    const { data: tracked, error: tErr } = await supabase.from("google_ads_offline_conversions")
      .select("id, order_number, gclid, value, conversion_time, li_status, status, attempts").eq("account_id", accountId).gte("conversion_time", since).limit(5000);
    if (tErr) throw new Error(tErr.message);
    const byOrder = new Map((tracked ?? [] as TrackRow[]).map((t) => [t.order_number, t as TrackRow]));

    const fresh: Record<string, unknown>[] = [];
    for (const o of (orders ?? []) as OrderRow[]) {
      const p = parseUtmCampaign(o.utm);
      if (!p) continue;
      const kind = orderKind(o.status_name);
      const row = byOrder.get(o.order_number);
      if (!row) {
        fresh.push({
          tenant_id: acc.tenant_id, account_id: accountId, order_number: o.order_number, campaign_id: Number(p.campaignId), gclid: p.gclid,
          value: conversionValue(o.totals_json), conversion_time: o.created_at_remote, li_status: o.status_name,
          status: kind === "retract" ? "skipped" : "waiting",
        });
      } else if (row.li_status !== o.status_name) {
        await supabase.from("google_ads_offline_conversions").update({ li_status: o.status_name, updated_at: now.toISOString() }).eq("id", row.id);
        row.li_status = o.status_name;
      }
    }
    if (fresh.length) {
      const { error } = await supabase.from("google_ads_offline_conversions").upsert(fresh, { onConflict: "account_id,order_number", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }

    const { data: rows, error: rErr } = await supabase.from("google_ads_offline_conversions")
      .select("id, order_number, gclid, value, conversion_time, li_status, status, attempts")
      .eq("account_id", accountId).in("status", ["waiting", "uploaded"]).lt("attempts", MAX_ATTEMPTS).limit(BATCH * 2);
    if (rErr) throw new Error(rErr.message);

    const toUpload = ((rows ?? []) as TrackRow[]).filter((r) => r.status === "waiting" && orderKind(r.li_status) === "paid").slice(0, BATCH);
    const toRetract = ((rows ?? []) as TrackRow[]).filter((r) => r.status === "uploaded" && orderKind(r.li_status) === "retract").slice(0, BATCH);
    const out: OfflineResult = { ok: true, ingested: fresh.length, uploaded: 0, retried: 0, failed: 0, retracted: 0 };
    const stamp = now.toISOString();
    const actionId = acc.offline_conversion_action_id as number;

    if (toUpload.length) {
      const body = await uploadClickConversions(creds, acc.customer_id, toUpload.map((r) => buildClickConversion({
        gclid: r.gclid, actionId, customerId: acc.customer_id, orderNumber: r.order_number, value: Number(r.value), time: new Date(r.conversion_time),
      })), !!opts.validateOnly);
      if (!opts.validateOnly) {
        const errs = parsePartialFailure(body);
        for (const [i, r] of toUpload.entries()) {
          const e = errs.get(i);
          const verdict = e ? classifyUploadError(e.code) : "ok";
          if (verdict === "ok") { out.uploaded!++; await supabase.from("google_ads_offline_conversions").update({ status: "uploaded", uploaded_at: stamp, attempts: r.attempts + 1, last_error: e ? e.code : null, updated_at: stamp }).eq("id", r.id); }
          else if (verdict === "retry") { out.retried!++; await supabase.from("google_ads_offline_conversions").update({ attempts: r.attempts + 1, last_error: `${e!.code}: ${e!.message}`.slice(0, 300), updated_at: stamp }).eq("id", r.id); }
          else { out.failed!++; await supabase.from("google_ads_offline_conversions").update({ status: "failed", attempts: r.attempts + 1, last_error: `${e!.code}: ${e!.message}`.slice(0, 300), updated_at: stamp }).eq("id", r.id); }
        }
      }
    }

    if (toRetract.length) {
      const body = await uploadConversionAdjustments(creds, acc.customer_id, toRetract.map((r) => buildRetraction({ actionId, customerId: acc.customer_id, orderNumber: r.order_number, time: now })), !!opts.validateOnly);
      if (!opts.validateOnly) {
        const errs = parsePartialFailure(body);
        for (const [i, r] of toRetract.entries()) {
          const e = errs.get(i);
          const verdict = e ? classifyUploadError(e.code) : "ok";
          if (verdict === "ok") { out.retracted!++; await supabase.from("google_ads_offline_conversions").update({ status: "retracted", retracted_at: stamp, updated_at: stamp }).eq("id", r.id); }
          else await supabase.from("google_ads_offline_conversions").update({ attempts: r.attempts + 1, last_error: `${e!.code}: ${e!.message}`.slice(0, 300), updated_at: stamp }).eq("id", r.id);
        }
      }
    }
    return out;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
