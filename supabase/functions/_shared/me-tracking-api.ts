// Rastreio do Melhor Envio. O endpoint `shipment/tracking` só responde JSON por POST com
// `{ orders: [ids] }`; o GET com `?orders=` devolvia a página HTML do site e o rastreio nunca era atualizado.
// A resposta é `{ [id]: { status, tracking, created_at, paid_at, generated_at, posted_at, delivered_at,
// canceled_at, expired_at } }`: traz as datas de cada etapa, não uma lista de eventos de transporte.

const USER_AGENT = "CRM SpyPro (suporte@spypro.com.br)";

export function meTrackingFetch(apiUrl: string, accessToken: string, meIds: string[]): Promise<Response> {
  return fetch(`${apiUrl}/me/shipment/tracking`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ orders: meIds }),
  });
}

export interface TrackingEvent { title: string; status: string; date: string }

const STEPS: Array<[string, string]> = [
  ["created_at", "Pedido criado"],
  ["paid_at", "Pagamento confirmado"],
  ["generated_at", "Etiqueta gerada"],
  ["posted_at", "Objeto postado"],
  ["delivered_at", "Entregue"],
  ["canceled_at", "Cancelado"],
  ["expired_at", "Expirado"],
];

/** Eventos reais quando a API os trouxer; senão, a linha do tempo montada com as datas das etapas. */
export function trackingEventsFrom(orderTracking: Record<string, unknown> | undefined | null): TrackingEvent[] {
  if (!orderTracking) return [];
  const real = orderTracking.events;
  if (Array.isArray(real) && real.length > 0) return real as TrackingEvent[];
  return STEPS
    .filter(([key]) => typeof orderTracking[key] === "string" && orderTracking[key])
    .map(([key, title]) => ({ title, status: key.replace(/_at$/, ""), date: orderTracking[key] as string }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
