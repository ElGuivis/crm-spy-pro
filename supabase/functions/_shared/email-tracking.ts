/** "Black Friday 2026!" -> "black-friday-2026" (valor seguro para utm_campaign). */
export function utmSlug(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** Acrescenta utm_source/medium/campaign ao link, sem sobrescrever os que já existirem (o lojista pode ter posto os seus). */
export function addUtm(url: string, campaignName: string): string {
  const slug = utmSlug(campaignName);
  if (!slug) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "email");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "email");
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", slug);
    return u.toString();
  } catch {
    return url;
  }
}

/** Pixel de abertura e reescrita dos links http(s) para o redirecionador de cliques (usado no envio e no teste). */
export function injectTracking(html: string, supabaseUrl: string, tokenId: string, utmCampaignName?: string | null): string {
  const pixel = `<img src="${supabaseUrl}/functions/v1/email-track-open?t=${tokenId}" width="1" height="1" style="display:none;" alt="">`;
  let result = html.includes("</body>") ? html.replace("</body>", `${pixel}</body>`) : html + pixel;
  result = result.replace(
    /<a(\s[^>]*?)?href="(https?:\/\/[^"]+)"([^>]*)>/gi,
    (match, before, url, after) => {
      if (url.includes("/email-track-") || url.includes("/email-unsubscribe")) return match;
      // &amp; do HTML vira & antes de montar a URL de destino
      const target = utmCampaignName ? addUtm(url.replace(/&amp;/g, "&"), utmCampaignName) : url.replace(/&amp;/g, "&");
      const trackUrl = `${supabaseUrl}/functions/v1/email-track-click?t=${tokenId}&url=${encodeURIComponent(target)}`;
      return `<a${before ?? ""}href="${trackUrl}"${after}>`;
    },
  );
  return result;
}
