import type { EmailBlock, EmailContent, ProductBlock } from "../types";

/** Paleta de um modelo. `heroBg` é a faixa de impacto do topo; `highlight` destaca preço, cupom e selos. */
export interface Palette {
  id: string; label: string;
  outer: string; content: string; text: string; muted: string; card: string; border: string;
  accent: string; onAccent: string; highlight: string;
  heroBg: string; onHero: string; onHeroMuted: string;
}

export interface ProductCard { name: string; imageUrl: string; price: string; oldPrice?: string; url: string }

/** Dados reais da loja usados para preencher o modelo na hora de aplicar. */
export interface TemplateCtx {
  palette: Palette;
  bestsellers: ProductCard[];
  newest: ProductCard[];
  logoUrl?: string;
  brandName?: string;
  storeUrl: string;
  /** pedidos já entregues pela loja (arredondado para baixo), para prova social; 0 = não mostrar */
  orders: number;
  /** data limite de exemplo (hoje + 3 dias), "dd/mm" */
  deadline: string;
}

const lum = (hex: string) => {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Razão de contraste (WCAG) entre duas cores; abaixo de ~3,5 o texto pequeno fica ilegível. */
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** Texto preto ou branco, o que contrastar mais com o fundo. */
export const onColor = (bg: string) => (lum(bg) > 0.4 ? "#0a0a0a" : "#ffffff");

const make = (id: string, label: string, p: Omit<Palette, "id" | "label" | "onAccent" | "onHero" | "onHeroMuted" | "highlight"> & { highlight?: string }): Palette => ({
  id, label, ...p, highlight: p.highlight ?? p.accent, onAccent: onColor(p.accent), onHero: onColor(p.heroBg),
  onHeroMuted: lum(p.heroBg) > 0.4 ? "#52525b" : "#c4c4cc",
});

export const PALETTES: Record<string, Palette> = {
  dark: make("dark", "Escuro (street)", { outer: "#050505", content: "#131315", text: "#f4f4f5", muted: "#a1a1aa", card: "#1c1c20", border: "#2e2e34", accent: "#22c55e", heroBg: "#000000" }),
  light: make("light", "Claro e limpo", { outer: "#f1f2f4", content: "#ffffff", text: "#111827", muted: "#6b7280", card: "#f6f7f9", border: "#e5e7eb", accent: "#111827", highlight: "#dc2626", heroBg: "#111827" }),
  vibrant: make("vibrant", "Vibrante", { outer: "#f4f1ee", content: "#ffffff", text: "#1c1917", muted: "#78716c", card: "#fff7ed", border: "#fed7aa", accent: "#ea580c", heroBg: "#ea580c" }),
  blackfriday: make("blackfriday", "Black Friday", { outer: "#000000", content: "#0d0d0d", text: "#fafafa", muted: "#a3a3a3", card: "#1a1a1a", border: "#333333", accent: "#facc15", heroBg: "#000000" }),
  natal: make("natal", "Natal", { outer: "#f3efe6", content: "#ffffff", text: "#1f2937", muted: "#6b7280", card: "#f8f5ee", border: "#e7dfcc", accent: "#b91c1c", highlight: "#b91c1c", heroBg: "#14532d" }),
  love: make("love", "Romântico", { outer: "#fdf2f4", content: "#ffffff", text: "#2b1218", muted: "#7c5560", card: "#fff1f3", border: "#fbcfd8", accent: "#e11d48", heroBg: "#881337" }),
  gold: make("gold", "Premium (VIP)", { outer: "#0a0a0a", content: "#121212", text: "#f5f0e1", muted: "#a8a08a", card: "#1b1a17", border: "#3a3626", accent: "#d4af37", heroBg: "#000000" }),
};

/** Troca a cor de destaque mantendo o contraste do texto nos botões. */
export function withAccent(p: Palette, accent: string | undefined): Palette {
  if (!accent || !/^#[0-9a-f]{6}$/i.test(accent)) return p;
  return { ...p, accent, onAccent: onColor(accent), highlight: p.highlight === p.accent ? accent : p.highlight, heroBg: p.heroBg === p.accent ? accent : p.heroBg, onHero: p.heroBg === p.accent ? onColor(accent) : p.onHero, onHeroMuted: p.heroBg === p.accent ? (lum(accent) > 0.4 ? "#52525b" : "#fde8d8") : p.onHeroMuted };
}

export const globalStyles = (p: Palette): NonNullable<EmailContent["globalStyles"]> =>
  ({ bodyBackground: p.outer, contentWidth: "600px", contentBackground: p.content, fontFamily: "Arial, Helvetica, sans-serif", linkColor: p.accent });

// ---------- blocos ----------

export const announce = (p: Palette, text: string): EmailBlock => ({
  type: "text", content: text, alignment: "center", color: p.accent === p.heroBg ? p.content : p.onAccent, fontSize: "12px", fontWeight: "bold",
  uppercase: true, letterSpacing: "2px", backgroundColor: p.accent === p.heroBg ? p.text : p.accent, padding: "10px 16px",
});

export const logo = (p: Palette, c: TemplateCtx, bg?: string): EmailBlock =>
  c.logoUrl
    ? { type: "header", logoUrl: c.logoUrl, logoAlt: c.brandName || "Logo", logoWidth: "150", alignment: "center", padding: "26px 20px 14px", backgroundColor: bg ?? p.heroBg }
    : { type: "heading", text: c.brandName || "Sua Marca", level: "h2", alignment: "center", color: bg ? p.text : p.onHero, fontSize: "22px", uppercase: true, letterSpacing: "5px", backgroundColor: bg ?? p.heroBg, padding: "26px 20px 14px" };

interface HeroOpts { eyebrow?: string; title: string; sub?: string; cta?: string; url?: string; titleSize?: string }
/** Faixa de impacto: selo, título grande, apoio e botão. Tudo na mesma cor de fundo para parecer uma peça só. */
export const hero = (p: Palette, c: TemplateCtx, o: HeroOpts): EmailBlock[] => {
  const bg = p.heroBg;
  const out: EmailBlock[] = [];
  if (o.eyebrow) out.push({ type: "text", content: o.eyebrow, alignment: "center", color: contrast(p.highlight, bg) < 3.5 ? p.onHero : p.highlight, fontSize: "12px", fontWeight: "bold", uppercase: true, letterSpacing: "3px", backgroundColor: bg, padding: "18px 24px 0" });
  out.push({ type: "heading", text: o.title, level: "h1", alignment: "center", color: p.onHero, fontSize: o.titleSize || "38px", uppercase: true, lineHeight: "1.08", letterSpacing: "1px", backgroundColor: bg, padding: "12px 28px 10px" });
  if (o.sub) out.push({ type: "text", content: o.sub, alignment: "center", color: p.accent === bg ? p.onHero : p.onHeroMuted, fontSize: "16px", lineHeight: "1.55", backgroundColor: bg, padding: "0 36px 6px" });
  if (o.cta) out.push({ type: "button", text: o.cta, url: o.url || c.storeUrl, alignment: "center", buttonColor: p.accent === bg ? p.onHero : p.accent, textColor: p.accent === bg ? bg : p.onAccent, buttonPadding: "17px 46px", borderRadius: "6px", fontSize: "17px", backgroundColor: bg, padding: "18px 24px 40px" });
  else out.push({ type: "spacer", height: "26px", backgroundColor: bg });
  return out;
};

export const sectionTitle = (p: Palette, title: string, sub?: string): EmailBlock[] => [
  { type: "heading", text: title, level: "h2", alignment: "center", color: p.text, fontSize: "22px", uppercase: true, letterSpacing: "2px", padding: sub ? "34px 24px 4px" : "34px 24px 10px" },
  ...(sub ? [{ type: "text", content: sub, alignment: "center", color: p.muted, fontSize: "15px", padding: "0 32px 12px" } as EmailBlock] : []),
];

export const body = (p: Palette, content: string, align: "left" | "center" = "center"): EmailBlock =>
  ({ type: "text", content, alignment: align, color: p.text, fontSize: "16px", lineHeight: "1.65", padding: "22px 36px 6px" });

export const cta = (p: Palette, c: TemplateCtx, text: string, url?: string, tone: "accent" | "text" = "accent"): EmailBlock => ({
  type: "button", text, url: url || c.storeUrl, alignment: "center",
  buttonColor: tone === "accent" ? p.accent : p.text, textColor: tone === "accent" ? p.onAccent : p.content,
  buttonPadding: "16px 44px", borderRadius: "6px", fontSize: "16px", padding: "20px 24px 30px",
});

export const urgency = (p: Palette, text: string): EmailBlock =>
  ({ type: "text", content: text, alignment: "center", color: p.highlight, fontSize: "14px", fontWeight: "bold", uppercase: true, letterSpacing: "1px", padding: "14px 24px 0" });

export const couponBox = (p: Palette, o: { title?: string; code: string; desc?: string }): EmailBlock => ({
  type: "coupon", title: o.title ?? "Use o cupom", code: o.code, description: o.desc, alignment: "center",
  titleColor: p.muted, codeColor: p.highlight, codeBackground: p.card, borderColor: p.highlight, descriptionColor: p.muted, padding: "26px 36px 8px",
});

/** Três pontos fortes em uma faixa (envio, pagamento, troca). Ajuste ao que a sua loja realmente oferece. */
export const benefits = (p: Palette, items?: [string, string][]): EmailBlock => {
  const list = items ?? [["🚚 Envio", "para todo o Brasil"], ["🔒 Compra segura", "dados protegidos"], ["🔄 Troca fácil", "sem complicação"]];
  const cell = ([a, b]: [string, string]): EmailBlock[] => [{ type: "text", content: `**${a}**\n${b}`, alignment: "center", color: p.text, fontSize: "13px", lineHeight: "1.5", padding: "6px 4px" }];
  return { type: "columns-3", columnGap: "6px", padding: "18px 12px", backgroundColor: p.card, column1: cell(list[0]), column2: cell(list[1]), column3: cell(list[2]) };
};

/** "+5.500 pedidos entregues": prova social calculada dos pedidos reais da loja (some se a loja ainda é pequena). */
export const proof = (p: Palette, c: TemplateCtx): EmailBlock[] => {
  if (c.orders < 200) return [];
  const n = c.orders.toLocaleString("pt-BR");
  return [
    { type: "text", content: "★★★★★", alignment: "center", color: p.highlight, fontSize: "22px", letterSpacing: "4px", padding: "26px 24px 0" },
    { type: "text", content: `**+${n} pedidos** já entregues para clientes em todo o Brasil`, alignment: "center", color: p.text, fontSize: "15px", padding: "4px 24px 14px" },
  ];
};

const PLACEHOLDER: ProductCard = { name: "Nome do produto", imageUrl: "https://via.placeholder.com/300x300", price: "R$ 99,00", url: "https://example.com" };

const card = (p: Palette, pr: ProductCard, big: boolean): ProductBlock => ({
  type: "product", imageUrl: pr.imageUrl, name: pr.name, description: "", price: pr.price, oldPrice: pr.oldPrice, buttonText: "Quero", buttonUrl: pr.url,
  alignment: "center", backgroundColor: p.card, borderRadius: "10px", padding: "12px", imageRadius: "8px",
  nameColor: p.text, nameSize: big ? "15px" : "14px", priceColor: p.highlight, priceSize: big ? "18px" : "17px", oldPriceColor: p.muted,
  buttonColor: p.accent, buttonTextColor: p.onAccent, buttonRadius: "6px", buttonSize: big ? "14px" : "13px", buttonFullWidth: true,
});

/** Grade de produtos (2 por linha, também no celular; use número par). Usa produtos reais; sem produtos, mostra exemplos para editar. */
export const grid = (p: Palette, products: ProductCard[], count: number, cols: 2 | 3 = 2): EmailBlock[] => {
  const list = Array.from({ length: count }, (_, i) => products[i] ?? PLACEHOLDER);
  const rows: EmailBlock[] = [];
  for (let i = 0; i < list.length; i += cols) {
    const cells = list.slice(i, i + cols).map((x) => [card(p, x, cols === 2)]);
    const base = { columnGap: cols === 2 ? "12px" : "8px", padding: "6px 12px" };
    rows.push(cols === 2
      ? { type: "columns-2", ...base, mobileCols: 2, column1: cells[0] ?? [], column2: cells[1] ?? [] }
      : { type: "columns-3", ...base, mobileCols: 2, column1: cells[0] ?? [], column2: cells[1] ?? [], column3: cells[2] ?? [] });
  }
  return rows;
};

export const feature = (p: Palette, pr: ProductCard, o: { title: string; text: string; button: string; right?: boolean }): EmailBlock => ({
  type: "imagetext", imageUrl: pr.imageUrl, alt: pr.name, linkUrl: pr.url, imagePosition: o.right ? "right" : "left", imageWidthPct: "50", imageRadius: "10px",
  verticalAlign: "middle", title: o.title, titleColor: p.text, titleSize: "22px", text: o.text, textColor: p.muted, textSize: "15px", alignment: "left",
  buttonText: o.button, buttonUrl: pr.url, buttonColor: p.accent, buttonTextColor: p.onAccent, buttonRadius: "6px", padding: "22px 24px",
});

export const steps = (p: Palette, items: [string, string][]): EmailBlock => {
  const cell = ([n, t]: [string, string], i: number): EmailBlock[] => [
    { type: "text", content: `**${i + 1}**`, alignment: "center", color: p.highlight, fontSize: "26px", padding: "6px 4px 0" },
    { type: "text", content: `**${n}**\n${t}`, alignment: "center", color: p.text, fontSize: "13px", lineHeight: "1.5", padding: "2px 6px 8px" },
  ];
  return { type: "columns-3", columnGap: "6px", padding: "16px 12px", column1: cell(items[0], 0), column2: cell(items[1], 1), column3: cell(items[2], 2) };
};

export const divider = (p: Palette): EmailBlock => ({ type: "divider", color: p.border, thickness: "1px", width: "100%", padding: "10px 36px" });

/** Rodapé: identificação, endereço (troque o de exemplo) e descadastro (obrigatório). */
export const footer = (p: Palette, c: TemplateCtx): EmailBlock[] => [
  { type: "footer", content: `${c.brandName || "Sua Empresa"}<br>Endereço da empresa — Cidade/UF<br>Você recebeu este e-mail porque se cadastrou em nossa loja.<br>Esta é uma mensagem automática: este endereço não recebe respostas.`, alignment: "center", color: p.muted, fontSize: "12px", backgroundColor: p.content, padding: "32px 28px 8px" },
  { type: "unsubscribe", text: "Não quer mais receber nossos e-mails?", linkText: "Cancelar inscrição", alignment: "center", fontSize: "12px", color: p.muted, backgroundColor: p.content, padding: "6px 24px 30px" },
];

/** O que o modelo sugere para a campanha ao ser aplicado. */
export interface EmailTemplateSuggestion { subject: string; preheader: string; subjects: string[] }

export type TemplateCategory = "vendas" | "relacionamento" | "datas" | "conteudo";

export interface ReadyTemplate {
  id: string;
  category: TemplateCategory;
  name: string;
  /** quando usar */
  occasion: string;
  /** por que este desenho converte (mostrado ao escolher) */
  strategy: string;
  subjects: string[];
  preheader: string;
  /** paleta padrão (o usuário pode trocar) */
  palette: keyof typeof PALETTES;
  build: (c: TemplateCtx) => EmailContent;
}

export const content = (p: Palette, blocks: (EmailBlock | EmailBlock[])[]): EmailContent => ({ globalStyles: globalStyles(p), blocks: blocks.flat() });
