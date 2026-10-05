/**
 * Preparo do HTML de campanha antes do envio: pré-header, versão em texto e cabeçalho de descadastro.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Insere o pré-header (texto que aparece ao lado do assunto na caixa de entrada) logo após <body>.
 * O HTML do editor não leva o pré-header; sem isto o campo da campanha era ignorado.
 * O enchimento de caracteres invisíveis impede que o início do corpo "vaze" para a prévia.
 */
export function injectPreheader(html: string, preheader: string | null | undefined): string {
  const text = (preheader ?? "").trim();
  if (!text || html.includes("data-preheader")) return html;
  const filler = "&#847;&zwnj;&nbsp;".repeat(60);
  const div = `<div data-preheader="1" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(text)}${filler}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/(<body[^>]*>)/i, `$1${div}`) : div + html;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", zwnj: "", hellip: "…", mdash: "—", ndash: "–" };

/** Versão em texto puro do e-mail (multipart/alternative): links viram "texto (url)", blocos viram linhas. */
export function htmlToText(html: string): string {
  let t = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<div[^>]*data-preheader[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<img[^>]*display:\s*none[^>]*>/gi, "");
  t = t.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, url: string, label: string) => {
    const l = label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    return l && l !== url ? `${l} (${url})` : url;
  });
  t = t
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_m, alt: string) => (alt ? `[${alt}]` : ""))
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/tr|\/li|\/table)\s*\/?>/gi, "\n")
    .replace(/<\/td>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
  return t
    .split("\n").map((l) => l.replace(/\u034F/g, " ").replace(/[ \t\u00A0]+/g, " ").trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Cabeçalhos de descadastro com um clique (RFC 8058), exigidos por Gmail e Yahoo para envio em volume. */
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
