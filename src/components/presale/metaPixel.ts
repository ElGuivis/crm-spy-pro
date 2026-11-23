// Meta Pixel carregado pelo código da página (o site tem CSP sem script inline; o snippet oficial
// colado no HTML seria bloqueado). Mesmo efeito do snippet: cria a fila `fbq`, carrega fbevents.js,
// `init` + `PageView`. Só as páginas públicas que têm `meta_pixel_id` chamam isto.

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[][]; loaded: boolean; version: string; push: Fbq };
declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

const initialized = new Set<string>();

export function loadMetaPixel(pixelId: string): void {
  if (!/^\d{10,20}$/.test(pixelId) || initialized.has(pixelId)) return;
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    if (!window._fbq) window._fbq = fbq;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }
  initialized.add(pixelId);
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

/** `eventId` = o mesmo mandado ao servidor (API de Conversões), para a Meta não contar duas vezes. */
export function trackMetaEvent(event: "Lead" | "CompleteRegistration" | "ViewContent", eventId?: string): void {
  if (!initialized.size || !window.fbq) return;
  if (eventId) window.fbq("track", event, {}, { eventID: eventId });
  else window.fbq("track", event);
}

function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Dados do navegador que a API de Conversões usa para casar o evento (cookies do pixel). */
export function metaBrowserData(eventId: string): { eventId: string; fbp: string | null; fbc: string | null; url: string } {
  let fbc = cookie("_fbc");
  const clickId = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbc && clickId) fbc = `fb.1.${Date.now()}.${clickId}`;
  return { eventId, fbp: cookie("_fbp"), fbc, url: window.location.href.split("#")[0] };
}
