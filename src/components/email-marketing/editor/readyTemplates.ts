import type { EmailBlock, EmailContent } from "./types";

export interface ReadyTemplate {
  id: string;
  name: string;
  description: string;
  content: EmailContent;
}

const IMG = (w: number, h: number) => `https://via.placeholder.com/${w}x${h}`; // a verificação antes de enviar barra imagem de exemplo

const header: EmailBlock = { type: "header", logoUrl: "", logoAlt: "Logo", logoWidth: "150", alignment: "center", padding: "24px" };
const social: EmailBlock = {
  type: "social", alignment: "center", iconSize: "32px", padding: "16px",
  platforms: [{ name: "instagram", url: "https://instagram.com" }, { name: "facebook", url: "https://facebook.com" }],
};
const footer: EmailBlock = {
  type: "footer", content: "Sua Empresa<br>Endereço da empresa — Cidade/UF", alignment: "center",
  color: "#999999", fontSize: "13px", padding: "20px", backgroundColor: "#f4f4f4",
};
const unsubscribe: EmailBlock = {
  type: "unsubscribe", text: "Não quer mais receber nossos e-mails?", linkText: "Cancelar inscrição",
  alignment: "center", fontSize: "12px", color: "#999999", padding: "16px",
};
const greeting = (extra: string): EmailBlock => ({
  type: "text", content: `Olá, {{first_name|cliente}}! ${extra}`, alignment: "left", color: "#444444", fontSize: "16px", padding: "10px 24px",
});
const cta = (text: string, color = "#111111"): EmailBlock => ({
  type: "button", text, url: "https://example.com", alignment: "center", buttonColor: color, textColor: "#ffffff",
  buttonPadding: "14px 36px", borderRadius: "6px", fontSize: "16px", padding: "20px",
});
const product = (name: string, price: string): EmailBlock => ({
  type: "product", imageUrl: IMG(300, 300), name, description: "", price, buttonText: "Ver produto", buttonUrl: "https://example.com",
  alignment: "center", padding: "10px", buttonColor: "#111111", buttonTextColor: "#ffffff",
});

export const READY_TEMPLATES: ReadyTemplate[] = [
  {
    id: "promo",
    name: "Promoção",
    description: "Banner, oferta em destaque, 3 produtos e botão.",
    content: {
      globalStyles: { bodyBackground: "#f4f4f4", contentWidth: "600px", contentBackground: "#ffffff" },
      blocks: [
        header,
        { type: "banner", imageUrl: IMG(600, 250), alt: "Promoção", linkUrl: "https://example.com" },
        { type: "heading", text: "Até 30% de desconto", level: "h1", alignment: "center", color: "#111111", fontSize: "32px", padding: "24px 24px 8px" },
        greeting("Selecionamos ofertas só por tempo limitado."),
        { type: "columns-3", columnGap: "10px", padding: "10px 14px", column1: [product("Produto 1", "R$ 99,00")], column2: [product("Produto 2", "R$ 129,00")], column3: [product("Produto 3", "R$ 149,00")] },
        cta("Aproveitar agora"),
        social, footer, unsubscribe,
      ],
    },
  },
  {
    id: "launch",
    name: "Lançamento de produto",
    description: "Imagem grande, destaque do produto e chamada para comprar.",
    content: {
      globalStyles: { bodyBackground: "#f4f4f4", contentWidth: "600px", contentBackground: "#ffffff" },
      blocks: [
        header,
        { type: "heading", text: "Chegou novidade", level: "h1", alignment: "center", color: "#111111", fontSize: "32px", padding: "10px 24px" },
        { type: "image", url: IMG(600, 400), alt: "Novo produto", width: "100%", alignment: "center", padding: "10px 24px" },
        { type: "imagetext", imageUrl: IMG(300, 300), alt: "Detalhe", imagePosition: "left", imageWidthPct: "40", verticalAlign: "middle", title: "Feito para você", text: "Conte aqui o que torna o produto especial. Use **negrito** para destacar o que importa.", alignment: "left", buttonText: "Quero conhecer", buttonUrl: "https://example.com", padding: "20px 24px" },
        cta("Comprar o lançamento"),
        social, footer, unsubscribe,
      ],
    },
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Título, duas matérias com imagem e botão.",
    content: {
      globalStyles: { bodyBackground: "#f4f4f4", contentWidth: "600px", contentBackground: "#ffffff" },
      blocks: [
        header,
        { type: "heading", text: "Novidades do mês", level: "h1", alignment: "left", color: "#111111", fontSize: "28px", padding: "10px 24px" },
        greeting("Veja o que aconteceu por aqui."),
        { type: "imagetext", imageUrl: IMG(300, 300), alt: "Matéria 1", imagePosition: "left", imageWidthPct: "40", verticalAlign: "top", title: "Primeira novidade", text: "Resumo da matéria em duas ou três linhas.", alignment: "left", buttonText: "Ler mais", buttonUrl: "https://example.com", padding: "16px 24px" },
        { type: "divider", color: "#e5e5e5", thickness: "1px", width: "100%", padding: "4px 24px" },
        { type: "imagetext", imageUrl: IMG(300, 300), alt: "Matéria 2", imagePosition: "right", imageWidthPct: "40", verticalAlign: "top", title: "Segunda novidade", text: "Resumo da matéria em duas ou três linhas.", alignment: "left", buttonText: "Ler mais", buttonUrl: "https://example.com", padding: "16px 24px" },
        social, footer, unsubscribe,
      ],
    },
  },
  {
    id: "coupon",
    name: "Cupom de desconto",
    description: "Mensagem curta com cupom em destaque e botão.",
    content: {
      globalStyles: { bodyBackground: "#f4f4f4", contentWidth: "600px", contentBackground: "#ffffff" },
      blocks: [
        header,
        { type: "heading", text: "Um presente para você", level: "h1", alignment: "center", color: "#111111", fontSize: "30px", padding: "16px 24px 6px" },
        greeting("Separamos um desconto especial na sua próxima compra."),
        { type: "coupon", title: "Use o cupom", code: "CUPOM10", description: "10% de desconto — válido por tempo limitado", alignment: "center", padding: "20px 24px" },
        cta("Usar meu cupom"),
        footer, unsubscribe,
      ],
    },
  },
  {
    id: "welcome",
    name: "Boas-vindas",
    description: "Apresentação da marca e três motivos para comprar.",
    content: {
      globalStyles: { bodyBackground: "#f4f4f4", contentWidth: "600px", contentBackground: "#ffffff" },
      blocks: [
        header,
        { type: "heading", text: "Bem-vindo(a)!", level: "h1", alignment: "center", color: "#111111", fontSize: "32px", padding: "16px 24px 6px" },
        greeting("Que bom ter você com a gente. Veja por que vale a pena ficar por perto:"),
        { type: "columns-3", columnGap: "10px", padding: "10px 14px",
          column1: [{ type: "text", content: "**Entrega rápida**\nEnviamos para todo o Brasil.", alignment: "center", color: "#444444", fontSize: "14px", padding: "10px" }],
          column2: [{ type: "text", content: "**Qualidade**\nProdutos selecionados com cuidado.", alignment: "center", color: "#444444", fontSize: "14px", padding: "10px" }],
          column3: [{ type: "text", content: "**Atendimento**\nEstamos aqui para ajudar.", alignment: "center", color: "#444444", fontSize: "14px", padding: "10px" }] },
        cta("Conhecer a loja"),
        social, footer, unsubscribe,
      ],
    },
  },
];
