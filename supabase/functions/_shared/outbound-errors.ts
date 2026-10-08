/** Erro do destinatario (numero sem WhatsApp etc.): repetir nao adianta e NAO e falha do provedor. */
export function isPermanentRecipientError(msg: string): boolean {
  return /"exists"\s*:\s*false/.test(msg) || /\b131026\b/.test(msg);
}
