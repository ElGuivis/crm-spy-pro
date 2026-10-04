/** Pixel de abertura e reescrita dos links http(s) para o redirecionador de cliques (usado no envio e no teste). */
export function injectTracking(html: string, supabaseUrl: string, tokenId: string): string {
  const pixel = `<img src="${supabaseUrl}/functions/v1/email-track-open?t=${tokenId}" width="1" height="1" style="display:none;" alt="">`;
  let result = html.includes("</body>") ? html.replace("</body>", `${pixel}</body>`) : html + pixel;
  result = result.replace(
    /<a(\s[^>]*?)?href="(https?:\/\/[^"]+)"([^>]*)>/gi,
    (match, before, url, after) => {
      if (url.includes("/email-track-") || url.includes("/email-unsubscribe")) return match;
      const trackUrl = `${supabaseUrl}/functions/v1/email-track-click?t=${tokenId}&url=${encodeURIComponent(url)}`;
      return `<a${before ?? ""}href="${trackUrl}"${after}>`;
    },
  );
  return result;
}
