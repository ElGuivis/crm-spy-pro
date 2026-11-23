// Pós-build: HTML de entrada próprio para os subdomínios de uma loja (ex.: grupovip.lojaoutback.com.br).
// Mesmo app (mesmos scripts), mas título, ícone e prévia de link (og/twitter) da loja; o nginx
// entrega este arquivo quando o Host é o da loja (nginx.conf, `map $host $spa_index`).
// Roda ANTES do prerender (que reescreve dist/index.html com a landing do SpyPro).
// Uso: node scripts/brand-pages.mjs (chamado por `npm run build`).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const template = readFileSync(path.join(dist, "index.html"), "utf8");

const brands = [
  {
    file: "outback-vip.html",
    url: "https://grupovip.lojaoutback.com.br/",
    title: "OUT/BACK! Multimarcas · Pré-venda no grupo VIP",
    description: "Quem é da casa chega primeiro. Bota teu nome na lista e entra no grupo VIP do WhatsApp: o link da pré-venda cai lá antes de abrir pra geral.",
    author: "OUT/BACK! Multimarcas",
    icon: "/outback/favicon.ico",
    appleIcon: "/outback/apple-touch-icon.png",
    image: "https://grupovip.lojaoutback.com.br/outback/og.jpg",
  },
  {
    file: "outback-cadastro.html",
    url: "https://cadastro.lojaoutback.com.br/",
    title: "OUT/BACK! Multimarcas · Cadastro do teu pedido",
    description: "Preenche teus dados que a gente lança o pedido no teu nome e manda tudo certinho pro teu endereço.",
    author: "OUT/BACK! Multimarcas",
    icon: "/outback/favicon.ico",
    appleIcon: "/outback/apple-touch-icon.png",
    image: "https://cadastro.lojaoutback.com.br/outback/og-cadastro.jpg",
  },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

for (const b of brands) {
  let html = template;
  const swap = (re, value, label) => {
    if (!re.test(html)) throw new Error(`brand-pages: ${label} não encontrado em index.html`);
    html = html.replace(re, value);
  };
  swap(/<title>[^<]*<\/title>/, `<title>${esc(b.title)}</title>`, "title");
  swap(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(b.description)}">`, "description");
  swap(/<meta name="author" content="[^"]*" \/>/, `<meta name="author" content="${esc(b.author)}" />`, "author");
  swap(/<link rel="icon" href="[^"]*" sizes="any">/, `<link rel="icon" href="${b.icon}" sizes="any">`, "icon");
  swap(/\s*<link rel="icon" type="image\/png" href="[^"]*">/, "", "icon png");
  swap(/<link rel="apple-touch-icon" href="[^"]*">/, `<link rel="apple-touch-icon" href="${b.appleIcon}">`, "apple icon");
  swap(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${b.image}" />\n    <meta property="og:url" content="${b.url}" />`, "og:image");
  swap(/<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${b.image}" />`, "twitter:image");
  swap(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(b.title)}">`, "og:title");
  swap(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(b.title)}">`, "twitter:title");
  swap(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(b.description)}">`, "og:description");
  swap(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(b.description)}">`, "twitter:description");
  writeFileSync(path.join(dist, b.file), html);
  console.log(`brand-pages: ${b.file}`);
}
