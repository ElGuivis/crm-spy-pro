/** Erro do destinatario (numero sem WhatsApp etc.): repetir nao adianta e NAO e falha do provedor. */
export function isPermanentRecipientError(msg: string): boolean {
  return /"exists"\s*:\s*false/.test(msg) || /\b131026\b/.test(msg);
}

/** Tempo esgotado ou conexao cortada: nao sabemos se a mensagem saiu. Repetir pode duplicar, entao nao repete. */
export function isAmbiguousSendError(msg: string): boolean {
  return /TimeoutError|AbortError|aborted|timed out|timeout|connection (closed|reset)|unexpected eof/i.test(msg);
}
