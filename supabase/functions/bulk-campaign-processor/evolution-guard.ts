// Proteções do disparo em massa contra restrição do número (Evolution API 2.3.x).
// - estado da instância antes de enviar (não insistir com o número caído/restrito)
// - conferência do número no WhatsApp antes de enviar (mandar para número inexistente é sinal de spam)
// - erro de conexão no envio = pausa a campanha e devolve o contato para a fila (não queima a lista)
// - "digitando..." antes da mensagem (campo `delay` do sendText/sendMedia, em ms)

export type InstanceState = "open" | "close" | "connecting" | "unknown";

export async function getInstanceState(baseUrl: string, apiKey: string, instance: string): Promise<InstanceState> {
  try {
    const res = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`, {
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return "unknown";
    const body = await res.json() as { instance?: { state?: string } };
    const s = body?.instance?.state;
    return s === "open" || s === "close" || s === "connecting" ? s : "unknown";
  } catch {
    return "unknown";
  }
}

/** true = tem WhatsApp, false = não tem, null = não deu para conferir (segue o envio). */
export async function hasWhatsApp(baseUrl: string, apiKey: string, instance: string, number: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${baseUrl}/chat/whatsappNumbers/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: [number] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const list = await res.json() as Array<{ exists?: boolean }>;
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[0]?.exists === true;
  } catch {
    return null;
  }
}

/** Erro de envio causado pela conexão/instância (não é culpa do contato). */
export function isConnectionError(result: unknown): boolean {
  const txt = JSON.stringify(result ?? "").toLowerCase();
  return txt.includes("connection closed") || txt.includes("not connected") ||
    txt.includes("connection lost") || txt.includes("instance does not exist") ||
    txt.includes("timed out") || txt.includes("logged out");
}

/** Tempo de "digitando..." proporcional ao texto: 3 a 9 s, com variação. */
export function typingDelayMs(text: string): number {
  const base = Math.min(9000, 3000 + (text?.length ?? 0) * 15);
  const jitter = Math.floor(Math.random() * 1500);
  return Math.min(9000, base + jitter);
}

export const PAUSE_REASONS = {
  disconnected: "Número desconectado ou restrito pelo WhatsApp. Reconecte e retome quando a restrição acabar.",
  connection_error: "O WhatsApp fechou a conexão durante o envio (provável restrição). Disparo pausado para não queimar a lista.",
} as const;
