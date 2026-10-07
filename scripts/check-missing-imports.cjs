// Procura imports relativos de edge functions que apontam para arquivo inexistente
// (um deles derrubou o ai-chat em producao: "worker boot error: Module not found").
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "supabase", "functions");
const bad = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return e.name === "node_modules" ? null : walk(p);
  if (!p.endsWith(".ts")) return;
  const src = fs.readFileSync(p, "utf8");
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(p), m[1]))) bad.push(path.relative(root, p) + " -> " + m[1]);
  }
});
walk(root);
if (bad.length) { console.error("Imports quebrados:\n" + bad.join("\n")); process.exit(1); }
console.log("OK: nenhum import relativo quebrado");
