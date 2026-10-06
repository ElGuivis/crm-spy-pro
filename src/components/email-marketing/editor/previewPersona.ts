/** Dados da pessoa usados só na pré-visualização do editor (no envio real o servidor troca as variáveis por destinatário). */
export interface PreviewPerson {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  /** true = cliente real escolhido na busca; false = exemplo */
  real: boolean;
}

export const SAMPLE_PERSON: PreviewPerson = { first_name: "Maria", last_name: "Silva", email: "maria.silva@exemplo.com.br", phone: "(11) 91234-5678", real: false };

/** Monta a pessoa da prévia a partir de um cliente real (nome completo vira nome e sobrenome). */
export function personFromCustomer(c: { name: string | null; email: string | null; phone: string | null }): PreviewPerson {
  const parts = (c.name ?? "").trim().split(/\s+/).filter(Boolean);
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
  return { first_name: cap(parts[0] ?? ""), last_name: parts.slice(1).map(cap).join(" "), email: c.email ?? "", phone: c.phone ?? "", real: true };
}

/** Troca {{first_name}}, {{last_name}}, {{email}} e {{phone}} (com valor padrão {{first_name|você}}); as demais variáveis ficam como estão. */
export function applyPersona(html: string, p: PreviewPerson): string {
  if (!html.includes("{{")) return html;
  const values: Record<string, string> = { first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone };
  return html.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (m, key: string, fallback?: string) => {
    if (!(key in values)) return m;
    return values[key] || fallback?.trim() || "";
  });
}

/** Simulação do modo escuro (como o escurecimento forçado de clientes de e-mail): inverte as cores e devolve as imagens ao normal. */
export function withDarkSimulation(html: string): string {
  const css = "<style>html{filter:invert(1) hue-rotate(180deg);background:#fff}img,video{filter:invert(1) hue-rotate(180deg)}</style>";
  return html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : css + html;
}
