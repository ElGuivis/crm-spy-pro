import type { EmailBlock, EmailContent } from "../types";
import { announce, benefits, body, content, couponBox, cta, divider, footer, grid, hero, logo, proof, sectionTitle, urgency, type Palette, type TemplateCtx } from "./kit";

export type RecoveryKind = "cart" | "browse" | "order" | "welcome";

/** E-mail padrão de uma etapa da recuperação. A etapa 3 usa cupom ({{coupon_code}}): ligue o cupom único na etapa. */
export interface RecoveryTemplate {
  id: string; kind: RecoveryKind; step: 1 | 2 | 3;
  name: string;
  /** atraso sugerido em minutos */
  delay: number;
  subject: string; preheader: string;
  usesCoupon: boolean;
  build: (c: TemplateCtx) => EmailContent;
}

const REASON: Record<RecoveryKind, string> = {
  cart: "Você recebeu este e-mail porque deixou itens no carrinho da nossa loja.",
  browse: "Você recebeu este e-mail porque visitou produtos da nossa loja.",
  order: "Você recebeu este e-mail porque iniciou um pedido na nossa loja.",
  welcome: "Você recebeu este e-mail porque se inscreveu na newsletter da nossa loja.",
};

const items = (p: Palette, title: string): EmailBlock => ({ type: "cart-items", title, titleColor: p.text, textColor: p.text, padding: "20px 36px 6px" });
const button = (p: Palette, c: TemplateCtx, text: string): EmailBlock => cta(p, c, text, "{{cart_url}}");
const couponStep = (p: Palette, title: string): EmailBlock => couponBox(p, { title, code: "{{coupon_code}}", desc: "{{coupon_value}} de desconto · vale até {{coupon_expires}}" });

const page = (kind: RecoveryKind, c: TemplateCtx, blocks: (EmailBlock | EmailBlock[])[]) => content(c.palette, [...blocks, footer(c.palette, c, REASON[kind])]);

const STORE = "{{store_url}}";

export const RECOVERY_TEMPLATES: RecoveryTemplate[] = [
  // ---------- carrinho abandonado ----------
  {
    id: "cart-1", kind: "cart", step: 1, name: "Carrinho · lembrete rápido", delay: 60, usesCoupon: false,
    subject: "{{first_name|Ei}}, você esqueceu algo no carrinho", preheader: "Seus itens ainda estão separados. Falta pouco para finalizar.",
    build: (c) => page("cart", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Seu carrinho te espera", title: "Esqueceu algo, {{first_name|você}}?", sub: "Separamos tudo do jeitinho que você deixou. É só finalizar.", cta: "Finalizar minha compra", url: "{{cart_url}}" }),
      items(c.palette, "Os itens que você escolheu"),
      button(c.palette, c, "Voltar ao carrinho"),
      benefits(c.palette),
    ]),
  },
  {
    id: "cart-2", kind: "cart", step: 2, name: "Carrinho · tirar dúvidas e prova social", delay: 1440, usesCoupon: false,
    subject: "{{first_name|Ainda}}, seus itens continuam esperando", preheader: "Compra segura, envio para todo o Brasil e troca fácil.",
    build: (c) => page("cart", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Ainda dá tempo", title: "Seu carrinho continua aqui", sub: "Os produtos podem acabar a qualquer momento. Garanta os seus.", cta: "Finalizar agora", url: "{{cart_url}}" }),
      items(c.palette, "Você escolheu"),
      urgency(c.palette, "Estoque limitado nas peças mais pedidas"),
      button(c.palette, c, "Garantir meus itens"),
      benefits(c.palette),
      proof(c.palette, c),
    ]),
  },
  {
    id: "cart-3", kind: "cart", step: 3, name: "Carrinho · última chance com cupom", delay: 2880, usesCoupon: true,
    subject: "{{first_name|Última chance}}: {{coupon_value}} de desconto no seu carrinho", preheader: "Cupom só seu, com validade. Use antes que expire.",
    build: (c) => page("cart", c, [
      announce(c.palette, "Cupom exclusivo · só para você"),
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Última chamada", title: "{{coupon_value}} para fechar sua compra", sub: "Seu cupom pessoal vale até {{coupon_expires}}.", cta: "Usar meu cupom", url: "{{cart_url}}" }),
      couponStep(c.palette, "Seu cupom pessoal"),
      items(c.palette, "No seu carrinho"),
      button(c.palette, c, "Finalizar com desconto"),
      benefits(c.palette),
    ]),
  },
  // ---------- navegação abandonada ----------
  {
    id: "browse-1", kind: "browse", step: 1, name: "Navegação · ainda de olho", delay: 180, usesCoupon: false,
    subject: "{{first_name|Ei}}, ainda de olho em {{product_name|nossos produtos}}?", preheader: "Vimos que você curtiu. Veja de novo e leve hoje.",
    build: (c) => page("browse", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Você olhou, a gente lembrou", title: "Ainda de olho nisso?", sub: "Estes foram os produtos que chamaram a sua atenção.", cta: "Ver de novo", url: "{{product_url}}" }),
      items(c.palette, "Você viu"),
      benefits(c.palette),
    ]),
  },
  {
    id: "browse-2", kind: "browse", step: 2, name: "Navegação · mais pedidos", delay: 1440, usesCoupon: false,
    subject: "{{first_name|Veja}} o que mais sai na nossa loja", preheader: "Os favoritos dos clientes, escolhidos pelos pedidos reais.",
    build: (c) => page("browse", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Os favoritos", title: "O que todo mundo está levando", sub: "Escolhidos pelos pedidos reais da loja.", cta: "Ver os mais pedidos" }),
      items(c.palette, "Os que você viu"),
      sectionTitle(c.palette, "Mais pedidos", "Por onde a maioria começa"),
      grid(c.palette, c.bestsellers, 4),
      proof(c.palette, c),
    ]),
  },
  {
    id: "browse-3", kind: "browse", step: 3, name: "Navegação · cupom para decidir", delay: 2880, usesCoupon: true,
    subject: "{{first_name|Um empurrãozinho}}: {{coupon_value}} para você decidir", preheader: "Cupom pessoal com validade, para quem ficou na dúvida.",
    build: (c) => page("browse", c, [
      announce(c.palette, "Cupom só para você"),
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Para decidir de vez", title: "{{coupon_value}} no que você viu", sub: "Seu cupom pessoal vale até {{coupon_expires}}.", cta: "Usar meu cupom", url: "{{product_url}}" }),
      couponStep(c.palette, "Seu cupom pessoal"),
      items(c.palette, "Os produtos que você viu"),
      benefits(c.palette),
    ]),
  },
  // ---------- pedido abandonado / não finalizado ----------
  {
    id: "order-1", kind: "order", step: 1, name: "Pedido · falta o pagamento", delay: 30, usesCoupon: false,
    subject: "{{first_name|Seu pedido}}: falta só o pagamento", preheader: "Seu pedido está reservado. Conclua o pagamento para garantir.",
    build: (c) => page("order", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Pedido reservado", title: "Falta só o pagamento, {{first_name|você}}", sub: "Reservamos seus itens. Conclua para garantir o envio.", cta: "Concluir meu pedido", url: "{{cart_url}}" }),
      items(c.palette, "Seu pedido"),
      benefits(c.palette),
    ]),
  },
  {
    id: "order-2", kind: "order", step: 2, name: "Pedido · prazo para pagar", delay: 720, usesCoupon: false,
    subject: "{{first_name|Seu pedido}} pode expirar em breve", preheader: "Os itens podem voltar ao estoque. Conclua enquanto dá tempo.",
    build: (c) => page("order", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Atenção ao prazo", title: "Seu pedido pode expirar", sub: "Se o pagamento não for concluído, os itens voltam para o estoque.", cta: "Pagar agora", url: "{{cart_url}}" }),
      items(c.palette, "Itens reservados"),
      urgency(c.palette, "Sem pagamento, a reserva é liberada"),
      button(c.palette, c, "Concluir pagamento"),
      benefits(c.palette),
      proof(c.palette, c),
    ]),
  },
  {
    id: "order-3", kind: "order", step: 3, name: "Pedido · cupom para fechar", delay: 2880, usesCoupon: true,
    subject: "{{first_name|Último aviso}}: {{coupon_value}} para fechar seu pedido", preheader: "Cupom pessoal para você concluir a compra.",
    build: (c) => page("order", c, [
      announce(c.palette, "Cupom exclusivo · só para você"),
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Não deixe passar", title: "{{coupon_value}} para fechar seu pedido", sub: "Seu cupom pessoal vale até {{coupon_expires}}.", cta: "Usar meu cupom", url: "{{cart_url}}" }),
      couponStep(c.palette, "Seu cupom pessoal"),
      items(c.palette, "Seu pedido"),
      divider(c.palette),
      benefits(c.palette),
    ]),
  },
  // ---------- boas-vindas (nova inscrição na newsletter) ----------
  {
    id: "welcome-1", kind: "welcome", step: 1, name: "Boas-vindas · cupom de primeira compra", delay: 5, usesCoupon: true,
    subject: "{{first_name|Bem-vindo(a)}}, seu cupom de {{coupon_value}} chegou", preheader: "Seu desconto de primeira compra está aqui.",
    build: (c) => page("welcome", c, [
      announce(c.palette, "Cupom de boas-vindas"),
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Bem-vindo(a)", title: "{{coupon_value}} na sua primeira compra", sub: "Que bom ter você na lista! Seu cupom pessoal vale até {{coupon_expires}}.", cta: "Escolher meus produtos", url: STORE }),
      couponStep(c.palette, "Seu cupom de boas-vindas"),
      benefits(c.palette),
      sectionTitle(c.palette, "Os mais pedidos", "Por onde a maioria começa"),
      grid(c.palette, c.bestsellers, 4),
      cta(c.palette, c, "Usar meu cupom agora", STORE),
    ]),
  },
  {
    id: "welcome-2", kind: "welcome", step: 2, name: "Boas-vindas · mais pedidos e prova social", delay: 1440, usesCoupon: false,
    subject: "{{first_name|Veja}} o que mais sai na nossa loja", preheader: "Os favoritos dos clientes, pelos pedidos reais.",
    build: (c) => page("welcome", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Os favoritos", title: "O que todo mundo está levando", sub: "Escolhidos pelos pedidos reais da loja.", cta: "Ver os mais pedidos", url: STORE }),
      proof(c.palette, c),
      grid(c.palette, c.bestsellers, 4),
      benefits(c.palette),
      cta(c.palette, c, "Ver a loja", STORE),
    ]),
  },
  {
    id: "welcome-3", kind: "welcome", step: 3, name: "Boas-vindas · novidades", delay: 2880, usesCoupon: false,
    subject: "{{first_name|Ei}}, olha o que chegou na loja", preheader: "Os lançamentos mais recentes, antes de esgotar.",
    build: (c) => page("welcome", c, [
      logo(c.palette, c),
      hero(c.palette, c, { eyebrow: "Novidades", title: "Chegou coisa nova", sub: "Se você já tem o seu cupom de boas-vindas, é uma boa hora de usar.", cta: "Ver lançamentos", url: STORE }),
      grid(c.palette, c.newest, 4),
      benefits(c.palette),
      cta(c.palette, c, "Ver a loja", STORE),
    ]),
  },
];

export const recoveryTemplatesFor = (kind: RecoveryKind) => RECOVERY_TEMPLATES.filter((t) => t.kind === kind).sort((a, b) => a.step - b.step);
