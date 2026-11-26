// Espera "humana" antes da resposta automática do disparo: responder na hora denuncia robô.
// Sorteia o tempo entre o mínimo e o máximo da campanha; no meio marca a mensagem como lida e,
// no fim, mostra "digitando..." pelo tempo proporcional ao texto. Tudo best-effort: falha não impede o envio.
import type { WhatsAppConfig } from "./wa-sender-core.ts";

export const MAX_REPLY_DELAY_S = 120; // a espera roda no waitUntil do webhook (~150 s de parede)

export interface DelayPlan { readAtMs: number; typingMs: number; totalMs: number }

/** Planeja a espera: total sorteado em [min, max] s (teto 120), leitura entre 15% e 40% do total, digitação no fim. */
export function planReplyDelay(minS: number | null | undefined, maxS: number | null | undefined, textLength: number, rand: () => number = Math.random): DelayPlan {
  const lo = Math.max(0, Math.min(MAX_REPLY_DELAY_S, minS ?? 30));
  const hi = Math.max(lo, Math.min(MAX_REPLY_DELAY_S, maxS ?? 90));
  const totalMs = Math.round((lo + rand() * (hi - lo)) * 1000);
  const typingMs = Math.min(totalMs, Math.min(9000, 2500 + textLength * 25));
  const readAtMs = Math.min(totalMs - typingMs, Math.round(totalMs * (0.15 + rand() * 0.25)));
  return { readAtMs: Math.max(0, readAtMs), typingMs, totalMs };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

async function evolution(config: WhatsAppConfig, path: string, body: unknown): Promise<void> {
  const base = config.evolutionApiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/${path}/${config.instanceName}`, {
    method: "POST",
    headers: { apikey: config.evolutionApiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  await res.body?.cancel();
}

export interface InboundKey { remoteJid?: string; id?: string }

/** Executa o plano: espera, marca como lida, espera, "digitando..." (a Evolution segura a chamada pelo `delay`). */
export async function humanPause(config: WhatsAppConfig, phone: string, key: InboundKey | null, plan: DelayPlan, warn: (m: string) => void): Promise<void> {
  await sleep(plan.readAtMs);
  if (key?.remoteJid && key.id) {
    await evolution(config, "chat/markMessageAsRead", { readMessages: [{ remoteJid: key.remoteJid, fromMe: false, id: key.id }] })
      .catch((e) => warn(`markMessageAsRead: ${e}`));
  }
  await sleep(plan.totalMs - plan.readAtMs - plan.typingMs);
  await evolution(config, "chat/sendPresence", { number: phone, presence: "composing", delay: plan.typingMs })
    .catch(async (e) => { warn(`sendPresence: ${e}`); await sleep(plan.typingMs); });
}
