// Pós-build: grava o HTML estático de "/", "/privacidade" e "/termos" em dist/.
// O React substitui o conteúdo de #root ao carregar; quem não roda JS vê o texto pronto.
// Uso: node scripts/prerender.mjs (chamado por `npm run build`, depois do `vite build`).
import { createServer } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const template = readFileSync(path.join(dist, "index.html"), "utf8");

const meta = {
  "/": {
    file: "index.html",
    title: "SpyPro Ads Manager | Gestão de Google Ads e CRM para e-commerce",
    description:
      "SpyPro Ads Manager: ferramenta de gestão e otimização de campanhas do Google Ads, para uso interno da equipe SpyPro. SpyPro: CRM inteligente para e-commerce.",
  },
  "/privacidade": {
    file: "privacidade.html",
    title: "Política de Privacidade | SpyPro",
    description:
      "Política de Privacidade do SpyPro, incluindo o uso dos dados do Google Ads pelo SpyPro Ads Manager.",
  },
  "/termos": {
    file: "termos.html",
    title: "Termos de Serviço | SpyPro",
    description: "Termos de Serviço do SpyPro e do SpyPro Ads Manager.",
  },
};

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const server = await createServer({
  root,
  logLevel: "error",
  appType: "custom",
  // O Node carregaria o build CommonJS do roteador (sem exports nomeados); usar o ESM
  resolve: {
    alias: {
      "react-router-dom": path.join(root, "node_modules/react-router-dom/dist/index.mjs"),
    },
  },
  ssr: { noExternal: ["react-router-dom"] },
  server: { middlewareMode: true },
});

try {
  const { renderRoute, routes } = await server.ssrLoadModule("/src/prerender-entry.tsx");
  for (const route of routes) {
    const m = meta[route];
    if (!m) throw new Error(`Sem metadados para ${route}`);
    const body = renderRoute(route);
    if (!template.includes('<div id="root"></div>')) throw new Error("#root não encontrado em dist/index.html");

    let html = template
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
      .replace(/<html lang="[^"]*"/, '<html lang="pt-BR"')
      .replace(/<title>[^<]*<\/title>/, `<title>${m.title}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeAttr(m.description)}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escapeAttr(m.title)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escapeAttr(m.title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escapeAttr(m.description)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escapeAttr(m.description)}$2`);

    // O index.html vira a página "/" (as demais rotas do app continuam caindo nele; o React assume).
    writeFileSync(path.join(dist, m.file), html);
    console.log(`prerender: ${route} -> dist/${m.file} (${(html.length / 1024).toFixed(1)} KB)`);
  }
} finally {
  await server.close();
}
