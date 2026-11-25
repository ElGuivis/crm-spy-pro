// Variações de texto ("spintax"): {Oi|Olá|Fala} escolhe uma opção por mensagem.
// Só vira variação o que tem "|" dentro das chaves: {nome} e {primeiro_nome} continuam sendo variáveis.
// Aceita aninhado: {Oi|{Olá|Opa}}. Cópia idêntica em src/lib/spintax.ts (front, para a prévia).
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

/** Troca {nome}, {primeiro_nome} e as colunas extras e depois sorteia as variações. */
export function renderBulkMessage(template: string, name: string | null, variables: Record<string, unknown> | null): string {
  const contactName = name || "";
  let msg = (template ?? "").replace(/{nome}/gi, contactName)
    .replace(/{primeiro_nome}/gi, contactName.split(/\s+/)[0] || "");
  for (const [key, val] of Object.entries(variables || {})) {
    if (key === "nome" || key === "primeiro_nome") continue;
    msg = msg.replace(new RegExp(`\{${key}\}`, "gi"), String(val ?? ""));
  }
  return resolveSpintax(msg);
}
