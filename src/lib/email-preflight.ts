/**
 * Verificação antes de enviar uma campanha de e-mail.
 * "error" bloqueia o envio (o e-mail sairia quebrado, ilegal ou com lixo de exemplo);
 * "warning" avisa (prejudica entrega ou leitura, mas dá para enviar).
 */
export interface PreflightIssue {
  level: "error" | "warning";
  code: string;
  text: string;
}

export interface PreflightInput {
  subject?: string | null;
  preheader?: string | null;
  html?: string | null;
  hasIntegration: boolean;
  /** estimativa de destinatários (null = ainda não calculada) */
  recipients?: number | null;
}

const KNOWN_VARIABLES = new Set(["first_name", "last_name", "email", "phone", "company", "coupon_code", "unsubscribe_url"]);
const GMAIL_CLIP_BYTES = 102 * 1024;

const countMatches = (s: string, re: RegExp) => (s.match(re) ?? []).length;

export function runPreflight(input: PreflightInput): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const error = (code: string, text: string) => issues.push({ level: "error", code, text });
  const warn = (code: string, text: string) => issues.push({ level: "warning", code, text });

  const subject = (input.subject ?? "").trim();
  const html = input.html ?? "";

  if (!input.hasIntegration) error("no_integration", "A campanha não tem integração de e-mail (SMTP) escolhida. Edite a campanha e selecione uma.");
  if (!subject) error("no_subject", "A campanha está sem assunto.");
  if (input.recipients === 0) error("no_recipients", "A audiência escolhida não tem nenhum destinatário.");

  if (!html.trim()) {
    error("no_html", "A campanha não tem conteúdo salvo. Abra a campanha no editor, confira o e-mail e salve.");
    return issues;
  }

  if (!html.includes("{{unsubscribe_url}}")) {
    error("no_unsubscribe", "Falta o link de descadastro. Adicione o bloco \"Descadastrar\" (é obrigatório por lei e exigido por Gmail e Yahoo).");
  }
  if (/https?:\/\/(www\.)?example\.(com|org)/i.test(html)) {
    error("example_link", "Há links de exemplo (example.com) no e-mail. Troque pelo endereço real.");
  }
  if (/via\.placeholder\.com/i.test(html)) {
    error("placeholder_image", "Há imagens de exemplo (via.placeholder.com) no e-mail. Troque pela imagem real.");
  }

  if (subject.length > 60) warn("long_subject", `Assunto longo (${subject.length} caracteres): no celular ele é cortado. O ideal é até 60.`);
  const letters = subject.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 8 && letters.replace(/[^A-ZÀ-Ý]/g, "").length / letters.length > 0.7) {
    warn("caps_subject", "O assunto está quase todo em MAIÚSCULAS: aumenta a chance de cair no spam.");
  }
  if (countMatches(subject, /!/g) >= 2) warn("exclamations", "O assunto tem várias exclamações: aumenta a chance de cair no spam.");

  if (!(input.preheader ?? "").trim()) {
    warn("no_preheader", "Sem pré-header: na caixa de entrada aparece o começo do e-mail no lugar de um resumo escolhido por você.");
  }

  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const noAlt = images.filter((tag) => !/\balt="[^"]+"/i.test(tag) && !/width="1"[^>]*height="1"/i.test(tag)).length;
  if (noAlt > 0) warn("no_alt", `${noAlt} imagem(ns) sem texto alternativo: quem bloqueia imagens vê um espaço vazio.`);

  const emptyLinks = countMatches(html, /<a\b[^>]*\bhref="#"/gi);
  if (emptyLinks > 0) warn("empty_links", `${emptyLinks} botão(ões) ou link(s) sem endereço: o clique não leva a lugar nenhum.`);

  const bytes = new TextEncoder().encode(html).length;
  if (bytes > GMAIL_CLIP_BYTES) {
    warn("too_big", `E-mail grande (${Math.round(bytes / 1024)} KB): o Gmail corta acima de ~102 KB e esconde o final, inclusive o descadastro.`);
  }

  const visibleText = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  if (images.length > 0 && visibleText.length < 80) {
    warn("image_only", "O e-mail é praticamente só imagem: filtros de spam desconfiam e quem bloqueia imagens não vê nada.");
  }

  const unknown = new Set<string>();
  for (const m of html.matchAll(/\{\{\s*(\w+)\s*(?:\|[^}]*)?\}\}/g)) if (!KNOWN_VARIABLES.has(m[1])) unknown.add(m[1]);
  if (unknown.size > 0) warn("unknown_variable", `Variável desconhecida: ${[...unknown].map((v) => `{{${v}}}`).join(", ")}. Ela vai aparecer escrita no e-mail.`);

  return issues;
}
