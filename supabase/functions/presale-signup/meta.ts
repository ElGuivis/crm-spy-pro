// Lead da página do grupo VIP enviado à API de Conversões da Meta (o navegador manda o mesmo
// evento pelo pixel com o mesmo event_id; a Meta desduplica). Roda em segundo plano.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { decryptSecret } from "../_shared/secret-crypto.ts";
import { sendMetaEvent } from "../_shared/meta-capi.ts";

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined;

export interface RequestInfo { ip: string | null; userAgent: string | null }
interface MetaPage { meta_pixel_id: string | null; meta_capi_token_encrypted: string | null; meta_test_event_code: string | null }
interface Lead { signupId: string; name: string; phone: string; email: string }

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const EVENT_ID = /^[A-Za-z0-9-]{8,64}$/;

export function sendLeadToMeta(sb: SupabaseClient, page: MetaPage, lead: Lead, rawMeta: unknown, req: RequestInfo): void {
  if (!page.meta_pixel_id || !page.meta_capi_token_encrypted) return;
  const meta = (rawMeta && typeof rawMeta === "object" ? rawMeta : {}) as Record<string, unknown>;
  const given = str(meta.eventId, 64);
  const eventId = EVENT_ID.test(given) ? given : `lead-${lead.signupId}`;
  const url = str(meta.url, 500);

  const task = (async () => {
    const token = await decryptSecret(sb as never, page.meta_capi_token_encrypted);
    const [firstName, ...rest] = lead.name.split(" ");
    const r = token
      ? await sendMetaEvent({
          pixelId: page.meta_pixel_id!, token, testEventCode: page.meta_test_event_code,
          eventName: "Lead", eventId,
          eventSourceUrl: url.startsWith("https://") ? url : null,
          user: {
            email: lead.email, phone: lead.phone, firstName, lastName: rest.join(" "), externalId: lead.signupId,
            ip: req.ip, userAgent: req.userAgent?.slice(0, 400) ?? null,
            fbp: str(meta.fbp, 120) || null, fbc: str(meta.fbc, 300) || null,
          },
        })
      : { ok: false, error: "token não decifrado" };
    if (!r.ok) console.error("[presale-signup] meta capi", lead.signupId, r.error);
    await sb.from("presale_signups").update({
      meta_event_id: eventId, meta_capi_status: r.ok ? "sent" : "failed", meta_capi_error: r.ok ? null : r.error ?? null,
    }).eq("id", lead.signupId);
  })().catch((e) => console.error("[presale-signup] meta capi", e instanceof Error ? e.message : e));

  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(task);
}

/** "Ver conteúdo" ao abrir a página: só dados do navegador (IP, navegador, cookies do pixel). */
export function sendViewToMeta(sb: SupabaseClient, page: MetaPage, rawMeta: unknown, req: RequestInfo): void {
  if (!page.meta_pixel_id || !page.meta_capi_token_encrypted) return;
  const meta = (rawMeta && typeof rawMeta === "object" ? rawMeta : {}) as Record<string, unknown>;
  const eventId = str(meta.eventId, 64);
  if (!EVENT_ID.test(eventId)) return;
  const url = str(meta.url, 500);
  const task = (async () => {
    const token = await decryptSecret(sb as never, page.meta_capi_token_encrypted);
    if (!token) return;
    const r = await sendMetaEvent({
      pixelId: page.meta_pixel_id!, token, testEventCode: page.meta_test_event_code,
      eventName: "ViewContent", eventId,
      eventSourceUrl: url.startsWith("https://") ? url : null,
      user: { ip: req.ip, userAgent: req.userAgent?.slice(0, 400) ?? null, fbp: str(meta.fbp, 120) || null, fbc: str(meta.fbc, 300) || null },
    });
    if (!r.ok) console.error("[presale-signup] meta capi view", r.error);
  })().catch((e) => console.error("[presale-signup] meta capi view", e instanceof Error ? e.message : e));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(task);
}
