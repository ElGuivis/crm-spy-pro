// Variações de texto ("spintax"): {Oi|Olá|Fala} escolhe uma opção por mensagem.
// Cópia de supabase/functions/_shared/spintax.ts (o servidor é quem sorteia no envio; aqui é só a prévia).
export function resolveSpintax(text: string, rand: () => number = Math.random): string {
  let out = text ?? "";
  const re = /\{([^{}]*\|[^{}]*)\}/;
  for (let i = 0; i < 200 && re.test(out); i++) {
    out = out.replace(re, (_m, body: string) => {
      const opts = body.split("|");
      return opts[Math.floor(rand() * opts.length)] ?? "";
    });
  }
  return out;
}
