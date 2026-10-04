/**
 * Corpo e assunto de e-mail em base64 (RFC 2045/2047), sem passar pelo quoted-printable do denomailer.
 *
 * O quotedPrintableEncode do denomailer (1.4.0 e 1.6.0) tem dois defeitos que corrompem o e-mail:
 *  - espaço no fim da linha vira "=20" e o "=" é codificado de novo ("=3d20"): o leitor vê "=20" no texto;
 *  - a quebra a cada 74 caracteres corta no meio de sequências "=c3=a9", e acentos viram lixo.
 * O denomailer repassa sem alterar o que vem em `mimeContent`, então codificamos aqui.
 */

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Texto UTF-8 em base64, linhas de 76 caracteres (CRLF). */
export function base64Body(text: string): string {
  const b64 = toBase64(encoder.encode(text));
  return b64.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

/** Assunto como "encoded-words" RFC 2047 em base64 (cada palavra <= 75 caracteres, sem cortar caractere). */
export function encodeSubject(subject: string): string {
  const clean = subject.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;

  const MAX_BYTES = 45; // 45 bytes -> 60 caracteres base64 + 12 de moldura = 72
  const words: string[] = [];
  let chunk: number[] = [];
  const flush = () => {
    if (chunk.length) words.push(`=?UTF-8?B?${toBase64(Uint8Array.from(chunk))}?=`);
    chunk = [];
  };
  for (const ch of clean) {
    const bytes = encoder.encode(ch);
    if (chunk.length + bytes.length > MAX_BYTES) flush();
    chunk.push(...bytes);
  }
  flush();
  // O denomailer recodifica (e quebra) todo assunto que comece com "=?" ou tenha acento. Um espaço na frente
  // faz o texto passar intacto; o espaço extra depois de "Subject:" é ignorado pelos leitores de e-mail.
  return " " + words.join(" ");
}

export interface SafeMailInput {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

/** Opções do `client.send` do denomailer com assunto e corpo já codificados. */
export function buildSafeMailOptions(input: SafeMailInput): Record<string, unknown> {
  const mimeContent: { mimeType: string; content: string; transferEncoding: string }[] = [
    { mimeType: 'text/plain; charset="utf-8"', content: base64Body(input.text || " "), transferEncoding: "base64" },
  ];
  if (input.html) {
    mimeContent.push({ mimeType: 'text/html; charset="utf-8"', content: base64Body(input.html), transferEncoding: "base64" });
  }
  const options: Record<string, unknown> = {
    from: input.from,
    to: input.to,
    subject: encodeSubject(input.subject),
    mimeContent,
  };
  // O replyTo do denomailer sai errado ("ReplyTo: <>", sem hífen e sem endereço) e os leitores de e-mail ignoram:
  // quem respondia, respondia para o remetente. Vai como cabeçalho Reply-To normal.
  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (input.replyTo && /^[^\s<>@]+@[^\s<>@]+$/.test(input.replyTo.trim())) headers["Reply-To"] = input.replyTo.trim();
  if (Object.keys(headers).length) options.headers = headers;
  return options;
}
