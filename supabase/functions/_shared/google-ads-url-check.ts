/**
 * Verificador de pagina de destino. O Google reprova anuncio com `DESTINATION_NOT_WORKING` quando o robo de anuncios nao
 * consegue abrir a pagina; por isso o sistema testa a URL com o MESMO tipo de robo antes de propor/aplicar anuncio.
 *
 * Seguranca (SSRF): a funcao do servidor so abre enderecos https cujo dominio JA e usado nos anuncios/paginas da conta
 * (lista `allowedHosts`), nunca IP, localhost ou rede interna, e segue no maximo 5 redirecionamentos (revalidando cada um).
 */

export const ADS_BOT_UA = "AdsBot-Google (+http://www.google.com/adsbot.html)";
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;

export interface UrlCheck { url: string; ok: boolean; status: number | null; final_url: string | null; reason?: string }

type FetchFn = typeof fetch;

export function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** Dominios que a conta ja usa nos anuncios/paginas de destino (sem "www."). */
export function allowedHostsFrom(urls: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const u of urls) { const h = u ? hostOf(u) : null; if (h) out.add(h); }
  return out;
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|\d{1,3}(\.\d{1,3}){3}|\[.*\])$/i;

function guard(raw: string, allowed: Set<string>): { ok: true; url: URL } | { ok: false; reason: string } {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: "URL invalida" }; }
  if (u.protocol !== "https:") return { ok: false, reason: "A URL precisa comecar com https://" };
  if (u.username || u.password) return { ok: false, reason: "URL com usuario/senha nao e aceita" };
  const host = u.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host)) return { ok: false, reason: "Endereco nao permitido" };
  if (!allowed.has(host.replace(/^www\./, ""))) return { ok: false, reason: "O dominio nao e um dos usados nos anuncios desta conta" };
  return { ok: true, url: u };
}

export async function checkUrl(raw: string, allowed: Set<string>, fetchFn: FetchFn = fetch): Promise<UrlCheck> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const g = guard(current, allowed);
    if (!g.ok) return { url: raw, ok: false, status: null, final_url: current, reason: g.reason };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetchFn(g.url.toString(), { method: "GET", redirect: "manual", headers: { "User-Agent": ADS_BOT_UA, Accept: "text/html" }, signal: ctrl.signal });
      await res.body?.cancel().catch(() => undefined); // so o status importa
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) return { url: raw, ok: false, status: res.status, final_url: current, reason: "Redirecionamento sem destino" };
        current = new URL(loc, g.url).toString();
        continue;
      }
      const ok = res.status >= 200 && res.status < 300;
      return { url: raw, ok, status: res.status, final_url: current, reason: ok ? undefined : `A pagina respondeu ${res.status} para o robo de anuncios do Google` };
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      return { url: raw, ok: false, status: null, final_url: current, reason: aborted ? "A pagina demorou mais de 10 s para responder" : "Nao foi possivel abrir a pagina" };
    } finally { clearTimeout(timer); }
  }
  return { url: raw, ok: false, status: null, final_url: current, reason: "Redirecionamentos demais" };
}

/** Verifica varias URLs (sem repetir), ate 5 por vez. */
export async function checkUrls(urls: string[], allowed: Set<string>, fetchFn: FetchFn = fetch): Promise<Map<string, UrlCheck>> {
  const uniq = [...new Set(urls)].slice(0, 40);
  const out = new Map<string, UrlCheck>();
  for (let i = 0; i < uniq.length; i += 5) {
    const batch = await Promise.all(uniq.slice(i, i + 5).map((u) => checkUrl(u, allowed, fetchFn)));
    for (const r of batch) out.set(r.url, r);
  }
  return out;
}
