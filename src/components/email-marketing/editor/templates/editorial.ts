import { body, content, cta, divider, feature, footer, grid, logo, sectionTitle, type ReadyTemplate } from "./kit";

export const EDITORIAL_TEMPLATES: ReadyTemplate[] = [
  {
    id: "newsletter", category: "conteudo", name: "Newsletter / novidades do mês", palette: "light",
    occasion: "Contato regular com a base, sem oferta agressiva: novidades, destaque e produtos.",
    strategy: "Mantém a marca na cabeça do cliente. Um destaque principal, uma segunda matéria e produtos no fim. Um botão por bloco e nenhuma urgência.",
    subjects: ["Novidades do mês, {{first_name|cliente}}", "O que rolou por aqui (e o que vem aí)", "{{first_name|Cliente}}, separamos o melhor do mês para você"],
    preheader: "Novidades, destaques e o que está saindo mais.",
    build: (c) => content(c.palette, [
      logo(c.palette, c, c.palette.content),
      { type: "heading", text: "Novidades do mês", level: "h1", alignment: "left", color: c.palette.text, fontSize: "30px", padding: "10px 28px 4px" },
      body(c.palette, "Olá, {{first_name|cliente}}! Separamos o que mais importou neste mês na loja.", "left"),
      c.newest[0] ? feature(c.palette, c.newest[0], { title: c.newest[0].name, text: `Chegou agora na loja.\n**${c.newest[0].price}**`, button: "Ver produto" }) : [],
      divider(c.palette),
      c.bestsellers[0] ? feature(c.palette, c.bestsellers[0], { title: "O mais pedido", text: `${c.bestsellers[0].name}\n**${c.bestsellers[0].price}**`, button: "Ver produto", right: true }) : [],
      sectionTitle(c.palette, "Mais para você"),
      grid(c.palette, c.bestsellers.slice(1), 4),
      cta(c.palette, c, "Visitar a loja"),
      footer(c.palette, c),
    ]),
  },
];
