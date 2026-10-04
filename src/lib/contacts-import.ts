/**
 * Importa contatos de uma planilha salva como CSV/TXT (Excel: Arquivo > Salvar como > CSV).
 * Aceita qualquer separador (; , tab), com ou sem cabeçalho, e uma coluna de nome opcional.
 */
export interface ImportedContact {
  email: string;
  name?: string;
}

export interface ImportResult {
  contacts: ImportedContact[];
  /** linhas com e-mail repetido ou já presentes na lista */
  duplicates: number;
  /** células que pareciam e-mail mas são inválidas */
  invalid: number;
}

const EMAIL = /^[^\s@,;"]+@[^\s@,;"]+\.[^\s@,;"]{2,}$/i;

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells.map((c) => c.replace(/^"|"$/g, "").trim());
}

function detectDelimiter(sample: string): string {
  const counts = [";", ",", "\t"].map((d) => [d, (sample.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) ?? []).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts.sort((a, b) => b[1] - a[1])[0][0] : ",";
}

export function parseContactsFile(text: string, existing: Iterable<string> = []): ImportResult {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { contacts: [], duplicates: 0, invalid: 0 };

  const delimiter = detectDelimiter(lines.slice(0, 5).join("\n"));
  const rows = lines.map((l) => splitLine(l, delimiter));

  // cabeçalho: primeira linha sem nenhum e-mail e com uma coluna "e-mail"
  const header = rows[0].map((c) => c.toLowerCase());
  const isEmailHead = (c: string) => /^(e-?mail|email|mail)/.test(c) || /e-?mail$/.test(c);
  const hasHeader = !rows[0].some((c) => EMAIL.test(c)) && header.some(isEmailHead);
  const emailCol = hasHeader ? header.findIndex(isEmailHead) : -1;
  const nameCol = hasHeader ? header.findIndex((c) => /^(nome|name|cliente|primeiro nome|first.?name)/.test(c)) : -1;
  const body = hasHeader ? rows.slice(1) : rows;

  const seen = new Set<string>([...existing].map((e) => e.trim().toLowerCase()));
  const contacts: ImportedContact[] = [];
  let duplicates = 0;
  let invalid = 0;

  for (const row of body) {
    // sem cabeçalho: usa a primeira célula que parece e-mail; com cabeçalho: a coluna indicada
    const idx = emailCol >= 0 ? emailCol : row.findIndex((c) => EMAIL.test(c));
    const raw = idx >= 0 ? (row[idx] ?? "") : "";
    if (!raw) {
      if (row.some((c) => c.includes("@"))) invalid++;
      continue;
    }
    const email = raw.toLowerCase();
    if (!EMAIL.test(email)) { invalid++; continue; }
    if (seen.has(email)) { duplicates++; continue; }
    seen.add(email);
    const nameRaw = nameCol >= 0 ? row[nameCol] : (hasHeader ? "" : row.find((c, i) => i !== idx && c && !EMAIL.test(c) && !/^[\d\s().+-]+$/.test(c)));
    const name = nameRaw?.trim();
    contacts.push(name ? { email, name } : { email });
  }
  return { contacts, duplicates, invalid };
}
