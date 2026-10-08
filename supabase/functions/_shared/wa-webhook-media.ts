import type { WaCtx } from "./wa-webhook-types.ts";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
  "video/mp4": "mp4", "application/pdf": "pdf",
};

/** Baixa a midia do cliente pela Evolution, guarda no bucket privado chat-media e grava o caminho em messages.media_url. */
export async function saveInboundMedia(ctx: WaCtx): Promise<void> {
  const { supabase, log, whatsAppConfig, payload, tenantId, conversation, message, contentType } = ctx;
  if (!message || !conversation || !["image", "audio", "video", "document"].includes(contentType)) return;
  try {
    const res = await fetch(`${whatsAppConfig.evolutionApiUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${whatsAppConfig.instanceName}`, {
      method: "POST",
      headers: { apikey: whatsAppConfig.evolutionApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: { id: payload.data.key.id } }, convertToMp4: false }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Evolution ${res.status}`);
    const j = await res.json() as { base64?: string; mimetype?: string; fileName?: string };
    if (!j.base64) throw new Error("sem conteudo");
    const bytes = Uint8Array.from(atob(j.base64), (c) => c.charCodeAt(0));
    if (bytes.length > 16 * 1024 * 1024) throw new Error("arquivo acima de 16 MB");
    const mime = (j.mimetype || "application/octet-stream").split(";")[0];
    const ext = EXT[mime] || (j.fileName?.split(".").pop() ?? "bin");
    const path = `${tenantId}/${conversation.id}/${message.id}.${ext}`;
    const up = await supabase.storage.from("chat-media").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
    await supabase.from("messages").update({ media_url: path, metadata: { ...(message.metadata as Record<string, unknown> | null), media_mime: mime, media_name: j.fileName ?? null } }).eq("id", message.id);
  } catch (e) {
    log.warn("⚠️ Não foi possível guardar a mídia do cliente:", e instanceof Error ? e.message : e);
  }
}
