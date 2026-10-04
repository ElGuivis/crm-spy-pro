/**
 * Separa leitura/clique de PESSOA de leitura/clique de ROBÔ nos eventos de rastreio.
 *  - Apple Mail Privacy Protection baixa o pixel de todo e-mail sozinho, por servidores da Apple (17.0.0.0/8),
 *    mesmo que ninguém abra: infla a abertura.
 *  - Filtros de segurança (antivírus, Microsoft SafeLinks, Proofpoint, Mimecast...) abrem e clicam nos links em
 *    segundos para checar se são seguros: infla o clique e atribui compra a quem nunca clicou.
 * Eventos de robô são gravados com outro tipo (bot_open / bot_click): ficam fora das métricas, mas dá para auditar.
 */

const SCANNER_UA = /barracuda|proofpoint|mimecast|symantec|trend\s?micro|fireeye|forcepoint|sophos|mailscanner|safelinks|bitdefender|kaspersky|avast|\bavg\b|mcafee|cisco|ironport|zscaler|netskope|python-requests|python-urllib|aiohttp|curl\/|wget\/|go-http-client|java\/|libwww|headlesschrome|phantomjs|puppeteer|playwright|\bbot\b|crawler|spider|slackbot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|twitterbot|skypeuripreview|urlscan/i;

/** Cliques mais rápidos que isto depois do envio são de escaneador: o e-mail nem chegou na caixa de entrada. */
export const MIN_HUMAN_CLICK_SECONDS = 10;

export type BotReason = "apple_mpp" | "scanner" | "too_fast";

export function firstIp(forwardedFor: string | null | undefined): string {
  return (forwardedFor ?? "").split(",")[0]?.trim() ?? "";
}

const isAppleIp = (ip: string) => /^17\.\d+\.\d+\.\d+$/.test(ip);

/** Abertura (pixel): robô da Apple (Mail Privacy Protection) ou escaneador. null = pessoa. */
export function classifyOpen(userAgent: string | null | undefined, forwardedFor: string | null | undefined): BotReason | null {
  if (SCANNER_UA.test(userAgent ?? "")) return "scanner";
  if (isAppleIp(firstIp(forwardedFor))) return "apple_mpp";
  return null;
}

/** Clique no link: escaneador pelo navegador declarado ou pela pressa (menos de 10 s depois do envio). */
export function classifyClick(
  userAgent: string | null | undefined,
  tokenCreatedAt: string | null | undefined,
  now: number = Date.now(),
): BotReason | null {
  if (SCANNER_UA.test(userAgent ?? "") || !userAgent) return "scanner";
  const created = tokenCreatedAt ? Date.parse(tokenCreatedAt) : NaN;
  if (!Number.isNaN(created) && now - created < MIN_HUMAN_CLICK_SECONDS * 1000) return "too_fast";
  return null;
}
